# Variables & Secrets

No `.env.example` exists — there is currently no self-documenting template for a new environment. Recommend adding one (names only, no real values) as a pre-go-live item.

| Name | Used by | Scope | Source | Rotation | Risk |
|---|---|---|---|---|---|
| `DATABASE_URL` | Prisma runtime (`src/repositories/prisma.ts`) | server-only | Postgres pooled connection string | rotate via DB provider; update `.env.local` on the VM | High if leaked — full DB read/write. Not referenced in `src/app` or any client bundle. |
| `DIRECT_URL` | Prisma migrations only (`prisma migrate` CLI, per schema comment) | server-only, CLI-time | Postgres direct (non-pooled, port 5432) connection string | same as above | High if leaked — same as `DATABASE_URL`. Never touched at runtime, only by migration commands. |
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/supabase/{server,client,middleware,admin}.ts` | **client-reachable by design** | Supabase project settings | rotate if project is ever recreated | Low — this is a public project identifier, not a secret. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same files | **client-reachable by design** | Supabase project settings (anon/publishable key) | rotate via Supabase dashboard if compromised | Low by Supabase's own model — this key is meant to be public; real protection is Supabase Auth + the app's own `permissionService` checks (there is no Postgres RLS in play for Orbit's own tables). |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase/admin.ts` (invite emails only) | server-only | Supabase project settings (service-role key) | rotate via Supabase dashboard; treat as a full-bypass credential | **High if leaked** — Supabase service-role keys bypass all Supabase-side auth. Currently **absent from `.env.local`** in this environment, so invite emails silently no-op (logged warning, not surfaced to the inviting PM). Must be set before go-live if invite emails are wanted. |
| `ANTHROPIC_API_KEY` | `src/lib/llm/anthropicAdapter.ts` | server-only | Anthropic Console | rotate via Anthropic Console if leaked; monitor usage/cost | Medium — leak enables API abuse billed to the org; no PII/customer data reachable through the key itself. |
| `LLM_PROVIDER` | `src/lib/llm/providerFactory.ts` | server-only | manually set, defaults to `"anthropic"` | n/a — not a secret | None. Accepts `"anthropic"` or `"openrouter"`; any other value throws `LLMConfigError`. |
| `OPENROUTER_API_KEY` | `src/lib/llm/openRouterAdapter.ts` | server-only | openrouter.ai → Keys | rotate in the OpenRouter dashboard; set a credit limit on the key | Medium — leak enables API abuse billed to the account. Only required when `LLM_PROVIDER=openrouter`. |
| `OPENROUTER_MODEL` | `src/lib/llm/openRouterAdapter.ts`, `providerFactory.describeProvider()` | server-only | manually set; defaults to `meta-llama/llama-3.3-70b-instruct:free` | n/a — not a secret | None. The `:free` default costs nothing but is rate-limited and slower; swap for a paid model string for demos. |
| `OPENROUTER_BASE_URL` | `src/lib/llm/openRouterAdapter.ts` | server-only | manually set; defaults to `https://openrouter.ai/api/v1` | n/a — not a secret | None. Override only to point at a proxy or a self-hosted OpenAI-compatible endpoint. |
| `NODE_ENV` | `src/repositories/prisma.ts` (query logging toggle) | server-only | set by Next.js/host | n/a | None. |

## `secretRef` pattern — documented but not implemented

CLAUDE.md and `prisma/orbit-schema-v3.prisma` (`ProjectAiConfig.secretRef`) describe a per-project indirection where the DB stores an env-var *name*, never a raw key, and the app resolves the actual key from that named env var at call time. **This is schema-only.** `settingsService.ts` never reads or writes `secretRef`; `anthropicAdapter.ts` reads `process.env.ANTHROPIC_API_KEY` directly, global to the whole deployment. Net effect: no raw key is ever stored in the DB or sent to the client (the underlying safety property holds), but the per-project BYO-key feature does not exist yet — every project shares one global Anthropic key. Flagged as a documented-vs-implemented gap, not a leak.

## Client-exposure check

`grep -r "process.env" src/app` returns zero matches — no env var is read from UI code. All env access is centralized in `src/lib/`. The only two vars that reach the browser (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) are the ones explicitly prefixed `NEXT_PUBLIC_` and intended to be public. `next.config.ts` has no `publicRuntimeConfig`/`env` block that would expose anything additional.

## Hardcoded credentials check

No hardcoded API keys, passwords, or connection strings were found anywhere in `src/` (checked for `sk-...`, `postgres(ql)://`, and string-literal `password=`/`secret=`/`api_key=` patterns). All secret-shaped values come from `process.env` or Prisma's `env("DATABASE_URL")`/`env("DIRECT_URL")`.

## `.gitignore` coverage

`.env*` is gitignored (`.gitignore:26`, no `!` negations). `.env.local` is confirmed untracked.

## Pre-go-live checklist

- [ ] Add `.env.example` (names only) so a fresh VM setup isn't guesswork.
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY` on the target VM if invite emails are required for the pilot, or explicitly accept that invitees must be told out-of-band to sign in with their invited email.
- [ ] Confirm `DATABASE_URL`/`DIRECT_URL` point at the pilot's production Postgres instance, not a dev/shared one, before go-live.
- [ ] Confirm `ANTHROPIC_API_KEY` used in production has its own billing/rate-limit visibility, since no in-app budget enforcement exists yet (see `automation.md`).
