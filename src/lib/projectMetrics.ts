// Pure computations over a project metrics snapshot, shared by reportService
// and dashboardService. No DB access — every function takes already-fetched
// rows so the two features compute consistently from the same source.
import type { Sprint, StatusCategory } from "@prisma/client";
import type {
  MetricsSnapshot,
  MetricsWorkItem,
} from "@/repositories/projectMetricsRepository";

const DAY_MS = 24 * 60 * 60 * 1000;

export function isDone(item: MetricsWorkItem): boolean {
  return item.status.category === "COMPLETED";
}

export function isInProgress(item: MetricsWorkItem): boolean {
  return item.status.category === "IN_PROGRESS";
}

// The active sprint, or null if none is running.
export function getActiveSprint(sprints: Sprint[]): Sprint | null {
  return sprints.find((s) => s.status === "ACTIVE") ?? null;
}

// Whole days from `now` until `end` (0 if past). null when there's no end date.
export function daysRemaining(end: Date | null, now: Date): number | null {
  if (!end) return null;
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
}

// Fraction (0–1) of the sprint window that has elapsed — used to judge whether
// progress is keeping pace. null when the sprint has no start/end dates.
export function sprintElapsedFraction(
  sprint: Sprint | null,
  now: Date,
): number | null {
  if (!sprint?.startDate || !sprint?.endDate) return null;
  const total = sprint.endDate.getTime() - sprint.startDate.getTime();
  if (total <= 0) return null;
  const elapsed = now.getTime() - sprint.startDate.getTime();
  return Math.min(1, Math.max(0, elapsed / total));
}

export type SprintProgress = {
  totalItems: number;
  doneItems: number;
  totalPoints: number;
  donePoints: number;
  pct: number; // by item count, 0–100
};

export function sprintProgress(
  sprintId: string | null,
  items: MetricsWorkItem[],
): SprintProgress {
  const inSprint = sprintId
    ? items.filter((i) => i.sprintId === sprintId)
    : [];
  const doneItems = inSprint.filter(isDone);
  const totalPoints = sum(inSprint.map((i) => i.storyPoints ?? 0));
  const donePoints = sum(doneItems.map((i) => i.storyPoints ?? 0));
  return {
    totalItems: inSprint.length,
    doneItems: doneItems.length,
    totalPoints,
    donePoints,
    pct: inSprint.length === 0 ? 0 : Math.round((doneItems.length / inSprint.length) * 100),
  };
}

export function openBlockers(items: MetricsWorkItem[]): MetricsWorkItem[] {
  return items.filter((i) => i.isBlocked && !isDone(i));
}

// Story points completed in the last `n` finished sprints, newest last. Points
// come from items still attached to the sprint that are in a Done column. There
// is no per-sprint completion history in the schema, so this reflects the
// current state of each completed sprint's items.
export function velocityTrend(
  sprints: Sprint[],
  items: MetricsWorkItem[],
  n: number,
): { sprintName: string; points: number }[] {
  const completed = sprints
    .filter((s) => s.status === "COMPLETED")
    .sort((a, b) => endTime(a) - endTime(b))
    .slice(-n);
  return completed.map((s) => ({
    sprintName: s.name,
    points: sum(
      items
        .filter((i) => i.sprintId === s.id && isDone(i))
        .map((i) => i.storyPoints ?? 0),
    ),
  }));
}

export type HealthLevel = "RED" | "AMBER" | "GREEN";

export type Health = {
  level: HealthLevel;
  reasons: string[];
};

// Overall delivery health. RED dominates AMBER dominates GREEN.
//  RED   — a blocker has been open > 3 days, or the active sprint is > 20% behind
//  AMBER — any open blocker, or velocity dropped > 30% vs the prior average
//  GREEN — otherwise
// "Open > 3 days" uses the item's updatedAt as a proxy for when it was blocked,
// since the schema has no dedicated blockedAt timestamp.
export function computeHealth(snapshot: MetricsSnapshot, now: Date): Health {
  const reasons: string[] = [];
  const items = snapshot.workItems;
  const blockers = openBlockers(items);

  const staleBlockers = blockers.filter(
    (b) => now.getTime() - b.updatedAt.getTime() > 3 * DAY_MS,
  );

  const active = getActiveSprint(snapshot.sprints);
  const progress = active ? sprintProgress(active.id, items) : null;
  const elapsed = sprintElapsedFraction(active, now);
  let sprintBehindPct = 0;
  if (progress && elapsed !== null && progress.totalItems > 0) {
    sprintBehindPct = Math.round((elapsed * 100) - progress.pct);
  }

  const velocity = velocityTrend(snapshot.sprints, items, 4);
  let velocityDrop = 0;
  if (velocity.length >= 2) {
    const latest = velocity[velocity.length - 1].points;
    const prior = velocity.slice(0, -1);
    const avgPrior = sum(prior.map((v) => v.points)) / prior.length;
    if (avgPrior > 0) velocityDrop = Math.round(((avgPrior - latest) / avgPrior) * 100);
  }

  let level: HealthLevel = "GREEN";

  if (staleBlockers.length > 0) {
    level = "RED";
    reasons.push(
      `${staleBlockers.length} blocker${staleBlockers.length > 1 ? "s" : ""} open more than 3 days`,
    );
  }
  if (sprintBehindPct > 20) {
    level = "RED";
    reasons.push(`Sprint is ${sprintBehindPct}% behind schedule`);
  }

  if (level !== "RED") {
    if (blockers.length > 0) {
      level = "AMBER";
      reasons.push(
        `${blockers.length} open blocker${blockers.length > 1 ? "s" : ""}`,
      );
    }
    if (velocityDrop > 30) {
      level = "AMBER";
      reasons.push(`Velocity dropped ${velocityDrop}% vs recent average`);
    }
  }

  if (reasons.length === 0) reasons.push("No active risks detected");

  return { level, reasons };
}

// --- helpers ---------------------------------------------------------------

export function sum(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}

function endTime(s: Sprint): number {
  return (s.endDate ?? s.createdAt).getTime();
}

export const CATEGORY_LABEL: Record<StatusCategory, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Done",
  CANCELLED: "Cancelled",
};
