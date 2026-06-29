import { projectRepository } from "@/repositories/projectRepository";
import { weeklyReportRepository } from "@/repositories/weeklyReportRepository";
import {
  projectMetricsRepository,
  type MetricsSnapshot,
  type MetricsWorkItem,
} from "@/repositories/projectMetricsRepository";
import { aiGenerationRepository } from "@/repositories/aiGenerationRepository";
import { permissionService } from "@/services/permissionService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import {
  getActiveSprint,
  daysRemaining,
  sprintProgress,
  openBlockers,
  velocityTrend,
  isDone,
  isInProgress,
} from "@/lib/projectMetrics";
import { getProvider } from "@/lib/llm/providerFactory";
import { LLMError } from "@/lib/llm/errors";
import type { WeeklyReport, ReportStatus, Prisma } from "@prisma/client";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DELIVERABLE_HORIZON_DAYS = 14;

// --- collected data ---------------------------------------------------------

export type ReportData = ReturnType<typeof buildReportData>;

// Live snapshot of the project, the factual basis for a weekly report.
function buildReportData(snapshot: MetricsSnapshot, now: Date) {
  const items = snapshot.workItems;
  const active = getActiveSprint(snapshot.sprints);
  const progress = sprintProgress(active?.id ?? null, items);

  const completedThisWeek = items
    .filter((i) => isDone(i) && now.getTime() - i.updatedAt.getTime() <= WEEK_MS)
    .map((i) => ({ itemKey: i.itemKey, title: i.title, type: i.type }));

  const inProgress = items
    .filter(isInProgress)
    .map((i) => ({
      itemKey: i.itemKey,
      title: i.title,
      assignee: i.assignee?.name ?? null,
    }));

  // Carry-overs: items still in the active sprint, not done, that existed
  // before the sprint started (no per-sprint history exists, so creation time
  // before sprint start is the available proxy).
  const carryOvers = active?.startDate
    ? items
        .filter(
          (i) =>
            i.sprintId === active.id &&
            !isDone(i) &&
            i.createdAt < active.startDate!,
        )
        .map((i) => ({ itemKey: i.itemKey, title: i.title }))
    : [];

  const blockers = openBlockers(items).map((i) => ({
    itemKey: i.itemKey,
    title: i.title,
    blockerReason: i.blockerReason,
  }));

  const highPriorityBugs = items
    .filter(
      (i) =>
        i.type === "BUG" &&
        !isDone(i) &&
        (i.priority === "CRITICAL" || i.priority === "HIGH"),
    )
    .map((i) => ({
      itemKey: i.itemKey,
      title: i.title,
      severity: i.severity,
      priority: i.priority,
    }));

  const horizon = new Date(now.getTime() + DELIVERABLE_HORIZON_DAYS * 24 * 60 * 60 * 1000);
  const upcomingDeliverables = snapshot.deliverables
    .filter(
      (d) =>
        d.dueDate &&
        d.dueDate >= startOfDay(now) &&
        d.dueDate <= horizon &&
        d.status !== "DELIVERED" &&
        d.status !== "ACCEPTED",
    )
    .map((d) => ({ name: d.name, dueDate: d.dueDate!.toISOString() }));

  const teamCapacity = capacityByAssignee(items);

  return {
    generatedAt: now.toISOString(),
    activeSprint: active
      ? {
          name: active.name,
          startDate: active.startDate?.toISOString() ?? null,
          endDate: active.endDate?.toISOString() ?? null,
          goal: active.goal,
          daysRemaining: daysRemaining(active.endDate, now),
        }
      : null,
    sprintProgress: progress,
    completedThisWeek,
    inProgress,
    carryOvers,
    openBlockers: blockers,
    highPriorityBugs,
    upcomingDeliverables,
    teamCapacity,
    velocityTrend: velocityTrend(snapshot.sprints, items, 3),
  };
}

function capacityByAssignee(items: MetricsWorkItem[]) {
  const map = new Map<string, { name: string; itemCount: number }>();
  for (const i of items) {
    if (isDone(i)) continue;
    const key = i.assignee?.id ?? "__unassigned__";
    const name = i.assignee?.name ?? "Unassigned";
    const row = map.get(key) ?? { name, itemCount: 0 };
    row.itemCount++;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.itemCount - a.itemCount);
}

