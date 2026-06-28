# `src/workers` — background job processors

Poll the `outbox_events` table by `status` / `scheduledAt` and process pending
work (notifications, AI jobs, document processing, etc.).
