# Deployment runbook — free-tier demo on Vercel + Supabase

Target: a live, shareable Orbit URL at zero cost, seeded with the `ACP` demo
project. This is the **demo** deployment, not the Innominds VM one — it uses
Supabase's hosted Postgres and auth rather than a self-hosted stack.

Budget: Vercel Hobby (free, personal/non-commercial) + Supabase Free
(500 MB database, 50 k monthly active users). Both have the caveats listed in
§7 — read those before relying on the URL in a live interview.

---

## 1. Supabase project

1. supabase.com → **New project**. Region: closest to you. Save the database
   password it generates — it goes into the connection strings below.
2. **Project Settings → Database → Connection string**:
   - `DATABASE_URL` → the **Session pooler** string (port `5432`).
   - `DIRECT_URL` → the **Direct connection** string.
   Both need the password substituted in for `[YOUR-PASSWORD]`.
   Do **not** use the transaction pooler (`6543`) — Prisma migrations fail
   against it (this cost a session once already; see `architecture.md`).
3. **Project Settings → API**: copy the project URL and the `anon` key, and
   the `service_role` key (invite emails no-op without it).
4. **Authentication → URL Configuration**: set the Site URL to the Vercel URL
   from §3 and add `https://<your-app>.vercel.app/auth/callback` to the
   redirect allow-list. Magic links silently fail to land otherwise.

## 2. Apply the schema

From a machine with network access to Supabase:

```bash
npm install
npm run db:generate
npx dotenv -e .env.local -- npx prisma migrate deploy \
  --schema prisma/orbit-schema-v3.prisma
npm run db:seed        # org, admin user, ORB project, default statuses
npm run db:seed:demo   # the ACP demo project (see §4)
```

If `migrate deploy` cannot download the Prisma engine (restricted network),
apply `prisma/migrations/*/migration.sql` with `psql` in filename order
instead — the result is identical.

## 3. Vercel

1. vercel.com → **Add New → Project** → import `rudra314/Orbit`.
2. Framework preset: Next.js. Build command and output: defaults.
3. Environment variables (all **Production** and **Preview**):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | session-pooler string from §1 |
   | `DIRECT_URL` | direct-connection string from §1 |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key |
   | `LLM_PROVIDER` | `openrouter` |
   | `OPENROUTER_API_KEY` | key from openrouter.ai → Keys |
   | `OPENROUTER_MODEL` | optional; defaults to a `:free` model |

   Never set `DEMO_AUTH_EMAIL` on a deployed environment — it is a local-only
   sandbox bypass and is not present in committed code.
4. Deploy. The build fetches Geist from Google Fonts at build time; a sandbox
   without that network access fails the build on fonts alone — Vercel has it.

## 4. Demo data

`npm run db:seed:demo` creates **Acme Customer Portal (ACP)**, a fixed-bid
project: 6 members across 5 disciplines, 3 epics, 3 features, 20 work items
spanning all four types and every board column, one completed sprint (for
velocity history), one active, one in planning, 4 test cases, 4 typed links
(including a bug `FOUND_IN` a story), 5 deliverables at mixed statuses, and
today's daily pulses from 3 members including one live blocker.

Every date is relative to the run date, so the board always looks current —
**re-run it on the morning of a demo** and the active sprint is mid-flight
again. The script is idempotent: re-running updates rows rather than
duplicating them.

## 5. Turning AI on

AI is `DISABLED` per project by default. In the deployed app: **Settings → AI
→ mode `CLOUD_API`**, then enable the features you want to show. Generation
goes through the OpenRouter adapter and lands as a `DRAFT` `AiGeneration`;
nothing real is written until a PM or LEAD approves it on **AI Review**. That
approval gate is the governance story worth demoing — show the draft first.

Free OpenRouter models are rate-limited and slower than paid ones. For a live
demo, either set `OPENROUTER_MODEL` to a paid model and put a few dollars of
credit on the account, or generate once beforehand and show the review queue.

## 6. Keep-alive

Supabase pauses a free project after ~7 days of inactivity, and an unpausing
project makes for a bad first thirty seconds of a demo.

**There is no cron endpoint to point a scheduler at yet** — the outbox drains
only as a side effect of a signed-in browser polling the notification bell
(`cron.md`). So until the scheduler work lands, keep-alive is manual: sign in
to the deployed app at least once a week, and always the day before an
interview.

When the scheduler ships, it should expose a `CRON_SECRET`-guarded drain route
and this becomes a one-liner in `vercel.json` (Hobby allows one cron a day,
which is enough for both draining and keep-alive):

```json
{ "crons": [{ "path": "/api/v1/cron/drain", "schedule": "0 6 * * *" }] }
```

## 7. Known constraints

- **Vercel Hobby is non-commercial.** Fine for a portfolio demo; an Innominds
  production deployment needs the VM path or a paid plan.
- **Cold starts.** The first request after idle takes a few seconds. Open the
  app a minute before you present.
- **Invite emails** need `SUPABASE_SERVICE_ROLE_KEY`; without it they silently
  no-op (logged warning only) — see `variables.md`.
- **No scheduler.** Outbox drain is still client-poll-triggered plus the cron
  above; nine event types are logged but never consumed. See `cron.md`.
- **Magic-link auth only.** There is no password login, so a demo audience
  cannot be handed a shared credential — sign in beforehand, or add their
  address as a project member and let them request their own link.