// The four editable narrative sections of a report.
export type ReportContent = {
  executiveSummary: string;
  keyAchievements: string[];
  risksAndBlockers: string[];
  nextWeekFocus: string[];
};

function emptyContent(): ReportContent {
  return {
    executiveSummary: "",
    keyAchievements: [],
    risksAndBlockers: [],
    nextWeekFocus: [],
  };
}

// --- AI summary -------------------------------------------------------------

const AI_SYSTEM_PROMPT =
  "You are a PM writing a weekly project status update for a delivery head. " +
  "Be concise, factual, and highlight risks. Use bullet points. Output ONLY " +
  "valid JSON — no markdown, no explanation.";

function buildAiPrompt(data: ReportData): string {
  return `Here is the live project data for this week as JSON:

${JSON.stringify(data, null, 2)}

Write a weekly status update. Return a JSON object with exactly this shape:
{
  "executiveSummary": "3-4 sentence narrative summary",
  "keyAchievements": ["short bullet", "short bullet"],
  "risksAndBlockers": ["short bullet", "short bullet"],
  "nextWeekFocus": ["short bullet", "short bullet"]
}

Rules:
- executiveSummary is plain prose, 3-4 sentences.
- The three lists hold short, factual bullet strings (no leading dashes).
- Base everything on the data provided. Do not invent items.`;
}

function extractJson(text: string): unknown {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  if (!s.startsWith("{")) {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start !== -1 && end > start) s = s.slice(start, end + 1);
  }
  return JSON.parse(s);
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter((x) => x !== "");
}

function normalizeContent(raw: unknown): ReportContent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const summary = String(r.executiveSummary ?? "").trim();
  if (!summary) return null;
  return {
    executiveSummary: summary,
    keyAchievements: strList(r.keyAchievements),
    risksAndBlockers: strList(r.risksAndBlockers),
    nextWeekFocus: strList(r.nextWeekFocus),
  };
}

// Runs the LLM once to draft the narrative. Returns null on any failure so the
// caller can fall back to an empty (manually-filled) report.
async function generateAiSummary(data: ReportData): Promise<ReportContent | null> {
  try {
    const provider = getProvider();
    const result = await provider.generate(buildAiPrompt(data), AI_SYSTEM_PROMPT);
    return normalizeContent(extractJson(result.text));
  } catch (err) {
    if (err instanceof LLMError) {
      console.warn("[report] AI summary failed, falling back to blank:", err.message);
      return null;
    }
    console.warn("[report] AI summary errored, falling back to blank:", err);
    return null;
  }
}

// --- DTO --------------------------------------------------------------------

