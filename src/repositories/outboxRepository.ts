import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

export type OutboxRow = Prisma.OutboxEventGetPayload<object>;

// Backoff before a failed event is retried (grows with the attempt count).
function nextAttemptAt(retryCount: number) {
  const minutes = Math.min(60, 2 ** retryCount); // 2, 4, 8, … capped at 60m
  return new Date(Date.now() + minutes * 60_000);
}

export const outboxRepository = {
  // Atomically claims up to `limit` due events of the given types: selects the
  // oldest QUEUED rows whose schedule has arrived and flips them to PROCESSING
  // in the same transaction so a second drain can't pick them up.
  claimBatch(eventTypes: string[], limit: number) {
    return prisma.$transaction(async (tx) => {
      const now = new Date();
      const rows = await tx.outboxEvent.findMany({
        where: {
          status: "QUEUED",
          eventType: { in: eventTypes },
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
        },
        orderBy: { createdAt: "asc" },
        take: limit,
      });
      if (rows.length === 0) return [] as OutboxRow[];
      await tx.outboxEvent.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { status: "PROCESSING", startedAt: now },
      });
      return rows;
    });
  },

  markCompleted(id: string) {
    return prisma.outboxEvent.update({
      where: { id },
      data: { status: "COMPLETED", completedAt: new Date(), errorMessage: null },
    });
  },

  // Re-queues with backoff, or moves to DEAD_LETTER once max retries are spent.
  markFailed(row: OutboxRow, error: string) {
    const retryCount = row.retryCount + 1;
    const dead = retryCount >= row.maxRetries;
    return prisma.outboxEvent.update({
      where: { id: row.id },
      data: {
        status: dead ? "DEAD_LETTER" : "QUEUED",
        retryCount,
        errorMessage: error.slice(0, 1000),
        scheduledAt: dead ? row.scheduledAt : nextAttemptAt(retryCount),
        startedAt: null,
      },
    });
  },
};
