import { prisma } from "./prisma";
import type { Prisma, WorkItemType } from "@prisma/client";

// Relations every feed row needs: who did it, and (for project-wide feeds and
// click-through) which item it happened on. Status/assignee/sprint names are NOT
// denormalized here — the panels resolve those ids client-side from project
// context, so renames stay correct.
const activityInclude = {
  user: { select: { id: true, name: true, avatarUrl: true } },
  workItem: { select: { id: true, itemKey: true, title: true, type: true } },
} satisfies Prisma.ActivityLogInclude;

export type ActivityRow = Prisma.ActivityLogGetPayload<{
  include: typeof activityInclude;
}>;

export type ActivityFilters = {
  eventTypes?: string[];
  userId?: string;
  workItemType?: string;
  from?: Date;
  to?: Date;
};

// Writes one activity_logs row inside an existing transaction. Called alongside
// the outbox event at every mutation site so the project feed stays in sync with
// the transactional outbox. metadata is denormalized display context (see callers).
export function logActivity(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    userId: string | null;
    workItemId?: string | null;
    eventType: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  return tx.activityLog.create({
    data: {
      projectId: input.projectId,
      userId: input.userId,
      workItemId: input.workItemId ?? null,
      eventType: input.eventType,
      metadata: input.metadata,
    },
  });
}

// Cursor pagination: callers take `limit + 1` to detect "has more", then pass
// the last row's id back as `cursor`.
function page<T extends { cursor?: string; limit: number }>(opts: T) {
  return {
    take: opts.limit + 1,
    orderBy: { createdAt: "desc" } as const,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  };
}

export const activityRepository = {
  // Item-level history (newest first).
  listForWorkItem(workItemId: string, opts: { limit: number; cursor?: string }) {
    return prisma.activityLog.findMany({
      where: { workItemId },
      include: activityInclude,
      ...page(opts),
    });
  },

  // Project-wide feed with optional filters (newest first).
  listForProject(
    projectId: string,
    filters: ActivityFilters,
    opts: { limit: number; cursor?: string },
  ) {
    const where: Prisma.ActivityLogWhereInput = { projectId };
    if (filters.eventTypes && filters.eventTypes.length > 0) {
      where.eventType = { in: filters.eventTypes };
    }
    if (filters.userId) where.userId = filters.userId;
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }
    if (filters.workItemType) {
      where.workItem = { type: filters.workItemType as WorkItemType };
    }
    return prisma.activityLog.findMany({
      where,
      include: activityInclude,
      ...page(opts),
    });
  },

  // True when a project has never logged any activity (drives the
  // "History begins here" empty state).
  async hasAny(projectId: string) {
    const row = await prisma.activityLog.findFirst({
      where: { projectId },
      select: { id: true },
    });
    return row !== null;
  },
};
