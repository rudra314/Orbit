# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Orbit
AI Native Delivery Management Platform for Innominds project teams. Replaces Excel-based project tracking with structured backlog, sprint execution, QA traceability, and AI-assisted story/test/report generation. First deployment is an internal pilot on an Innominds VM for one project team. See `Orbit-Product-Context.md` for full product positioning, segments, and explicit non-goals (no billing, no timesheets, no mobile-native, no client portal in Phase 1).

## Current state (read first)
This repo is **pre-implementation**. The only committed artifacts are:
- `prisma/orbit-schema-v3.prisma` — the complete 41-model data model (the source of truth for the domain)
- `Orbit-Product-Context.md` — product strategy
- `CLAUDE.md` — this file

There is **no application code, `package.json`, build pipeline, or test tooling yet**. The architecture and patterns below are the agreed design to build *toward* — follow them when scaffolding. Do not claim build/lint/test commands work until the corresponding tooling actually exists; add the real commands to this file as they land.

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

## Intended tech stack
- Next.js 15 App Router + TypeScript + Tailwind CSS
- PostgreSQL with Prisma ORM (`provider = "postgresql"`, `url = env("DATABASE_URL")`)
- dnd-kit for board drag-and-drop
- LLM: provider abstraction in `src/lib/llm/` supporting Anthropic (Claude API), Ollama, and OpenAI-compatible endpoints, selected per project via `ProjectAiConfig.aiMode`/`provider`
- Auth: magic links now (`User.provider = magic_link`), M365 integration planned (`provider_user_id` holds the M365 oid)

## Common service patterns (target design)
- Create work item: `workItemService.create()` → atomically increments `nextItemNumber` and generates key → creates item → writes `OutboxEvent`
- Move a card: `boardService.moveCard()` → updates `statusId` → emits `status_changed` event
- AI generation: `aiService.generate()` → checks `ProjectAiConfig` (mode/provider/budget) → calls LLM provider → stores result in `AiGeneration` as `DRAFT`
- Approve AI output: `aiService.approve()` → creates real entities → links them via `AiGeneratedEntity` → emits events. Who may approve is governed by `ProjectAiConfig.approvalRule` (`PM_APPROVAL | PM_OR_LEAD_APPROVAL | ANY_REVIEWER`).

## Database commands
The schema is at the **non-default** path `prisma/orbit-schema-v3.prisma`, so pass `--schema` explicitly (or move/rename to `prisma/schema.prisma` and configure the Prisma `schema` path in `package.json` once scaffolding exists):
- Generate client: `npx prisma generate --schema prisma/orbit-schema-v3.prisma`
- Create/apply migration: `npx prisma migrate dev --schema prisma/orbit-schema-v3.prisma`
- A seed script does not exist yet; `npx prisma db seed` will only work once `prisma.seed` is configured.

## Roles
Project roles: `PM` (full control) > `LEAD` (manage sprints, estimate) > `CONTRIBUTOR` (edit assigned work, update status) > `VIEWER` (read-only) > `GUEST`. Delete operations are PM only. AI approval follows the project's `approvalRule`. Org-level roles are separate: `OWNER | ADMIN | MEMBER`.



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