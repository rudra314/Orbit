import { projectRepository } from "@/repositories/projectRepository";
import {
  projectMetricsRepository,
  type MetricsSnapshot,
  type MetricsWorkItem,
} from "@/repositories/projectMetricsRepository";
import { permissionService } from "@/services/permissionService";
import { NotFoundError } from "@/services/boardService";
import {
  getActiveSprint,
  daysRemaining,
  sprintProgress,
  openBlockers,
  computeHealth,
  isDone,
  isInProgress,
  CATEGORY_LABEL,
} from "@/lib/projectMetrics";
import type {
  Severity,
  StatusCategory,
  WorkItemType,
  Discipline,
  TestCaseStatus,
} from "@prisma/client";

const DELIVERABLE_HORIZON_DAYS = 30;

const TYPES: WorkItemType[] = ["STORY", "BUG", "TASK", "SPIKE"];
const SEVERITIES: Severity[] = ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "TRIVIAL"];
const STATUS_BUCKETS: StatusCategory[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"];

function countBy<T extends string>(
  keys: T[],
  items: MetricsWorkItem[],
  pick: (i: MetricsWorkItem) => T | null,
): { key: T; count: number }[] {
  const counts = new Map<T, number>(keys.map((k) => [k, 0]));
  for (const i of items) {
    const k = pick(i);
    if (k && counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return keys.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

// Builds the full dashboard widget payload from a single snapshot.
function buildDashboard(snapshot: MetricsSnapshot, now: Date) {
  const items = snapshot.workItems;
  const active = getActiveSprint(snapshot.sprints);
  const progress = sprintProgress(active?.id ?? null, items);
  const health = computeHealth(snapshot, now);

  // Work by status (bucketed by category).
  const total = items.length;
  const workByStatus = STATUS_BUCKETS.map((category) => {
    const count = items.filter((i) => i.status.category === category).length;
    return {
      category,
      label: CATEGORY_LABEL[category],
      count,
      pct: total === 0 ? 0 : Math.round((count / total) * 100),
    };
  });

  const workByType = countBy(TYPES, items, (i) => i.type).map((r) => ({
    type: r.key,
    count: r.count,
  }));

  const workByDiscipline = disciplineBreakdown(items);

  // Open bugs by severity.
  const openBugs = items.filter((i) => i.type === "BUG" && !isDone(i));
  const openBugsBySeverity = countBy(SEVERITIES, openBugs, (i) => i.severity).map(
    (r) => ({ severity: r.key, count: r.count }),
  );

  // Deliverables.
  const deliveredCount = snapshot.deliverables.filter(
    (d) => d.status === "DELIVERED" || d.status === "ACCEPTED",
  ).length;
  const horizon = new Date(now.getTime() + DELIVERABLE_HORIZON_DAYS * 86_400_000);
  const upcomingDeliverables = snapshot.deliverables
    .filter(
      (d) =>
        d.dueDate &&
        d.dueDate >= startOfDay(now) &&
        d.dueDate <= horizon &&
        d.status !== "DELIVERED" &&
        d.status !== "ACCEPTED",
    )
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
    .map((d) => ({
      name: d.name,
      dueDate: d.dueDate!.toISOString(),
      status: d.status,
    }));

  // High-priority work not in any sprint.
  const highPriorityNotInSprint = items.filter(
    (i) =>
      !i.sprintId &&
      !isDone(i) &&
      (i.priority === "CRITICAL" || i.priority === "HIGH"),
  ).length;

  // Test cases by status.
  const testCaseStatus = testCaseBreakdown(snapshot.testCaseGroups);

  // Latest approved report excerpt.
  const latest = snapshot.latestReport;
  const latestReport = latest
    ? {
        title: latest.title,
        excerpt:
          (latest.content as { executiveSummary?: string })?.executiveSummary ?? "",
        approvedAt: latest.approvedAt?.toISOString() ?? null,
      }
    : null;

  return {
    generatedAt: now.toISOString(),
    project: snapshot.project
      ? { name: snapshot.project.name, type: snapshot.project.type }
      : null,
    health,
    keyNumbers: {
      sprintName: active?.name ?? null,
      sprintProgress: {
        done: progress.doneItems,
        total: progress.totalItems,
        pct: progress.pct,
      },
      daysRemaining: daysRemaining(active?.endDate ?? null, now),
      openBlockers: openBlockers(items).length,
      deliverables: { delivered: deliveredCount, total: snapshot.deliverables.length },
    },
    workByStatus,
    workByType,
    workByDiscipline,
    openBugsBySeverity,
    testCaseStatus,
    highPriorityNotInSprint,
    upcomingDeliverables,
    latestReport,
    workByAssignee: assigneeBreakdown(items, active?.id ?? null),
  };
}

function disciplineBreakdown(items: MetricsWorkItem[]) {
  const map = new Map<string, number>();
  for (const i of items) {
    const key = (i.discipline as Discipline | null) ?? "UNASSIGNED";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([discipline, count]) => ({ discipline, count }))
    .sort((a, b) => b.count - a.count);
}

function assigneeBreakdown(items: MetricsWorkItem[], activeSprintId: string | null) {
  const map = new Map<
    string,
    { name: string; inProgress: number; doneThisSprint: number }
  >();
  for (const i of items) {
    const inProg = isInProgress(i);
    const doneThisSprint = isDone(i) && !!activeSprintId && i.sprintId === activeSprintId;
    if (!inProg && !doneThisSprint) continue;
    const key = i.assignee?.id ?? "__unassigned__";
    const row =
      map.get(key) ??
      { name: i.assignee?.name ?? "Unassigned", inProgress: 0, doneThisSprint: 0 };
    if (inProg) row.inProgress++;
    if (doneThisSprint) row.doneThisSprint++;
    map.set(key, row);
  }
  return [...map.values()].sort(
    (a, b) => b.inProgress + b.doneThisSprint - (a.inProgress + a.doneThisSprint),
  );
}

function testCaseBreakdown(
  groups: { status: TestCaseStatus; _count: { _all: number } }[],
) {
  const get = (s: TestCaseStatus) =>
    groups.find((g) => g.status === s)?._count._all ?? 0;
  return {
    active: get("ACTIVE"),
    draft: get("DRAFT"),
    rejected: get("REJECTED"),
    deprecated: get("DEPRECATED"),
    total: groups.reduce((a, g) => a + g._count._all, 0),
  };
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export type DashboardData = ReturnType<typeof buildDashboard>;

export const dashboardService = {
  // Page load: resolve by key, enforce membership (all roles may view).
  async getPageData(projectKey: string, userId: string) {
    const project = await projectRepository.getByKeyForUser(projectKey, userId);
    if (!project) throw new NotFoundError("Project not found.");
    await permissionService.assertProjectMember(userId, project.id);

    const snapshot = await projectMetricsRepository.collect(project.id);
    return {
      project: { id: project.id, key: project.key, name: project.name },
      data: buildDashboard(snapshot, new Date()),
    };
  },

  // Refresh poll: returns just the widget data for an already-authorized member.
  async getDashboardData(projectId: string, userId: string) {
    await permissionService.assertProjectMember(userId, projectId);
    const snapshot = await projectMetricsRepository.collect(projectId);
    if (!snapshot.project) throw new NotFoundError("Project not found.");
    return buildDashboard(snapshot, new Date());
  },

  // Health only (cheap consumers / future badges).
  async getProjectHealth(projectId: string, userId: string) {
    await permissionService.assertProjectMember(userId, projectId);
    const snapshot = await projectMetricsRepository.collect(projectId);
    return computeHealth(snapshot, new Date());
  },
};
