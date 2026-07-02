import { outboxRepository } from "@/repositories/outboxRepository";
import { notificationRepository } from "@/repositories/notificationRepository";
import {
  buildNotifications,
  NOTIFICATION_EVENT_TYPES,
} from "@/workers/notificationWorker";
import { maybeQueuePulseReminders } from "@/workers/pulseReminderScheduler";

const BATCH_SIZE = 50;

// Guards against overlapping drains within a single Node process (the bell poll
// and a cron tick could fire close together).
let draining = false;

// Claims a batch of due notification events, fans each out to Notification rows,
// and marks the event COMPLETED — or re-queues it with backoff on failure.
// Safe to call from a request handler: bounded work, swallows per-event errors.
export async function drainOutbox(): Promise<{ processed: number }> {
  if (draining) return { processed: 0 };
  draining = true;
  try {
    try {
      await maybeQueuePulseReminders();
    } catch (err) {
      console.error("pulse reminder scheduling failed:", err);
    }

    const events = await outboxRepository.claimBatch(
      [...NOTIFICATION_EVENT_TYPES],
      BATCH_SIZE,
    );

    let processed = 0;
    for (const event of events) {
      try {
        const rows = await buildNotifications(event.eventType, event.payload);
        await notificationRepository.createMany(rows);
        await outboxRepository.markCompleted(event.id);
        processed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`outbox event ${event.id} (${event.eventType}) failed:`, err);
        await outboxRepository.markFailed(event, message);
      }
    }
    return { processed };
  } finally {
    draining = false;
  }
}
