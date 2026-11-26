# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Orbit
AI Native Delivery Management Platform for Innominds project teams. Replaces Excel-based project tracking with structured backlog, sprint execution, QA traceability, and AI-assisted story/test/report generation. First deployment is an internal pilot on an Innominds VM for one project team. See `Orbit-Product-Context.md` for full product positioning, segments, and explicit non-goals (no billing, no timesheets, no mobile-native, no client portal in Phase 1).

## Current state (read first)
This repo is **implemented and feature-complete for Phase 1** (Next.js 16 App Router + TypeScript + Prisma 6 + Supabase auth — real code, not a scaffold). Sessions 1 through 12A are committed (see `git log`). Working-tree-only, not yet committed as of this writing: a Daily Pulse (async standup) feature — `src/services/pulseService.ts`, `src/api/v1/pulse.ts`, related routes/UI/migration — see `documentation/flows.md` §6 and `documentation/automation.md`.
Next: Session 12B — Docker, deploy, demo prep.

**Read `documentation/` before making non-trivial changes.** It is the reverse-engineered source of truth for how the system actually behaves today (produced by a shipping/security review, not aspirational):
- `documentation/architecture.md` — system overview, stack, auth flow, trust boundaries, known risks
- `documentation/flows.md` — permission-relevant journeys with the authz check and side effects at each step
- `documentation/permissions.md` — role model and the resource × operation × role matrix
- `documentation/variables.md` — every env var, its risk, and rotation notes
- `documentation/automation.md` — the AI generation/approval governance surface (highest-risk area)
- `documentation/cron.md` — background workers and the (currently missing) scheduler
- `documentation/emails.md` — the invite-email path
- `documentation/tests.md` — test-coverage map

These docs record several **documented-vs-implemented gaps** in this file's own "target design" sections below — check the doc before assuming schema-described behavior is actually live: `ProjectAiConfig.approvalRule`/`.secretRef`/`.tokenBudget`/`.costBudget` are schema fields not read by any code; `OrgRole` is not enforced anywhere (all real authorization is `ProjectRole`); only Anthropic and OpenRouter are wired — no dedicated Ollama adapter; there is no real cron/scheduler, only a client-poll-triggered outbox drain (`documentation/cron.md`); the test suite is thin (19 vitest tests over 3 files — see `documentation/tests.md`).

## Guardrails for AI coding agents

- **Never bypass `permissionService`.** Every service mutation must call an `assertCan*`/`assertProjectRole` check before writing. See `documentation/permissions.md` for the full inventory — extend it, don't route around it with inline role-string checks.
- **Never call `prisma.*` outside `src/repositories/` or `src/workers/`.** `src/app/**` and `src/services/**` must stay Prisma-free (verified clean today by `documentation/architecture.md`) — if you find yourself importing Prisma in a service or component, stop and add a repository method instead.
- **Every state-changing mutation writes its `OutboxEvent` inside the same `prisma.$transaction` as the row change it describes.** Not fire-and-forget, not a follow-up call. See `documentation/flows.md` for worked examples.
- **AI-generated content stays `DRAFT` until a human approval call.** Do not add a path that creates real `Epic`/`Feature`/`WorkItem`/`TestCase` rows directly from an LLM response — route through `aiService.approveGeneration` (or extend it).
- **Trust boundary: `/api/v1/**` is not covered by middleware.** Every handler in `src/api/v1/*.ts` must call `getAuthedUser()` itself and 401 on `null` before doing anything else — don't assume the middleware protects it.
- **Don't widen the client-exposed env surface.** Only add a `NEXT_PUBLIC_` var if it's genuinely safe to ship to the browser; see `documentation/variables.md` for what's there today and why.
- **The `documentation/*.md` files describe current-state, not aspiration.** If you change code in a way that makes one of them wrong (a new role check, a new background job, a new env var, a new AI capability), update the relevant doc in the same change — don't let it drift out of sync again.

## Intended architecture
4-layer separation — never violate this once code exists:
- `src/app/` — UI only (Next.js App Router). No business logic. No Prisma imports.
- `src/api/v1/` — Thin HTTP adapters. Parse request → call service → return response.
- `src/services/` — ALL business logic. Validation, permissions, AI orchestration, event emission.
- `src/repositories/` — Prisma queries only. No business logic.
- `src/workers/` — Background job processors. Poll the `outbox_events` table.

## Key rules
- Every service mutation must check permissions via `permissionService`
- State changes must write an `OutboxEvent` in the same transaction as the mutation (transactional outbox — not fire-and-forget). Workers poll `outbox_events` by `status`/`scheduledAt`.
- AI output is always `DRAFT` until human approval (`AiGeneration.status`, `TestCase.status`, `WeeklyReport.status` all start `DRAFT`)
- All colors use CSS custom properties from `src/styles/orbit-tokens.css`, never hardcoded hex (note: the schema stores per-org/project/label/status accent colors as hex strings — those are data, the rule is about UI styling)
- Work item keys are auto-generated: `project.key + project.nextItemNumber` (atomic increment of `Project.nextItemNumber`), formatted like `ORB-42`, unique per `[projectId, itemKey]`
- Board columns come from the `WorkflowStatus` table (per-project, ordered by `displayOrder`), not a hardcoded enum. `StatusCategory` is the fixed bucket; status names/colors are configurable.
- Project-level AI config lives in `ProjectAiConfig` (per project, not global). Never store raw API keys — use `secretRef` (env var name)
- Documents default to `INTERNAL` visibility

