import { prisma } from "@/repositories/prisma";

// Once per day, per active project, past 5pm local server time: queues a
// pulse_reminder_check outbox event so the notification worker can fan it out
// to members who haven't submitted yet. Idempotent — checks for an event
// already queued today before creating another. No dedicated cron: called
// from the outbox worker's regular poll (Phase 1 doesn't have a job scheduler).
export async function maybeQueuePulseReminders(): Promise<void> {
  if (new Date().getHours() < 17) return;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });

  for (const { id: projectId } of projects) {
    const existing = await prisma.outboxEvent.findFirst({
      where: {
        eventType: "pulse_reminder_check",
        createdAt: { gte: todayStart },
        payload: { path: ["projectId"], equals: projectId },
      },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.outboxEvent.create({
      data: { eventType: "pulse_reminder_check", payload: { projectId } },
    });
  }
}
