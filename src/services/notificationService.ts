import {
  notificationRepository,
  type NotificationRow,
} from "@/repositories/notificationRepository";
import { drainOutbox } from "@/workers/outboxWorker";

const DEFAULT_LIMIT = 20;

export type NotificationDto = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export type NotificationPage = {
  notifications: NotificationDto[];
  nextCursor: string | null;
};

function toDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  };
}

// Notifications are always scoped to the owning user — every method takes the
// caller's id and the repository filters by it, so there's nothing to authorize
// beyond "you are signed in". (Creation is a system action, done by the worker.)
export const notificationService = {
  // System entry point used by the notification worker.
  async create(
    userId: string,
    projectId: string | null,
    type: string,
    title: string,
    body: string | null,
    link: string | null,
  ) {
    await notificationRepository.createMany([
      { userId, projectId, type, title, body, link },
    ]);
  },

  // Unread badge count. Drains a bounded batch of the outbox first so that —
  // absent a standalone worker process — the 60s bell poll also delivers
  // pending notifications. Drain failures never block the count.
  async getUnread(userId: string): Promise<number> {
    try {
      await drainOutbox();
    } catch (err) {
      console.error("outbox drain failed during unread poll:", err);
    }
    return notificationRepository.countUnread(userId);
  },

  async getForUser(
    userId: string,
    opts: { projectId?: string; limit?: number; cursor?: string } = {},
  ): Promise<NotificationPage> {
    const limit = opts.limit ?? DEFAULT_LIMIT;
    const rows = await notificationRepository.listForUser(userId, {
      projectId: opts.projectId,
      limit,
      cursor: opts.cursor,
    });
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    return {
      notifications: slice.map(toDto),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
    };
  },

  async markRead(notificationId: string, userId: string): Promise<{ id: string }> {
    await notificationRepository.markRead(notificationId, userId);
    return { id: notificationId };
  },

  async markAllRead(userId: string, projectId?: string): Promise<{ count: number }> {
    const res = await notificationRepository.markAllRead(userId, projectId);
    return { count: res.count };
  },
};