function toDto(r: WeeklyReport) {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    aiAssisted: r.aiAssisted,
    content: (r.content as ReportContent) ?? emptyContent(),
    data: (r.sourceData as ReportData) ?? null,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

export type ReportDto = ReturnType<typeof toDto>;

function weekTitle(now: Date): string {
  // Start of the current week (Monday) for a stable "Week of …" label.
  const d = startOfDay(now);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return `Week of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// --- service ----------------------------------------------------------------

export const reportService = {
  // Reports page: history list + permissions.
  async getPageData(projectKey: string, userId: string) {
    const project = await projectRepository.getByKeyForUser(projectKey, userId);
    if (!project) throw new NotFoundError("Project not found.");
    const member = await permissionService.assertProjectMember(userId, project.id);

    const reports = await weeklyReportRepository.listForProject(project.id);
    return {
      project: { id: project.id, key: project.key, name: project.name },
      reports: reports.map(toDto),
      canManage: ["PM", "LEAD"].includes(member.role),
    };
  },

  // Collect the live data only (used internally; exposed for inspection/tests).
  async collectReportData(projectId: string, now = new Date()) {
    const snapshot = await projectMetricsRepository.collect(projectId);
    if (!snapshot.project) throw new NotFoundError("Project not found.");
    return buildReportData(snapshot, now);
  },

  // Generate a new DRAFT report: collect data, draft the AI narrative if AI is
  // enabled, and persist. (PM/LEAD only.)
  async generate(input: { actorUserId: string; projectId: string }) {
    const project = await projectRepository.getByIdForUser(
      input.projectId,
      input.actorUserId,
    );
    if (!project) throw new NotFoundError("Project not found.");
    await permissionService.assertCanManageReports(input.actorUserId, project.id);

    const now = new Date();
    const snapshot = await projectMetricsRepository.collect(project.id);
    const data = buildReportData(snapshot, now);

    const aiConfig = await aiGenerationRepository.getConfig(project.id);
    const aiEnabled = !!aiConfig && aiConfig.aiMode !== "DISABLED";

    let content = emptyContent();
    let aiAssisted = false;
    if (aiEnabled) {
      const ai = await generateAiSummary(data);
      if (ai) {
        content = ai;
        aiAssisted = true;
      }
    }

    const created = await weeklyReportRepository.createDraft({
      projectId: project.id,
      actorUserId: input.actorUserId,
      title: weekTitle(now),
      content: content as unknown as Prisma.InputJsonValue,
      sourceData: data as unknown as Prisma.InputJsonValue,
      aiAssisted,
    });
    return toDto(created);
  },

  // View a single report (any member).
  async getReport(id: string, userId: string) {
    const report = await weeklyReportRepository.findById(id);
    if (!report) throw new NotFoundError("Report not found.");
    await permissionService.assertProjectMember(userId, report.projectId);
    return toDto(report);
  },

  // Save edits to a DRAFT report's narrative (PM/LEAD only).
  async updateContent(id: string, content: unknown, actorUserId: string) {
    const report = await weeklyReportRepository.findById(id);
    if (!report) throw new NotFoundError("Report not found.");
    await permissionService.assertCanManageReports(actorUserId, report.projectId);
    if (report.status !== "DRAFT") {
      throw new ValidationError("Only draft reports can be edited.");
    }
    const next = coerceContent(content);
    const updated = await weeklyReportRepository.update({
      id,
      projectId: report.projectId,
      actorUserId,
      data: { content: next as unknown as Prisma.InputJsonValue },
      eventType: "report_updated",
    });
    return toDto(updated);
  },

  // Approve a report, persisting any final edits and stamping approvedAt.
  async approve(id: string, content: unknown, actorUserId: string) {
    const report = await weeklyReportRepository.findById(id);
    if (!report) throw new NotFoundError("Report not found.");
    await permissionService.assertCanManageReports(actorUserId, report.projectId);
    if (report.status !== "DRAFT") {
      throw new ValidationError("This report has already been approved.");
    }
    const next = coerceContent(content);
    const updated = await weeklyReportRepository.update({
      id,
      projectId: report.projectId,
      actorUserId,
      data: {
        content: next as unknown as Prisma.InputJsonValue,
        status: "APPROVED",
        approvedAt: new Date(),
      },
      eventType: "report_approved",
    });
    return toDto(updated);
  },

  // Archive a report (PM/LEAD only).
  async archive(id: string, actorUserId: string) {
    const report = await weeklyReportRepository.findById(id);
    if (!report) throw new NotFoundError("Report not found.");
    await permissionService.assertCanManageReports(actorUserId, report.projectId);
    const updated = await weeklyReportRepository.update({
      id,
      projectId: report.projectId,
      actorUserId,
      data: { status: "ARCHIVED" satisfies ReportStatus },
      eventType: "report_archived",
    });
    return toDto(updated);
  },
};

// Validates/normalizes a content payload from the editor.
function coerceContent(raw: unknown): ReportContent {
  if (!raw || typeof raw !== "object") {
    throw new ValidationError("Invalid report content.");
  }
  const r = raw as Record<string, unknown>;
  return {
    executiveSummary: String(r.executiveSummary ?? "").trim(),
    keyAchievements: strList(r.keyAchievements),
    risksAndBlockers: strList(r.risksAndBlockers),
    nextWeekFocus: strList(r.nextWeekFocus),
  };
}
