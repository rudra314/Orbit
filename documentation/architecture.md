# Architecture

## What this system is

Orbit is an internal delivery-management platform (backlog, sprint board, QA traceability, AI-assisted story/test generation) for Innominds project teams. Phase 1 target is a single internal pilot deployment on an Innominds VM for one project team — not a multi-tenant SaaS product yet, though the data model (`Organization` → `Project`) is built for that future. No billing, no timesheets, no client portal, no mobile-native app in Phase 1. Git integration (`IntegrationConnection`, `Repository`, `PullRequest`, `Commit`, `DeploymentRecord`) is schema-only, Phase 3+ — no code or UI exists for it.

## Stack

- Next.js 16 (App Router) + TypeScript + React 19, Tailwind CSS v4
- PostgreSQL via Prisma ORM 6, schema at the non-default path `prisma/orbit-schema-v3.prisma`
- Auth/session: Supabase (`@supabase/ssr`, `@supabase/supabase-js`) — magic-link only, no passwords
- AI: `@anthropic-ai/sdk`, one provider wired (Anthropic, model `claude-sonnet-4-6`)
- dnd-kit for the sprint board
- No test framework is installed (`package.json` has no jest/vitest/playwright) and no test files exist anywhere in `src/` — see `tests.md`.

## Layers (as actually implemented, verified by code read)

```
src/app/**                 UI pages (Next.js App Router). Zero Prisma imports — verified by grep.
src/app/api/v1/**/route.ts One-line re-export bindings only, e.g. `export const POST = createWorkItemHandler;`
src/api/v1/*.ts            The real HTTP adapter layer: getAuthedUser() → parse → call service → map errors → JSON response
src/services/*.ts          Business logic + permissionService checks + outbox event orchestration
src/repositories/*.ts      All Prisma access. Transactional-outbox writes happen here, inside prisma.$transaction blocks.
src/workers/*.ts           outboxWorker.ts, notificationWorker.ts, pulseReminderScheduler.ts — see "Background work" below
src/lib/*.ts               Cross-cutting: auth.ts (getAuthedUser), supabase/* (session clients), llm/* (Anthropic adapter)
```

The layering rule in CLAUDE.md holds: `grep -rE "PrismaClient|prisma\." src/app` and the same over `src/components` return zero matches. The one blur is `src/workers/notificationWorker.ts`, which calls `prisma.*` directly (e.g. lines 29, 38, 61, 90, 97, 152, 156, 194, 222, 252, 283-287) instead of going through a repository — still backend-only, not a boundary violation, but worth knowing when editing that file.

A reviewer skimming only `src/app/api/v1/**/route.ts` will see nothing — every route there is a one-liner. The actual auth/authz/logic entry point is `src/api/v1/*.ts`.

## Auth flow (end to end)

1. `src/app/login/page.tsx` → `supabase.auth.signInWithOtp({ email })` — sends a Supabase magic link, no password path exists.
2. User clicks the link → `src/app/auth/callback/route.ts` exchanges the PKCE `code` via `supabase.auth.exchangeCodeForSession`, then calls `authService.ensureUser()` (creates/updates the Orbit `User` row keyed by email) and `teamService.acceptInvitationsForUser()` (auto-joins any project the email was invited to).
3. Every subsequent request: `src/lib/auth.ts` `getAuthedUser()` calls `supabase.auth.getUser()` (revalidates the token server-side) and looks up the Orbit `User` row by email. Returns `null` on any failure — this is the single choke point every service/API entry point relies on.
4. `src/middleware.ts` + `src/lib/supabase/middleware.ts` refresh the Supabase cookie and redirect unauthenticated *page* requests to `/login`. It fails closed on a Supabase outage (treated as unauthenticated).

## Trust boundaries

- **Browser ↔ Next.js server**: standard same-origin fetch; Supabase session cookie is httpOnly, not readable by JS. Only `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` cross to the browser deliberately (Supabase's public-anon-key model, safe under Supabase's own auth).
- **`/api/v1/**`is explicitly excluded from middleware's redirect** (a `fetch` can't follow an HTML redirect). Every handler in `src/api/v1/*.ts` self-enforces via `getAuthedUser()` — confirmed present in all 19 handler files, no route found that skips it. See `permissions.md` for the authorization layer underneath.
- **Server → Anthropic API**: outbound only, server-side `ANTHROPIC_API_KEY`, never reaches the client. See `automation.md`.
- **Server → Supabase Admin (service-role)**: used only for sending invite emails (`src/lib/supabase/admin.ts`); degrades to a no-op (logs a warning) if `SUPABASE_SERVICE_ROLE_KEY` is unset, which it currently is in `.env.local` — invite emails are silently disabled in this environment today. See `emails.md`.
- **Org-level roles are schema-only.** `OrgRole` (OWNER/ADMIN/MEMBER) is defined in the schema but no code path checks it — `orgRepository` only checks membership *existence*, and every new member is hardcoded to `role: "MEMBER"`. All real authorization is at the `ProjectRole` level. See `permissions.md`.

## Known risks / assumptions (each backed by code evidence — see `permissions.md`, `flows.md`, `automation.md`, `cron.md` for detail)

- **No independent job scheduler exists.** `outboxWorker`, `notificationWorker`, and `pulseReminderScheduler` are real, correctly-written processing logic, but nothing cron-triggers them — they only run when a signed-in user's browser is open and polling the notification bell every 60s (`src/components/notifications/NotificationBell.tsx`). In a low-traffic pilot, notifications and pulse reminders can be delayed indefinitely or never fire. See `cron.md`.
- **AI provider abstraction is narrower than documented.** CLAUDE.md and `src/lib/llm/README.md` describe per-project provider selection (Anthropic/Ollama/OpenAI-compatible via `ProjectAiConfig.provider`/`secretRef`), but the code only wires a single global Anthropic provider via `LLM_PROVIDER`/`ANTHROPIC_API_KEY` env vars — `ProjectAiConfig.provider` and `.secretRef` are never read. See `automation.md`.
- **AI token/cost budgets are unenforced.** `ProjectAiConfig.tokenBudget`/`.costBudget` exist in the schema but no code path checks them before or after a generation call. See `automation.md`.
- **`ProjectAiConfig.approvalRule` is unenforced.** Approval of AI-generated content is hardcoded to PM-or-LEAD in `aiService.approveGeneration`, regardless of the project's configured rule (`PM_APPROVAL | PM_OR_LEAD_APPROVAL | ANY_REVIEWER`). See `automation.md`.
- **No automated test suite.** Zero test files, no test framework installed. See `tests.md`.
- **Uncommitted feature in flight.** The Daily Pulse feature (`src/services/pulseService.ts`, `src/api/v1/pulse.ts`, related routes/UI/migration) is present in the working tree but not yet committed and not mentioned in the pre-existing CLAUDE.md — this documentation set treats it as in-scope/current state since it's what would ship.

## Related Documents

- [flows.md](flows.md) — permission-relevant journeys, trust-boundary crossings, side effects
- [permissions.md](permissions.md) — role model and resource×operation×role matrix
- [variables.md](variables.md) — config and secrets inventory
- [automation.md](automation.md) — AI generation/approval governance (the embedded-agent surface)
- [cron.md](cron.md) — background/scheduled work inventory
- [emails.md](emails.md) — invite email path
- `seo.md` — not applicable. Orbit is an internally authenticated pilot app with no public or bot-indexable routes; every page outside `/login` and `/auth/*` requires a session. Skipped.
- `tests.md` — produced separately by `/derive-tests`.
