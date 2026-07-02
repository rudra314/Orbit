# Test Coverage Map

## Existing coverage

**None.** `package.json` has no test framework (no jest/vitest/playwright in `devDependencies`), no `test` script, and no `*.test.*`/`*.spec.*` file exists anywhere in `src/`. Every rule below is either **proposed** or a **gap** — there is no rule in this codebase that a test currently pins. This is itself the top finding of this document.

## Coverage map

| Use case | Rule (doc) | Expected behavior (+ deny case) | Evidence | Type | Status |
|---|---|---|---|---|---|
| Work item create | CONTRIBUTOR+ only | PM/LEAD/CONTRIBUTOR can create; VIEWER/GUEST get `PermissionError` | `permissions.md`, `workItemService.ts:143` | unit | proposed |
| Work item delete | PM only | PM can delete; LEAD/CONTRIBUTOR get `PermissionError` | `permissions.md`, `workItemService.ts:248` | unit | proposed |
| Cross-project sprint assignment | a work item's `sprintId` must belong to the same project | connecting a sprint from another project must throw `ValidationError`, mirroring the check already present in `bulkUpdate` | `permissions.md` gap; **confirmed security finding**, `workItemService.ts:204-209` (single-item `update()` has no check; `workItemService.ts:281-284` `bulkUpdate()` does) | integration (deterministic, local DB) | **none — confirmed unpatched bug** |
| AI approval role gate | `assertCanUseAi` — PM/LEAD only | CONTRIBUTOR/VIEWER calling `approveGeneration` gets `PermissionError` | `automation.md`, `aiService.ts:330` | unit | proposed |
| AI approval idempotency | approving a non-`DRAFT` generation is rejected | second approval attempt on an already-`APPROVED`/`REJECTED` generation throws `ValidationError`, no duplicate entities created | `flows.md` §4, `aiService.ts:331-333` | integration (deterministic) | proposed |
| AI approval respects `approvalRule` | project configured `ANY_REVIEWER` should allow non-PM/LEAD approval | **currently always fails** — code hardcodes PM/LEAD regardless of config | `automation.md`, `permissions.md` gap | integration | **none — documented-vs-implemented gap, not yet fixed** |
| AI budget enforcement | `tokenBudget`/`costBudget` should cap generation spend | generation should refuse once budget exceeded | `automation.md` | integration (deterministic, mocked provider) | **none — unimplemented** |
| Login redirect (`next` param) | post-login redirect must stay same-origin | a `next` value that resolves to a different origin (e.g. `@evil.com` userinfo trick) must be rejected/normalized to `/`, not passed to `NextResponse.redirect` | **confirmed security finding**, `src/app/auth/callback/route.ts:12,30` | unit (extract a `isSafeRedirect(next, origin)` helper) + integration (route-level) | **none — confirmed unpatched bug** |
| Comment edit ownership | only the author (within a 15-min window) or a PM may edit/delete another's comment | non-author, non-PM caller outside the window gets `PermissionError` | `permissions.md`, `commentService.ts:120-154` | unit | proposed |
| Notification read scoping | a user can only mark their own notifications read | `markRead` with another user's notification id is a no-op (0 rows affected), not an error leak | `permissions.md`, `notificationRepository.ts:51-56` | integration (deterministic, local DB) | proposed |
| Pulse submit role gate | PM/LEAD/CONTRIBUTOR only | VIEWER/GUEST get `PermissionError` | `permissions.md`, `pulseService.ts:211` | unit | proposed |
| Pulse blocker response role gate | PM/LEAD only | CONTRIBUTOR gets `PermissionError` | `permissions.md`, `pulseService.ts:441` | unit | proposed |
| Pulse reminder target validation | reminder target should be a project member | **currently unchecked** — `sendReminder` accepts any `targetUserId` | **confirmed security finding (low)**, `pulseService.ts:461-475` | unit | **none — unpatched** |
| Outbox transactional write | every business mutation's `OutboxEvent` commits in the same transaction as the row change | a simulated mid-transaction failure leaves neither the row change nor the event persisted (no partial commit) | `flows.md`, `architecture.md` | integration (deterministic, local DB, forced rollback) | proposed |
| Outbox claim exclusivity | two concurrent drain calls never process the same event twice | `claimBatch`'s `QUEUED→PROCESSING` transition is race-safe under concurrent callers | `cron.md`, `outboxRepository.ts:16-35` | integration (deterministic, concurrent local calls) | proposed |
| Pulse reminder dedupe | at most one `pulse_reminder_check` event per project per day | second same-day call is a no-op | `cron.md`, `pulseReminderScheduler.ts:20-28` | unit/integration | proposed |
| Invite email best-effort | a missing `SUPABASE_SERVICE_ROLE_KEY` must not fail the invite itself | `Invitation` row still created even when email send is skipped | `emails.md`, `teamService.ts:219`, `admin.ts` | integration (deterministic, key unset) | proposed |
| CSV export formula neutralization | audit CSV export must neutralize leading `=+-@` in exported cell values | a work item titled `=HYPERLINK(...)` exports as a quoted, non-formula string | **confirmed security finding (low/medium)**, `auditService.ts:154-163` | unit | **none — unpatched** |
| Org role has no effect | documented as unenforced — no test needed until a feature depends on it | n/a | `permissions.md` | n/a | not applicable yet |
| Middleware fails closed | a Supabase outage during session refresh denies, not allows | simulated `getUser()` throw results in redirect-to-login, never pass-through | `architecture.md`, `src/lib/supabase/middleware.ts:43-49` | integration (deterministic, mocked Supabase client) | proposed |
| Layering: no Prisma outside repositories/workers | `src/app/**` and `src/services/**` never import Prisma directly | a lint rule or CI grep fails the build if `PrismaClient`/`prisma.` appears outside allowed directories | `architecture.md` | CI static check (not a runtime test) | proposed |

