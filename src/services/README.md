# `src/services` — business logic

ALL business logic lives here: validation, permission checks (via
`permissionService`), AI orchestration, and event emission.

Every mutation must check permissions and write an `OutboxEvent` in the **same
transaction** as the mutation (transactional outbox — not fire-and-forget).
Services call `src/repositories` for data access; they never import Prisma directly.
