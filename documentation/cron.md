# Cron / Background Work

**Headline finding: there is no actual scheduler in this system.** All three files in `src/workers/` contain correctly-written, idempotent processing logic, but none of them are invoked by a cron job, a queue consumer, `node-cron`, a serverless cron config, or any other independent trigger. They only run as a side effect of an authenticated user's browser polling the notification-bell endpoint. This is the single most important operational fact for whoever runs the Phase 1 pilot.

## Inventory

| Job | "Schedule" | Function | Reads/writes | Idempotency | Real trigger |
|---|---|---|---|---|---|
| Outbox drain | none (event-driven, opportunistic) | `outboxWorker.drainOutbox()` | claims `QUEUED` `OutboxEvent` rows (up to 50/batch, filtered to `NOTIFICATION_EVENT_TYPES`) → `Notification` rows | `claimBatch` atomically flips `QUEUED→PROCESSING` inside its own transaction (no double-claim within a single DB); a module-level `draining` boolean prevents re-entrant overlap **within one Node process only** — provides no cross-instance lock if the app is ever horizontally scaled | Called from `notificationService.getUnread(userId)`, which backs `GET /api/v1/notifications/unread-count`, which `NotificationBell.tsx` polls every 60s from any signed-in browser tab |
| Notification building | none | `notificationWorker.buildNotifications()` | pure function, reads `WorkItem`/`WorkflowStatus`/`User`/`Sprint`/`ProjectMember`/`Project` directly via `prisma.*` (bypasses the repository layer — the one layering exception in the codebase), writes via `notificationRepository.createMany` | relies on the outbox row's own state machine; no idempotency key on `Notification` itself — if a handler throws mid-batch after partially inserting notifications, a retry could duplicate rows | invoked only from inside `drainOutbox` |
| Pulse reminder check | intended: daily after 5pm local server time | `pulseReminderScheduler.maybeQueuePulseReminders()` | gates on `new Date().getHours() >= 17`; de-dupes per-project-per-day by checking for an existing `pulse_reminder_check` outbox event before creating a new one; queues that event (fire-and-forget `prisma.outboxEvent.create`, not paired with a business mutation, so no transaction needed) | ✅ correctly self-deduping | invoked at the top of every `drainOutbox()` call — same 60s-bell-poll dependency as above. The function's own comment states: *"No dedicated cron: called from the outbox worker's regular poll (Phase 1 doesn't have a job scheduler)"* |

## Auth of internal calls

Not applicable in the webhook sense — these aren't externally-triggered endpoints. The "internal call" here is a normal authenticated user request (`GET /api/v1/notifications/unread-count`, itself gated by `getAuthedUser()` like every other API route) that happens to also drain the outbox as a side effect. There is no separate internal-only trigger endpoint that would need its own secret/auth scheme (e.g. no `/api/cron/*` route exists).

## Operational risk

In the stated Phase 1 deployment shape (internal pilot, one project team, per CLAUDE.md), this means:
- If no team member has the app open in a browser tab, **the outbox never drains** — notifications queue up but are never converted to `Notification` rows until someone next loads the app.
- Pulse reminders past 5pm can be delayed indefinitely, or effectively never fire on a day with no evening app usage.
- There is no dead-letter visibility — `outboxRepository.markFailed` moves events to `DEAD_LETTER` after exhausting retries (exponential backoff, `min(60, 2^retryCount)` minutes), but nothing surfaces `DEAD_LETTER` rows to an operator; they're only visible via a direct DB query.

## Recommended fix before go-live

Wire an actual scheduler — the simplest options: (a) a `node-cron`/`setInterval` process co-located with the Next.js server calling `outboxWorker.drainOutbox()` on a fixed interval, or (b) an external cron (VM crontab, systemd timer) hitting a new authenticated internal-only API route that calls the same function. Either closes the "nobody's watching" gap. This is a launch blocker for reliability, not a security hole — flagged here and carried into the shipping packet's launch-blocker list.
