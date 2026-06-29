import { randomUUID } from "crypto";
import { projectRepository } from "@/repositories/projectRepository";
import { projectMemberRepository } from "@/repositories/projectMemberRepository";
import {
  importRepository,
  type ImportContext,
  type ResolvedImportItem,
} from "@/repositories/importRepository";
import { permissionService } from "@/services/permissionService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import { parseWorkbook, type ParsedSheet } from "@/lib/importParser";
import type { ImportFieldKey } from "@/lib/importFields";
import type { Priority, WorkItemType } from "@prisma/client";

// field key → source column index (omitted when a field is unmapped).
export type ImportMapping = Partial<Record<ImportFieldKey, number>>;

export type DuplicateMode = "skip" | "update" | "new";

// One row pulled out of the file via the column mapping (raw cell strings).
export type MappedRow = Record<ImportFieldKey, string> & { rowIndex: number };

export type RowCategory = "ready" | "warning" | "error" | "duplicate";

export type PreviewRow = MappedRow & {
  category: RowCategory;
  issues: string[];
};

export type ImportPreview = {
  counts: { total: number; ready: number; warnings: number; errors: number; duplicates: number };
  rows: PreviewRow[];
};

export type ImportResult = {
  created: number;
  updated: number;
  skippedEmpty: number; // rows skipped for an empty title
  skippedDuplicate: number; // duplicates skipped (duplicateMode = "skip")
  defaulted: number; // imported but with at least one default applied
};

// --- Coercion / fuzzy matching ---------------------------------------

function resolveType(raw: string): { value: WorkItemType; warn: string | null } {
  const v = raw.trim().toLowerCase();
  if (!v) return { value: "STORY", warn: "Missing type — defaults to STORY." };
  if (v.includes("bug") || v.includes("defect")) return { value: "BUG", warn: null };
  if (v.includes("task") || v.includes("chore")) return { value: "TASK", warn: null };
  if (v.includes("spike") || v.includes("research")) return { value: "SPIKE", warn: null };
  if (v.includes("story") || v.includes("feature")) return { value: "STORY", warn: null };
  return { value: "STORY", warn: `Unrecognized type "${raw}" — defaults to STORY.` };
}

function resolvePriority(raw: string): { value: Priority; warn: string | null } {
  const v = raw.trim().toLowerCase();
  if (!v) return { value: "MEDIUM", warn: null };
  if (v.includes("crit") || v === "p0" || v === "p1") return { value: "CRITICAL", warn: null };
  if (v.includes("high") || v === "p2") return { value: "HIGH", warn: null };
  if (v.includes("low") || v === "p4") return { value: "LOW", warn: null };
  if (v.includes("med") || v === "p3" || v.includes("normal")) return { value: "MEDIUM", warn: null };
  return { value: "MEDIUM", warn: `Unrecognized priority "${raw}" — defaults to MEDIUM.` };
}

function resolveStatus(
  raw: string,
  ctx: ImportContext,
): { value: string; warn: string | null } {
  const ordered = [...ctx.statuses].sort((a, b) => a.displayOrder - b.displayOrder);
  const first = ordered[0];
  const v = raw.trim().toLowerCase();
  if (!v) return { value: first.id, warn: null };
  const exact = ordered.find((s) => s.name.toLowerCase() === v);
  if (exact) return { value: exact.id, warn: null };
  const partial = ordered.find(
    (s) => s.name.toLowerCase().includes(v) || v.includes(s.name.toLowerCase()),
  );
  if (partial) return { value: partial.id, warn: null };
  return {
    value: first.id,
    warn: `Unknown status "${raw}" — defaults to "${first.name}".`,
  };
}

function resolveAssignee(
  raw: string,
  ctx: ImportContext,
): { value: string | null; warn: string | null } {
  const v = raw.trim().toLowerCase();
  if (!v) return { value: null, warn: null };
  const byEmail = ctx.members.find((m) => m.email.toLowerCase() === v);
  if (byEmail) return { value: byEmail.userId, warn: null };
  const byName = ctx.members.find((m) => m.name.toLowerCase() === v);
  if (byName) return { value: byName.userId, warn: null };
  const partial = ctx.members.find((m) => m.name.toLowerCase().includes(v));
  if (partial) return { value: partial.userId, warn: null };
  return { value: null, warn: `No member matches "${raw}" — left unassigned.` };
}