## Existing coverage

None — see above.

## Proposed tests

**Grouped by flow/doc, with the negative case each must assert.**

### `permissions.md` — role gates (unit, no DB needed if `permissionService` is tested against a fake `projectMemberRepository`)
- `assertCanMutateBoard`: allows PM/LEAD/CONTRIBUTOR, denies VIEWER/GUEST — assert `PermissionError` thrown for the deny case.
- `assertCanDelete`: allows PM only, denies LEAD/CONTRIBUTOR/VIEWER.
- `assertCanUseAi`, `assertCanManageSprints`, `assertCanManageDeliverables`, `assertCanManageReports`, `assertCanImport`: same pattern, one test per function, each asserting both the allow floor and the first denied rank below it.
- `assertCanReviewTestCase`: allows PM/LEAD OR Discipline===QE; denies CONTRIBUTOR without QE discipline — this one needs both an allow-by-role and an allow-by-discipline case plus the deny case.

### `flows.md` §2/§3 — work item & board mutations (integration, local test DB)
- Create work item generates a sequential `itemKey` and writes the `work_item_created` outbox event in the same transaction as the insert (query the event row exists immediately after the service call returns, same transaction boundary).
- Move card validates the target `WorkflowStatus` belongs to the caller's project — moving into another project's column throws.
- **Regression test for the cross-project sprint bug**: attempt to set `sprintId` to a sprint from Project B while authenticated as a Project A member; must throw `ValidationError`, and the item's `sprintId` must remain unchanged in the DB after the attempt.

### `flows.md` §4 / `automation.md` — AI generation & approval (integration, mocked Anthropic client)
- `generateBacklog` with `aiMode = DISABLED` throws before calling the provider.
- `generateBacklog` with `inputText` under 50 chars throws `ValidationError` without calling the provider.
- `approveGeneration` on a `DRAFT` generation creates exactly the approved Epic/Feature/WorkItem/TestCase count, all linked via `AiGeneratedEntity`, and flips status to `APPROVED`.
- `approveGeneration` called twice on the same generation: second call throws, no duplicate entities.
- **Regression test for the redirect bug**: `isSafeRedirect("@evil.com", "http://localhost:3000")` returns `false`; `isSafeRedirect("/board", origin)` returns `true`; route-level integration test confirms a crafted `next` never reaches `NextResponse.redirect` unescaped.

### `emails.md` — invite path (integration, service-role key unset)
- Invite with no `SUPABASE_SERVICE_ROLE_KEY` configured still creates the `Invitation` row and returns success to the caller; a console warning is logged (assert via spy) but not surfaced as an API error.

### `cron.md` — outbox/notification worker (integration, local test DB)
- `drainOutbox` called twice concurrently (simulated via two overlapping async calls against the same DB) never double-processes a single `OutboxEvent` — assert final `Notification` count matches expected, not doubled.
- `maybeQueuePulseReminders` called twice in the same day for the same project creates exactly one `pulse_reminder_check` event.

## Recommended CI gate

No test framework is installed yet. Recommend **Vitest** (fast, native ESM/TS support, minimal config, works well with Next.js 16) for unit + deterministic integration tests, with a local Postgres (docker-compose or `testcontainers`) for the integration tier. Guarded-live tests (real Anthropic call, real Supabase invite send) should live behind an explicit env flag (e.g. `RUN_LIVE_TESTS=1`) and never run in the default CI job.

Suggested `.github/workflows/ci.yml` (or equivalent for the actual CI host — none currently exists in this repo, `.github/` was not found):

```yaml
name: CI
on:
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx prisma migrate deploy --schema prisma/orbit-schema-v3.prisma
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/postgres
      - run: npm run lint
      - run: npx vitest run   # once added — unit + deterministic integration only
```

Branch protection: require this workflow's `test` job as a required status check on `main`, with no bypass for admins, once the suite has non-trivial coverage (recommend enabling the gate after the first ~10 proposed tests above land, not before — an empty required check just blocks merges with no signal).

## Gaps — documented but unverified, ranked by exposure

1. **Cross-project sprint assignment (confirmed bug, no test, no fix yet)** — a CONTRIBUTOR+ on any project can pollute another project's sprint/board/burndown data. Highest priority: fix + regression test together.
2. **Open redirect in the auth callback (confirmed bug, no test, no fix yet)** — post-authentication phishing vector. Fix + regression test together.
3. **AI generation has no budget/rate enforcement** — unbounded Anthropic spend by any PM/LEAD, no test exists because no enforcement exists to test yet; write the enforcement first.
4. **`approvalRule` is not consulted** — a config field silently does nothing; either implement it or remove it from the schema/docs so it stops implying a control that isn't there.
5. **CSV formula injection in audit export (confirmed, low/medium)** — no test, no fix.
6. **Pulse reminder target not membership-checked (confirmed, low)** — no test, no fix.
7. **No layering-violation CI check** — the "no Prisma outside repositories" rule is currently upheld by convention only; nothing stops a future edit from silently breaking it.
8. **No integration test for the transactional-outbox pattern itself** — the pattern is correct today (verified by manual code read across ~30 call sites) but nothing would catch a future edit that writes an event outside the transaction.
