# `src/api/v1` — HTTP adapters

Thin HTTP layer. Parse the request → call a service → return the response.

**No business logic, no Prisma imports here.** Validation, permissions, AI
orchestration, and event emission all live in `src/services`.
