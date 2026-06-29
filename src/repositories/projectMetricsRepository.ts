import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

// Lean per-item projection that powers most report and dashboard widgets. One
// findMany over the project's work items feeds status/type/discipline/severity
// breakdowns, blockers, capacity, and sprint progress — no per-item follow-ups.
const itemSelect = {
  id: true,
  itemKey: true,
  title: true,
  type: true,
  priority: true,
  severity: true,
  storyPoints: true,
  sprintId: true,
  isBlocked: true,
  blockerReason: true,
  discipline: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: { id: true, name: true } },
  status: { select: { id: true, name: true, category: true } },
} satisfies Prisma.WorkItemSelect;

export type MetricsWorkItem = Prisma.WorkItemGetPayload<{ select: typeof itemSelect }>;

export type MetricsSnapshot = Awaited<
  ReturnType<typeof projectMetricsRepository.collect>
>;

export const projectMetricsRepository = {
  // Pulls everything report/dashboard computations need in a fixed number of
  // queries (run in parallel), avoiding the N+1 trap of per-widget fetches.
  async collect(projectId: string) {
    const [
      project,
      workItems,
      sprints,
      deliverables,
      testCaseGroups,
      members,
      latestReport,
    ] = await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, key: true, name: true, type: true },
      }),
      prisma.workItem.findMany({ where: { projectId }, select: itemSelect }),
      prisma.sprint.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.deliverable.findMany({ where: { projectId } }),
      prisma.testCase.groupBy({
        by: ["status"],
        where: { workItem: { projectId } },
        _count: { _all: true },
      }),
      prisma.projectMember.findMany({
        where: { projectId },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { joinedAt: "asc" },
      }),
      prisma.weeklyReport.findFirst({
        where: { projectId, status: { in: ["APPROVED", "SHARED"] } },
        orderBy: { approvedAt: "desc" },
      }),
    ]);

    return {
      project,
      workItems,
      sprints,
      deliverables,
      testCaseGroups,
      members,
      latestReport,
    };
  },
};
