import {
  pulseRepository,
  type PulseWithItems,
  type TeamPulseRow,
} from "@/repositories/pulseRepository";
import { projectRepository } from "@/repositories/projectRepository";
import { projectMemberRepository } from "@/repositories/projectMemberRepository";
import { sprintRepository } from "@/repositories/sprintRepository";
import { aiGenerationRepository } from "@/repositories/aiGenerationRepository";
import { notificationService } from "@/services/notificationService";
import { permissionService } from "@/services/permissionService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import { getProvider } from "@/lib/llm/providerFactory";
import { LLMError } from "@/lib/llm/errors";
import { daysRemaining } from "@/lib/projectMetrics";

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 30;

// --- date helpers -------------------------------------------------------

// Builds a UTC-midnight Date for a calendar day, matching the @db.Date column.
// Accepts "YYYY-MM-DD"; defaults to the server's current local calendar date.
function dateOnly(input?: string | null, now = new Date()): Date {
  if (input) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (!m) throw new ValidationError("Invalid date.");
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Pulses may only be filed for today or yesterday (up to 24h back) — never
// further in the past or ever in the future.
function assertAllowedPulseDate(date: Date, now: Date) {
  const today = dateOnly(null, now);
  const yesterday = new Date(today.getTime() - DAY_MS);
  if (date.getTime() !== today.getTime() && date.getTime() !== yesterday.getTime()) {
    throw new ValidationError("You can only submit a pulse for today or yesterday.");
  }
}

function friendlyDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// --- DTOs -----------------------------------------------------------------

function toPulseItemDto(item: PulseWithItems["items"][number]) {
  return {
    id: item.id,
    workItemId: item.workItemId,
    itemKey: item.workItem.itemKey,
    type: item.workItem.type,
    title: item.workItem.title,
    statusName: item.workItem.status.name,
    statusColor: item.workItem.status.color,
    progressNote: item.progressNote,
    isBlocker: item.isBlocker,
    blockerDetail: item.blockerDetail,
    dmResponse: item.dmResponse,
    dmRespondedAt: item.dmRespondedAt ? item.dmRespondedAt.toISOString() : null,
    hoursLogged: item.hoursLogged,
  };
}

function toPulseDto(pulse: PulseWithItems) {
  return {
    id: pulse.id,
    date: isoDate(pulse.date),
    generalNote: pulse.generalNote,
    submittedAt: pulse.submittedAt.toISOString(),
    items: pulse.items.map(toPulseItemDto),
  };
}

export type PulseDto = ReturnType<typeof toPulseDto>;

function toActiveItemDto(item: {
  id: string;
  itemKey: string;
  type: string;
  title: string;
  status: { name: string; category: string; color: string };
}) {
  return {
    id: item.id,
    itemKey: item.itemKey,
    type: item.type,
    title: item.title,
    statusName: item.status.name,
    statusColor: item.status.color,
  };
}

function toTeamPulseDto(p: TeamPulseRow, discipline: string) {
  return {
    userId: p.userId,
    userName: p.user.name,
    avatarUrl: p.user.avatarUrl,
    discipline,
    submittedAt: p.submittedAt.toISOString(),
    generalNote: p.generalNote,
    items: p.items.map(toPulseItemDto),
  };
}

type SprintContext = {
  sprintName: string | null;
  sprintDay: number | null;
  daysRemaining: number | null;
};

async function sprintContext(projectId: string, now: Date): Promise<SprintContext> {
  const active = await sprintRepository.getActive(projectId);
  if (!active) return { sprintName: null, sprintDay: null, daysRemaining: null };
  const sprintDay = active.startDate
    ? Math.max(1, Math.floor((now.getTime() - active.startDate.getTime()) / DAY_MS) + 1)
    : null;
  return {
    sprintName: active.name,
    sprintDay,
    daysRemaining: daysRemaining(active.endDate, now),
  };
}

// --- AI summary -------------------------------------------------------------

const AI_SYSTEM_PROMPT =
  "You are a delivery manager's assistant. Summarize the team's daily updates " +
  "in 3-4 sentences. Be factual and concise. Highlight blockers. Mention " +
  "overall progress. Do not invent details.";

function buildAiPrompt(input: {
  sprintName: string | null;
  daysRemaining: number | null;
  members: {
    name: string;
    discipline: string;
    items: { itemKey: string; progressNote: string; isBlocker: boolean }[];
  }[];
}): string {
  const sprintLine = input.sprintName
    ? `Sprint: ${input.sprintName} (${input.daysRemaining ?? "?"} days remaining)`
    : "No active sprint.";
  const memberLines = input.members
    .map((m) => {
      const items = m.items
        .map((i) => `  - ${i.itemKey}: ${i.progressNote}${i.isBlocker ? " [BLOCKER]" : ""}`)
        .join("\n");
      return `${m.name} (${m.discipline}):\n${items || "  (no items updated)"}`;
    })
    .join("\n\n");
  return `${sprintLine}\n\nTeam updates for today:\n\n${memberLines}`;
}

async function generateAiSummary(input: Parameters<typeof buildAiPrompt>[0]) {
  try {
    const provider = getProvider();
    const result = await provider.generate(buildAiPrompt(input), AI_SYSTEM_PROMPT);
    const text = result.text.trim();
    return text || null;
  } catch (err) {
    if (err instanceof LLMError) {
      console.warn("[pulse] AI summary failed, skipping:", err.message);
      return null;
    }
    console.warn("[pulse] AI summary errored, skipping:", err);
    return null;
  }
}

// --- core (projectId-based; used by API routes and the page wrappers below) --

async function buildPulseForm(projectId: string, userId: string, dateStr?: string) {
  await permissionService.assertProjectMember(userId, projectId);

  const now = new Date();
  const date = dateOnly(dateStr, now);
  assertAllowedPulseDate(date, now);
  const isToday = date.getTime() === dateOnly(null, now).getTime();

  const [pulse, ctx] = await Promise.all([
    pulseRepository.getTodayPulse(projectId, userId, date),
    sprintContext(projectId, now),
  ]);

  // Always resolved (even when already submitted) so "Edit submission" can
  // offer items that only became active after the pulse was first filed in.
  const activeItems = (await pulseRepository.getActiveWorkItems(projectId, userId)).map(
    toActiveItemDto,
  );

  // Offer "Submit for yesterday" only from today's form, once today is
  // already submitted, and only if yesterday doesn't have one yet.
  let canSubmitForYesterday = false;
  const yesterday = new Date(date.getTime() - DAY_MS);
  if (isToday && pulse) {
    const yesterdayPulse = await pulseRepository.getTodayPulse(projectId, userId, yesterday);
    canSubmitForYesterday = !yesterdayPulse;
  }

  return {
    date: isoDate(date),
    dateLabel: friendlyDate(date),
    isToday,
    ...ctx,
    alreadySubmitted: !!pulse,
    pulse: pulse ? toPulseDto(pulse) : null,
    activeItems,
    canSubmitForYesterday,
    yesterdayDate: isoDate(yesterday),
    todayDate: isoDate(dateOnly(null, now)),
  };
}

async function submitPulseCore(input: {
  actorUserId: string;
  projectId: string;
  date?: unknown;
  generalNote?: unknown;
  items: {
    workItemId: unknown;
    progressNote: unknown;
    isBlocker?: unknown;
    blockerDetail?: unknown;
    hoursLogged?: unknown;
  }[];
}) {
  await permissionService.assertCanSubmitPulse(input.actorUserId, input.projectId);

  const items = (input.items ?? [])
    .map((it) => ({
      workItemId: String(it.workItemId ?? ""),
      progressNote: String(it.progressNote ?? "").trim(),
      isBlocker: !!it.isBlocker,
      blockerDetail: it.blockerDetail ? String(it.blockerDetail).trim() || null : null,
      hoursLogged:
        it.hoursLogged === null || it.hoursLogged === undefined || it.hoursLogged === ""
          ? null
          : Number(it.hoursLogged),
    }))
    .filter((it) => it.workItemId && it.progressNote);

  if (items.length === 0) {
    throw new ValidationError("Add a progress note to at least one item.");
  }
  for (const it of items) {
    if (it.hoursLogged !== null && (!Number.isFinite(it.hoursLogged) || it.hoursLogged < 0)) {
      throw new ValidationError("Hours logged must be a positive number.");
    }
  }

  const ids = items.map((it) => it.workItemId);
  const valid = await pulseRepository.validWorkItemIds(input.projectId, ids);
  for (const id of ids) {
    if (!valid.has(id)) throw new ValidationError("One of the selected items was not found.");
  }

  const now = new Date();
  const date = dateOnly(typeof input.date === "string" ? input.date : null, now);
  assertAllowedPulseDate(date, now);
  const existing = await pulseRepository.getTodayPulse(input.projectId, input.actorUserId, date);
  const previousBlockerWorkItemIds = existing
    ? existing.items.filter((i) => i.isBlocker).map((i) => i.workItemId)
    : [];

  const saved = await pulseRepository.submitPulse({
    projectId: input.projectId,
    userId: input.actorUserId,
    date,
    generalNote: input.generalNote ? String(input.generalNote).trim() || null : null,
    items,
    previousBlockerWorkItemIds,
    actorUserId: input.actorUserId,
  });
  return toPulseDto(saved);
}

async function buildTeamDigest(
  projectId: string,
  userId: string,
  dateStr: string | undefined,
  opts: { regenerate?: boolean } = {},
) {
  const member = await permissionService.assertProjectMember(userId, projectId);
  if (opts.regenerate) {
    await permissionService.assertCanManagePulseDigest(userId, projectId);
  }

  const now = new Date();
  const date = dateOnly(dateStr, now);
  const [pulses, unsubmitted, totalMembers, existingDigest, ctx, members] = await Promise.all([
    pulseRepository.getTeamPulses(projectId, date),
    pulseRepository.getUnsubmittedMembers(projectId, date),
    pulseRepository.getProjectMemberCount(projectId),
    pulseRepository.getDigest(projectId, date),
    sprintContext(projectId, now),
    projectMemberRepository.listForProject(projectId),
  ]);
  const disciplineByUserId = new Map(members.map((m) => [m.userId, m.discipline]));

  const blockerItems = pulses.flatMap((p) =>
    p.items.filter((i) => i.isBlocker).map((i) => ({ pulse: p, item: i })),
  );

  let aiSummary = existingDigest?.aiSummary ?? null;
  const aiConfig = await aiGenerationRepository.getConfig(projectId);
  const aiEnabled = !!aiConfig && aiConfig.aiMode !== "DISABLED";
  if (aiEnabled && (opts.regenerate || !aiSummary) && pulses.length > 0) {
    aiSummary = await generateAiSummary({
      sprintName: ctx.sprintName,
      daysRemaining: ctx.daysRemaining,
      members: pulses.map((p) => ({
        name: p.user.name,
        discipline: disciplineByUserId.get(p.userId) ?? "",
        items: p.items.map((i) => ({
          itemKey: i.workItem.itemKey,
          progressNote: i.progressNote,
          isBlocker: i.isBlocker,
        })),
      })),
    });
  }

  await pulseRepository.upsertDigest({
    projectId,
    date,
    aiSummary,
    blockerCount: blockerItems.length,
    submissionCount: pulses.length,
    totalMembers,
  });

  return {
    date: isoDate(date),
    dateLabel: friendlyDate(date),
    ...ctx,
    aiEnabled,
    aiSummary,
    submissionCount: pulses.length,
    totalMembers,
    submissionRate: totalMembers === 0 ? 0 : Math.round((pulses.length / totalMembers) * 100),
    blockers: blockerItems.map((b) => ({
      pulseItemId: b.item.id,
      userId: b.pulse.userId,
      userName: b.pulse.user.name,
      avatarUrl: b.pulse.user.avatarUrl,
      itemKey: b.item.workItem.itemKey,
      itemTitle: b.item.workItem.title,
      blockerDetail: b.item.blockerDetail,
      dmResponse: b.item.dmResponse,
      dmRespondedAt: b.item.dmRespondedAt ? b.item.dmRespondedAt.toISOString() : null,
    })),
    submitted: pulses.map((p) => toTeamPulseDto(p, disciplineByUserId.get(p.userId) ?? "")),
    unsubmitted: unsubmitted.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl,
      discipline: m.discipline,
    })),
    canRespond: ["PM", "LEAD"].includes(member.role),
    canRegenerate: member.role === "PM",
    canSendReminder: member.role === "PM",
    canExport: ["PM", "LEAD"].includes(member.role),
  };
}