## Data model orientation (`prisma/orbit-schema-v3.prisma`)
- **Tenancy:** `Organization` → `Project`. Membership at both levels (`OrgMember` with `OrgRole`, `ProjectMember` with `ProjectRole` + `Discipline`).
- **Work hierarchy:** `Epic` → `Feature` → `WorkItem` → `Subtask`. `WorkItem.type` is `STORY | BUG | TASK | SPIKE` (single table with type-specific fields — bug repro fields, spike research fields, etc.). `WorkItemLink` captures typed relationships (`BLOCKS`, `FOUND_IN`, `TESTED_BY`, …).
- **Sprints & board:** `Sprint` holds work items; `WorkflowStatus` defines board columns.
- **QA traceability:** `WorkItem` → `TestCase` → `TestExecution`, grouped by `TestRun`. A failed execution can link a `bugItemId` back to a bug WorkItem.
- **AI governance:** `AiPromptTemplate` (versioned prompts) → `AiGeneration` (one generation run, stores provider/model/tokens/cost, `DRAFT`→`APPROVED`) → `AiGeneratedEntity` (polymorphic link to the WorkItems/TestCases/etc. created on approval).
- **Reliability & observability:** `OutboxEvent` (background work), `ActivityLog` (project feed), `AuditLog` (org-level change history with old/new values), `Notification`.
- **Other:** `SourceDocument` (+ versions, processing jobs) feed AI; `Deliverable`, `DecisionLog`, `WeeklyReport`, `Label`, `CustomFieldDefinition`/`CustomFieldValue`, and the Git-integration models (`IntegrationConnection`/`Repository`/`PullRequest`/`Commit`/`DeploymentRecord`) are Phase 3+ schema with no Phase 1 UI.
- All tables use `@@map` snake_case names and most fields use `@map` — Prisma model names are camelCase, DB names are snake_case.

## Tech stack (actual)
- Next.js 16 App Router + TypeScript + Tailwind CSS v4, React 19
- PostgreSQL with Prisma ORM 6 (`provider = "postgresql"`, `url = env("DATABASE_URL")`, migrations via `DIRECT_URL`)
- dnd-kit for board drag-and-drop
- LLM: `src/lib/llm/` wires **Anthropic** (`@anthropic-ai/sdk`, model `claude-sonnet-4-6`) and **OpenRouter** (dependency-free `fetch` against the OpenAI-compatible endpoint, free-model default), selected by a global `LLM_PROVIDER` env var (`anthropic` | `openrouter`). The schema's per-project `ProjectAiConfig.provider`/`.secretRef` fields exist but are not read — see `documentation/automation.md` and `documentation/variables.md` before assuming Ollama/OpenAI-compatible or per-project keys work.
- Auth: Supabase magic-link only (`@supabase/ssr`), no passwords. `User.provider = magic_link`; M365 integration (`provider_user_id` holding the M365 oid) is schema-ready but not implemented. See `documentation/architecture.md`.

## Common service patterns (as implemented)
- Create work item: `workItemService.create()` → `permissionService.assertCanMutateBoard` → atomically increments `nextItemNumber` and generates key → creates item → writes `OutboxEvent`, all in one `prisma.$transaction`
- Move a card: `boardService.moveCard()` → `assertCanMutateBoard` → updates `statusId` → emits `status_changed` event, same transaction
- AI generation: `aiService.generateBacklog()` → `assertCanUseAi` → checks `ProjectAiConfig.aiMode` only (**not** provider/budget — those fields aren't read yet) → calls the Anthropic adapter → stores result in `AiGeneration` as `DRAFT`
- Approve AI output: `aiService.approveGeneration()` → `assertCanUseAi` (re-checked) → creates real entities in one transaction → links them via `AiGeneratedEntity` → emits events. **Approval is hardcoded to PM/LEAD** — `ProjectAiConfig.approvalRule` (`PM_APPROVAL | PM_OR_LEAD_APPROVAL | ANY_REVIEWER`) is defined in the schema but not consulted. See `documentation/automation.md`.

## Database commands
The schema is at the **non-default** path `prisma/orbit-schema-v3.prisma`. `package.json` scripts already wire `--schema` and load `.env.local` via `dotenv-cli`:
- `npm run db:generate` — `prisma generate`
- `npm run db:migrate` — `prisma migrate dev`
- `npm run db:seed` — `prisma db seed` (seed script: `prisma/seed.ts`, configured via `"prisma": {"seed": ...}` in `package.json`)
- `npm run db:studio` — `prisma studio`
- `npm run db:seed:demo` — seeds the `ACP` demo project used for walkthroughs (`prisma/seed-demo.ts`, idempotent, dates relative to the run date)
- App commands: `npm run dev` / `npm run build` / `npm run start` / `npm run lint` / `npm test` (vitest). Deployment steps are in `documentation/deployment.md`.

## Roles
Project roles: `PM` (full control) > `LEAD` (manage sprints, estimate) > `CONTRIBUTOR` (edit assigned work, update status) > `VIEWER` (read-only) > `GUEST`. Delete operations are PM only. AI approval is currently hardcoded to PM/LEAD regardless of the project's `approvalRule` (see above). Org-level roles (`OWNER | ADMIN | MEMBER`) exist in the schema but are **not enforced by any code path** — see `documentation/permissions.md`.



## Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.