import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

export type NotificationRow = Prisma.NotificationGetPayload<object>;

// Recipients are resolved by the notification worker; the worker writes rows in
// bulk via createMany so a single outbox event fans out in one query.
export type NewNotification = {
  userId: string;
  projectId: string | null;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
};

export const notificationRepository = {
  createMany(rows: NewNotification[]) {
    if (rows.length === 0) return Promise.resolve({ count: 0 });
    return prisma.notification.createMany({
      data: rows.map((r) => ({
        userId: r.userId,
        projectId: r.projectId,
        type: r.type,
        title: r.title,
        body: r.body ?? null,
        link: r.link ?? null,
      })),
    });
  },

  countUnread(userId: string) {
    return prisma.notification.count({ where: { userId, read: false } });
  },

  // Newest first, cursor-paginated (caller over-fetches limit + 1).
  listForUser(
    userId: string,
    opts: { projectId?: string; limit: number; cursor?: string },
  ) {
    return prisma.notification.findMany({
      where: { userId, ...(opts.projectId ? { projectId: opts.projectId } : {}) },
      orderBy: { createdAt: "desc" },
      take: opts.limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
  },

  // Marks a single notification read — scoped to the owner so a user can only
  // touch their own rows.
  markRead(id: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  },

  markAllRead(userId: string, projectId?: string) {
    return prisma.notification.updateMany({
      where: {
        userId,
        read: false,
        ...(projectId ? { projectId } : {}),
      },
      data: { read: true },
    });
  },
};