async function buildPulseHistory(projectId: string, userId: string) {
  await permissionService.assertProjectMember(userId, projectId);

  const now = new Date();
  const since = new Date(dateOnly(null, now).getTime() - (HISTORY_DAYS - 1) * DAY_MS);

  const [allPulses, totalMembers, blockerDates] = await Promise.all([
    pulseRepository.getAllPulsesSince(projectId, since),
    pulseRepository.getProjectMemberCount(projectId),
    pulseRepository.getBlockerDatesSince(projectId, since),
  ]);

  const byDate = new Map<string, Set<string>>();
  for (const p of allPulses) {
    const key = isoDate(p.date);
    if (!byDate.has(key)) byDate.set(key, new Set());
    byDate.get(key)!.add(p.userId);
  }

  const days: {
    date: string;
    submissionCount: number;
    totalMembers: number;
    hasBlockers: boolean;
    mineSubmitted: boolean;
  }[] = [];
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const d = new Date(since.getTime() + i * DAY_MS);
    const key = isoDate(d);
    const submitters = byDate.get(key) ?? new Set();
    days.push({
      date: key,
      submissionCount: submitters.size,
      totalMembers,
      hasBlockers: blockerDates.has(key),
      mineSubmitted: submitters.has(userId),
    });
  }

  const mySubmitted = days.filter((d) => d.mineSubmitted).length;
  const teamRatePerDay = days.map((d) => (d.totalMembers === 0 ? 0 : d.submissionCount / d.totalMembers));
  const teamAverage =
    teamRatePerDay.length === 0
      ? 0
      : Math.round((teamRatePerDay.reduce((a, b) => a + b, 0) / teamRatePerDay.length) * 100);

  return {
    days,
    mySubmissionRate: {
      submitted: mySubmitted,
      total: days.length,
      pct: days.length === 0 ? 0 : Math.round((mySubmitted / days.length) * 100),
    },
    teamAveragePct: teamAverage,
    daysWithBlockers: days.filter((d) => d.hasBlockers).length,
  };
}