function resolveInt(raw: string): { value: number | null; warn: string | null } {
  const v = raw.trim();
  if (!v) return { value: null, warn: null };
  const n = Number(v);
  if (!Number.isFinite(n)) return { value: null, warn: `Story points "${raw}" isn't a number.` };
  return { value: Math.round(n), warn: null };
}

function resolveFloat(raw: string): { value: number | null; warn: string | null } {
  const v = raw.trim();
  if (!v) return { value: null, warn: null };
  const n = Number(v);
  if (!Number.isFinite(n)) return { value: null, warn: `Estimated hours "${raw}" isn't a number.` };
  return { value: n, warn: null };
}

function cleanStr(raw: string): string | null {
  const t = raw.trim();
  return t === "" ? null : t;
}

function parseLabels(raw: string): string[] {
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

// --- Mapping ----------------------------------------------------------

function mapColumns(rows: string[][], mapping: ImportMapping): MappedRow[] {
  const get = (row: string[], key: ImportFieldKey): string => {
    const col = mapping[key];
    if (col == null) return "";
    return (row[col] ?? "").toString();
  };
  return rows.map((row, i) => ({
    rowIndex: i,
    title: get(row, "title"),
    description: get(row, "description"),
    type: get(row, "type"),
    status: get(row, "status"),
    priority: get(row, "priority"),
    assignee: get(row, "assignee"),
    storyPoints: get(row, "storyPoints"),
    estimatedHours: get(row, "estimatedHours"),
    sprint: get(row, "sprint"),
    epic: get(row, "epic"),
    labels: get(row, "labels"),
    acceptanceCriteria: get(row, "acceptanceCriteria"),
  }));
}

// Resolve a mapped row to the issues + a persistable item. Returns the duplicate
// existing id (if the title already exists) so the caller can categorize/handle.
function analyze(row: MappedRow, ctx: ImportContext, titleIndex: Map<string, string>) {
  const issues: string[] = [];
  const title = row.title.trim();

  const type = resolveType(row.type);
  const priority = resolvePriority(row.priority);
  const status = resolveStatus(row.status, ctx);
  const assignee = resolveAssignee(row.assignee, ctx);
  const points = resolveInt(row.storyPoints);
  const hours = resolveFloat(row.estimatedHours);
  for (const w of [type.warn, priority.warn, status.warn, assignee.warn, points.warn, hours.warn]) {
    if (w) issues.push(w);
  }

  const existingId = title ? titleIndex.get(title.toLowerCase()) ?? null : null;

  const resolved: Omit<ResolvedImportItem, "action" | "existingId"> = {
    title,
    description: cleanStr(row.description),
    type: type.value,
    statusId: status.value,
    priority: priority.value,
    assigneeId: assignee.value,
    storyPoints: points.value,
    estimatedHours: hours.value,
    acceptanceCriteria: cleanStr(row.acceptanceCriteria),
    epicTitle: cleanStr(row.epic),
    sprintName: cleanStr(row.sprint),
    labelNames: parseLabels(row.labels),
  };

  return { title, issues, existingId, resolved };
}

// --- Service ----------------------------------------------------------

export const importService = {
  // Project + permission context for the import page (membership enforced).
  async getPageContext(projectKey: string, userId: string) {
    const project = await projectRepository.getByKeyForUser(projectKey, userId);
    if (!project) throw new NotFoundError("Project not found.");
    const member = await projectMemberRepository.find(project.id, userId);
    return {
      project: { id: project.id, key: project.key, name: project.name },
      canImport: !!member && ["PM", "LEAD"].includes(member.role),
    };
  },

  // Parse an uploaded file into sheets (PM/LEAD only).
  async parseFile(input: {
    actorUserId: string;
    projectId: string;
    data: Uint8Array;
  }): Promise<{ sheets: ParsedSheet[] }> {
    await this.assertProject(input.projectId, input.actorUserId);
    let sheets: ParsedSheet[];
    try {
      sheets = parseWorkbook(input.data);
    } catch {
      throw new ValidationError("Could not read that file. Is it a valid .xlsx, .xls, or .csv?");
    }
    if (sheets.every((s) => s.rowCount === 0)) {
      throw new ValidationError("No data rows found in the file.");
    }
    return { sheets };
  },

  // Map + validate + detect duplicates for the preview step (PM/LEAD only).
  async buildPreview(input: {
    actorUserId: string;
    projectId: string;
    rows: string[][];
    mapping: ImportMapping;
  }): Promise<ImportPreview> {
    await this.assertProject(input.projectId, input.actorUserId);
    if (input.mapping.title == null) {
      throw new ValidationError("Map a column to Title before continuing.");
    }
    const ctx = await importRepository.loadContext(input.projectId);
    const titleIndex = new Map(ctx.titles.map((t) => [t.title.toLowerCase(), t.id]));

    const mapped = mapColumns(input.rows, input.mapping);
    const rows: PreviewRow[] = mapped.map((row) => {
      const { title, issues, existingId } = analyze(row, ctx, titleIndex);
      let category: RowCategory;
      if (!title) {
        category = "error";
        issues.unshift("Empty title — this row will be skipped.");
      } else if (existingId) {
        category = "duplicate";
      } else {
        category = issues.length > 0 ? "warning" : "ready";
      }
      return { ...row, category, issues };
    });

    const counts = {
      total: rows.length,
      ready: rows.filter((r) => r.category === "ready").length,
      warnings: rows.filter((r) => r.category === "warning").length,
      errors: rows.filter((r) => r.category === "error").length,
      duplicates: rows.filter((r) => r.category === "duplicate").length,
    };
    return { counts, rows };
  },

  // Import one chunk of mapped rows (PM/LEAD only). Re-resolves server-side so
  // the file's raw rows remain the single source of truth.
  async importBatch(input: {
    actorUserId: string;
    projectId: string;
    batchId: string;
    rows: MappedRow[];
    duplicateMode: DuplicateMode;
  }): Promise<ImportResult> {
    await this.assertProject(input.projectId, input.actorUserId);
    const ctx = await importRepository.loadContext(input.projectId);
    const titleIndex = new Map(ctx.titles.map((t) => [t.title.toLowerCase(), t.id]));

    const items: ResolvedImportItem[] = [];
    let skippedEmpty = 0;
    let skippedDuplicate = 0;
    let defaulted = 0;

    for (const row of input.rows) {
      const { title, issues, existingId, resolved } = analyze(row, ctx, titleIndex);
      if (!title) {
        skippedEmpty++;
        continue;
      }
      if (existingId) {
        if (input.duplicateMode === "skip") {
          skippedDuplicate++;
          continue;
        }
        if (input.duplicateMode === "update") {
          items.push({ ...resolved, action: "update", existingId });
          if (issues.length > 0) defaulted++;
          continue;
        }
        // "new": fall through and create a fresh item.
      }
      items.push({ ...resolved, action: "create", existingId: null });
      if (issues.length > 0) defaulted++;
    }

    if (items.length === 0) {
      return { created: 0, updated: 0, skippedEmpty, skippedDuplicate, defaulted: 0 };
    }

    const { created, updated } = await importRepository.importBatch({
      projectId: input.projectId,
      actorUserId: input.actorUserId,
      batchId: input.batchId,
      items,
    });

    return { created, updated, skippedEmpty, skippedDuplicate, defaulted };
  },

  // A fresh batch id for an import run.
  newBatchId() {
    return randomUUID();
  },

  // Resolve + authorize the project for an import action.
  async assertProject(projectId: string, userId: string) {
    const project = await projectRepository.getByIdForUser(projectId, userId);
    if (!project) throw new NotFoundError("Project not found.");
    await permissionService.assertCanImport(userId, projectId);
    return project;
  },
};
