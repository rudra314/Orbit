import {
  auditRepository,
  type AuditFilters,
  type AuditRow,
} from "@/repositories/auditRepository";
import { workItemRepository } from "@/repositories/workItemRepository";
import { projectRepository } from "@/repositories/projectRepository";
import { permissionService, PermissionError } from "@/services/permissionService";
import { NotFoundError } from "@/services/boardService";

const DEFAULT_LIMIT = 30;

export type AuditEntry = {
  id: string;
  createdAt: string;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
  action: string;
  entityType: string;
  entityId: string;
  entityKey: string | null; // itemKey when the entity is a work item
  oldValue: unknown;
  newValue: unknown;
};

export type AuditPage = {
  entries: AuditEntry[];
  nextCursor: string | null;
};

// Audit is org-scoped in the schema (no projectId column). For the pilot — one
// project per org — the project audit page surfaces the owning org's trail.
async function resolveOrg(projectId: string, actorUserId: string) {
  const project = await projectRepository.getByIdForUser(projectId, actorUserId);
  if (!project) throw new NotFoundError("Project not found.");
  return project;
}

// Maps rows to entries, resolving work-item keys in one batched query.
async function toEntries(rows: AuditRow[]): Promise<AuditEntry[]> {
  const workItemIds = rows
    .filter((r) => r.entityType === "WorkItem")
    .map((r) => r.entityId);
  const keyById = new Map(
    (await workItemRepository.keysByIds([...new Set(workItemIds)])).map((w) => [
      w.id,
      w.itemKey,
    ]),
  );

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    actor: r.user
      ? { id: r.user.id, name: r.user.name, avatarUrl: r.user.avatarUrl }
      : null,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    entityKey: r.entityType === "WorkItem" ? keyById.get(r.entityId) ?? null : null,
    oldValue: r.oldValue ?? null,
    newValue: r.newValue ?? null,
  }));
}

function parseFilters(f: {
  action?: string;
  userId?: string;
  entityType?: string;
  from?: string;
  to?: string;
}): AuditFilters {
  return {
    action: f.action || undefined,
    userId: f.userId || undefined,
    entityType: f.entityType || undefined,
    from: f.from ? new Date(f.from) : undefined,
    to: f.to ? new Date(f.to) : undefined,
  };
}

export const auditService = {
  // PM and LEAD only.
  async getForProject(
    projectId: string,
    actorUserId: string,
    filters: {
      action?: string;
      userId?: string;
      entityType?: string;
      from?: string;
      to?: string;
    } = {},
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<
    AuditPage & {
      actors: { id: string; name: string }[];
      canExport: boolean;
    }
  > {
    const project = await resolveOrg(projectId, actorUserId);
    const member = await permissionService.assertProjectRole(
      actorUserId,
      project.id,
      "LEAD",
    );

    const limit = opts.limit ?? DEFAULT_LIMIT;
    const [rows, actors] = await Promise.all([
      auditRepository.list(project.orgId, parseFilters(filters), {
        limit,
        cursor: opts.cursor,
      }),
      auditRepository.actorsForOrg(project.orgId),
    ]);

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    return {
      entries: await toEntries(slice),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
      actors,
      canExport: member.role === "PM",
    };
  },

  // PM only. Returns a CSV document of the (filtered) audit trail.
  async exportCsv(
    projectId: string,
    actorUserId: string,
    filters: {
      action?: string;
      userId?: string;
      entityType?: string;
      from?: string;
      to?: string;
    } = {},
  ): Promise<string> {
    const project = await resolveOrg(projectId, actorUserId);
    const member = await permissionService.assertProjectRole(
      actorUserId,
      project.id,
      "LEAD",
    );
    if (member.role !== "PM") {
      throw new PermissionError("Only the PM can export the audit log.");
    }

    const rows = await auditRepository.listAll(project.orgId, parseFilters(filters));
    const entries = await toEntries(rows);
    return toCsv(entries);
  },
};

function csvCell(value: unknown): string {
  const s =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  // Quote and escape per RFC 4180.
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(entries: AuditEntry[]): string {
  const header = [
    "Timestamp",
    "Actor",
    "Action",
    "Entity Type",
    "Entity",
    "Old Value",
    "New Value",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const e of entries) {
    lines.push(
      [
        e.createdAt,
        e.actor?.name ?? "System",
        e.action,
        e.entityType,
        e.entityKey ?? e.entityId,
        e.oldValue,
        e.newValue,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
}