// --- service ----------------------------------------------------------------

export const pulseService = {
  // API core (projectId already authorized-scoped by the route param).
  getOrBuildPulseForm: buildPulseForm,

  async searchProjectItems(projectId: string, userId: string, query: string) {
    await permissionService.assertProjectMember(userId, projectId);
    const q = query.trim();
    if (!q) return { results: [] };
    const results = await pulseRepository.searchProjectItems(projectId, q, 10);
    return { results };
  },

  submitPulse(input: {
    actorUserId: string;
    projectId: string;
    date?: unknown;
    generalNote?: unknown;
    items: {
      workItemId: unknown;
      progressNote: unknown;
      isBlocker?: unknown;
      blockerDetail?: unknown;
      hoursLogged?: unknown;
    }[];
  }) {
    return submitPulseCore(input);
  },

  getTeamDigest: buildTeamDigest,

  async respondToBlocker(pulseItemId: string, response: unknown, actorUserId: string) {
    const ctx = await pulseRepository.findPulseItemContext(pulseItemId);
    if (!ctx) throw new NotFoundError("Pulse update not found.");
    await permissionService.assertCanRespondToPulseBlocker(actorUserId, ctx.pulse.projectId);
    if (!ctx.isBlocker) {
      throw new ValidationError("This update isn't flagged as a blocker.");
    }
    const text = String(response ?? "").trim();
    if (!text) throw new ValidationError("Response cannot be empty.");

    const updated = await pulseRepository.respondToBlocker({
      pulseItemId,
      response: text,
      actorUserId,
    });
    return {
      id: updated.id,
      itemKey: updated.workItem.itemKey,
      dmResponse: updated.dmResponse,
      dmRespondedAt: updated.dmRespondedAt ? updated.dmRespondedAt.toISOString() : null,
    };
  },

  async sendReminder(projectId: string, targetUserId: string, actorUserId: string) {
    await permissionService.assertCanManagePulseDigest(actorUserId, projectId);
    const meta = await projectRepository.meta(projectId);
    if (!meta) throw new NotFoundError("Project not found.");

    await notificationService.create(
      targetUserId,
      projectId,
      "pulse_reminder",
      "Daily pulse reminder",
      "Submit your daily pulse for today — takes under 2 minutes.",
      `/${meta.key}/pulse`,
    );
    return { ok: true };
  },

  getPulseHistory: buildPulseHistory,

  // Markdown export of a day's digest, for pasting into Teams / a sprint call doc.
  async exportDigest(projectId: string, userId: string, dateStr: string | undefined) {
    await permissionService.assertCanExportPulseDigest(userId, projectId);
    const digest = await buildTeamDigest(projectId, userId, dateStr);

    const lines: string[] = [];
    lines.push("---");
    lines.push(
      `ORBIT TEAM DIGEST — ${digest.sprintName ?? "No active sprint"}, ${digest.dateLabel}`,
    );
    lines.push("");
    if (digest.aiSummary) {
      lines.push("AI SUMMARY");
      lines.push(digest.aiSummary);
      lines.push("");
    }
    lines.push(`BLOCKERS (${digest.blockers.length})`);
    if (digest.blockers.length === 0) {
      lines.push("None reported.");
    } else {
      for (const b of digest.blockers) {
        lines.push(`⚠ ${b.userName} | ${b.itemKey}: ${b.blockerDetail ?? ""}`);
      }
    }
    lines.push("");
    lines.push(`TEAM UPDATES (${digest.submissionCount} of ${digest.totalMembers} submitted)`);
    lines.push("");
    for (const p of digest.submitted) {
      lines.push(`${p.userName} (${p.discipline})`);
      for (const it of p.items) {
        const blocked = it.isBlocker ? ` ⚠ BLOCKED: ${it.blockerDetail ?? ""}` : "";
        lines.push(`• ${it.itemKey} ${it.title}: ${it.progressNote}${blocked}`);
      }
      if (p.generalNote) lines.push(`  (${p.generalNote})`);
      lines.push("");
    }
    lines.push("---");
    return { markdown: lines.join("\n") };
  },

  // Sidebar status dot: submitted / pending (before 5pm) / overdue (after 5pm).
  async getSidebarStatus(projectId: string, userId: string) {
    const now = new Date();
    const date = dateOnly(null, now);
    const pulse = await pulseRepository.getTodayPulse(projectId, userId, date);
    if (pulse) return "submitted" as const;
    return now.getHours() >= 17 ? ("overdue" as const) : ("pending" as const);
  },

  // --- page wrappers (projectKey-based; used by the Server Component pages) --

  async getPulsePageData(projectKey: string, userId: string, dateStr?: string) {
    const project = await projectRepository.getByKeyForUser(projectKey, userId);
    if (!project) throw new NotFoundError("Project not found.");
    const form = await buildPulseForm(project.id, userId, dateStr);
    return { project: { id: project.id, key: project.key, name: project.name }, ...form };
  },

  async getDigestPageData(projectKey: string, userId: string, dateStr?: string) {
    const project = await projectRepository.getByKeyForUser(projectKey, userId);
    if (!project) throw new NotFoundError("Project not found.");
    const digest = await buildTeamDigest(project.id, userId, dateStr);
    return { project: { id: project.id, key: project.key, name: project.name }, ...digest };
  },

  async getHistoryPageData(projectKey: string, userId: string) {
    const project = await projectRepository.getByKeyForUser(projectKey, userId);
    if (!project) throw new NotFoundError("Project not found.");
    const history = await buildPulseHistory(project.id, userId);
    return { project: { id: project.id, key: project.key, name: project.name }, ...history };
  },
};
