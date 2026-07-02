# Emails

Orbit sends exactly one kind of email today: **Supabase-hosted invite/magic-link emails**. There is no application-owned email templating system, no transactional email for in-app events (comments, status changes, deliverables, reports) — those all go through the in-app `Notification` path instead (see `cron.md` / `flows.md`), not email.

## Path

1. PM invites a member: `teamService.invite()` (PM-only, `permissionService.assertCanDelete`) creates an `Invitation` row, then calls `sendInviteEmail(email, redirectTo)` (`src/lib/supabase/admin.ts`).
2. `sendInviteEmail` builds a Supabase **service-role** admin client (`createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })`) and calls `admin.auth.admin.inviteUserByEmail(email, { redirectTo })` — this delegates the actual email template, sending, and delivery entirely to Supabase's own auth email system. Orbit does not control the template content beyond the `redirectTo` URL.
3. **Explicitly best-effort:** if `SUPABASE_SERVICE_ROLE_KEY` is unset, `adminClient()` returns `null` and the function logs a warning and returns silently — the invite still "succeeds" from the PM's perspective (the `Invitation` row exists), but no email goes out and the inviter isn't told. This is the current state in `.env.local` (see `variables.md`).
4. Even with no email, the invite still works: the invitee can sign in via the normal magic-link flow (Flow 1 in `flows.md`) with their invited email address, and `teamService.acceptInvitationsForUser()` picks up the pending `Invitation` on login.

## Retry / backoff

None — a single `try/catch` around the Supabase call; any failure (missing key, email already a Supabase user, SMTP misconfiguration on Supabase's side) is caught, logged via `console.error`, and swallowed. There is no queue, no retry, and re-sending requires an explicit "resend invite" action (`teamService.resendInvite`, LEAD+ floor) which just calls the same best-effort path again.

## Failure visibility

Console logs only (`console.warn`/`console.error`) — no UI surfacing, no alert, no dead-letter record of failed sends. An operator would need to watch server logs to know invite emails are failing or disabled.

## Template / variable risk

No custom template exists in Orbit's codebase to audit for injection — the email body is entirely Supabase's own hosted template. The only Orbit-controlled input passed through is `redirectTo` (built from request origin), which determines where the magic link in that email points; worth confirming it's derived from a trusted origin and not attacker-influenced, though this is a minor surface since it only affects where the invited user's own link lands, not a cross-user risk.

## Pre-go-live checklist

- [ ] Set `SUPABASE_SERVICE_ROLE_KEY` if invite emails should actually be delivered for the pilot, or explicitly plan to tell invitees out-of-band to just sign in with their invited address.
- [ ] Confirm Supabase's own SMTP/email provider is configured on the Supabase project (outside this repo) — `inviteUserByEmail` will still fail silently (per above) if Supabase itself can't send.
