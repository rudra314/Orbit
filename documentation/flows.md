# Flows

Permission-relevant journeys only — each with actor, precondition, the authz check at each protected step, trust-boundary crossings, and side effects. See `permissions.md` for the static role matrix this shows in motion.

## 1. Login (magic link)

**Actor:** any prospective user with an invited or self-registerable email. **Precondition:** none (entry point).

1. Browser → `src/app/login/page.tsx` → `supabase.auth.signInWithOtp({ email })`. **Boundary crossing:** browser → Supabase auth service (not Orbit's server). No Orbit authz check here — anyone can request a magic link for any email (standard magic-link behavior; Supabase itself decides whether to send).
2. User clicks emailed link → `src/app/auth/callback/route.ts`: `supabase.auth.exchangeCodeForSession(code)` (PKCE). **Deny case:** invalid/expired code → redirect to `/login?error=auth`, no session created.
3. On success: `authService.ensureUser()` — creates/updates the Orbit `User` row keyed by verified email (no authz check needed; this *is* the identity-establishment step). `teamService.acceptInvitationsForUser()` — auto-joins any `Invitation` rows matching the email. **Side effect:** `ProjectMember` rows created for each pending invite; no outbox event on this path (membership creation isn't currently one of the notified event types).
4. Every later request: `getAuthedUser()` (`src/lib/auth.ts`) revalidates via `supabase.auth.getUser()`, looks up the `User` row. **Deny case:** no session or no matching `User` row → `null` → caller must 401.

## 2. Create a work item (Story/Bug/Task/Spike)

**Actor:** PM/LEAD/CONTRIBUTOR project member. **Precondition:** authenticated, member of the target project.

1. `BacklogClient.tsx` / `BoardClient.tsx` / `SprintsClient.tsx` → `POST /api/v1/work-items` (browser → server boundary).
2. `src/app/api/v1/work-items/route.ts` (binding) → `src/api/v1/workItems.ts` `createWorkItemHandler`: `getAuthedUser()` → 401 if absent.
3. `workItemService.create()`: resolves project by key, **`permissionService.assertCanMutateBoard`** (PM/LEAD/CONTRIBUTOR floor) → 403/`PermissionError` if the caller isn't at least CONTRIBUTOR on this project. Validates type/epic/feature/assignee references belong to the same project (cross-project reference prevention). Defaults status to the project's first workflow column if unspecified.
4. `workItemRepository.createWithKey()`: single `prisma.$transaction` — atomically increments `Project.nextItemNumber`, creates the `WorkItem` with the generated key (`ORB-42` style), writes a `work_item_created` `OutboxEvent`, writes an `ActivityLog` row, and (if `foundInStoryId` is set — a bug found while testing a story) a second `link_created` event. All committed together — no partial-write window.
5. **Downstream side effect:** the outbox event is only *drained* into a `Notification` when some user's browser next polls the bell (see `cron.md`) — there is a real (if usually short) delay between "work item created" and "assignee notified."

## 3. Move a card (status change)

**Actor:** PM/LEAD/CONTRIBUTOR. **Precondition:** member, item and target status belong to caller's project.

1. `BoardClient.tsx` optimistic UI → `PATCH /api/v1/work-items/{id}/status`.
2. `workItems.ts` `moveWorkItemHandler` → `getAuthedUser()` → 401 if absent.
3. `boardService.moveCard()`: **`permissionService.assertCanMutateBoard`**, validates target `WorkflowStatus` belongs to the project (prevents moving a card into another project's column).
4. `workItemRepository.moveStatus()`: transaction reads current status, updates it, writes a `status_changed` outbox event (payload includes `fromStatusId`/`toStatusId`/`actorUserId`) and an activity log row, same commit.

## 4. AI backlog generation + human approval

**Actor:** PM/LEAD only, both steps. **Precondition:** member with PM/LEAD role; `ProjectAiConfig.aiMode !== DISABLED`.

**Generate:**
1. `GenerateModal.tsx` → `POST /api/v1/projects/{id}/ai/generate` with free-text `inputText` (min 50 chars).
2. `ai.ts` `generateHandler` → `getAuthedUser()` → 401 if absent.
3. `aiService.generateBacklog()`: **`permissionService.assertCanUseAi`** (PM/LEAD) → 403 otherwise. Checks `aiMode !== DISABLED` only — no token/cost budget check (see `automation.md`). **Trust-boundary crossing: Orbit server → Anthropic API**, sending the fixed system prompt + the caller's raw pasted text (no sanitization beyond a `Requirements:\n` label — see `automation.md` for the prompt-injection note). One retry on invalid JSON.
4. Result persisted as `AiGeneration.status = DRAFT` via a plain `prisma.aiGeneration.create` (no transaction, no outbox event — correct, since a draft isn't yet a business mutation and shouldn't notify anyone).

**Approve (the actual authorization-sensitive step — this is where output becomes real data):**
1. `GenerateModal.tsx`/`AiReviewClient.tsx` → `POST /api/v1/projects/{id}/ai/approve` with the (possibly human-edited) tree.
2. `aiService.approveGeneration()`: **`permissionService.assertCanUseAi`** again (re-checked, not trusted from step 1) → requires `status === DRAFT` (prevents double-approval/replay) → re-validates/normalizes the tree server-side (doesn't trust client-submitted edits blindly).
3. `aiGenerationRepository.approveAndCreate()`: one transaction creates real `Epic`/`Feature`/`WorkItem(STORY)`/`TestCase` rows directly in the project's live board (first workflow column), writes `AiGeneratedEntity` audit-link rows, flips `AiGeneration.status = APPROVED`, writes an `ai_generation_approved` outbox event and an activity log row. All same commit.
4. **Note:** as documented in `permissions.md`, this approval gate is hardcoded to PM/LEAD regardless of the project's configured `ProjectAiConfig.approvalRule` — the flow does not branch on that field despite CLAUDE.md describing it as governing "who may approve."

## 5. Team invite

**Actor:** PM only (inviter). **Precondition:** member, PM role.

1. `teamService.invite()`: **`permissionService.assertCanDelete`** (PM-only floor, reused here) → validates email format → creates an `Invitation` row.
2. **Trust-boundary crossing: Orbit server → Supabase Admin API** via `sendInviteEmail()` (`src/lib/supabase/admin.ts`) — best-effort; if `SUPABASE_SERVICE_ROLE_KEY` is unset (currently true in `.env.local`), the send is skipped and only logged, not surfaced as an error to the inviter. The `Invitation` row is the source of truth regardless — acceptance also works via a normal magic-link sign-in matching the invited email (see Flow 1, step 3), so a failed email doesn't strand the invite, but the invitee won't know to expect it. See `emails.md`.

## 6. Daily Pulse submission → blocker flag → notification

**Actor:** PM/LEAD/CONTRIBUTOR (submit); PM/LEAD (respond to blocker). **Precondition:** member.

1. `POST /api/v1/projects/{id}/pulse` → `pulse.ts` handler → `getAuthedUser()` → 401 if absent.
2. `pulseService.submitPulseCore()`: **`permissionService.assertCanSubmitPulse`** (PM/LEAD/CONTRIBUTOR).
3. `pulseRepository.submitPulse()`: transaction writes the `DailyPulse` row, syncs `WorkItem.isBlocked`/`blockerReason` for any items flagged, writes `pulse_submitted` and (if applicable) `blocker_flagged` outbox events.
4. PM/LEAD later responds to a blocker: **`permissionService.assertCanRespondToPulseBlocker`** — writes a `dm_responded`-type event, notifies the original submitter (self-notification filtered out).
5. **Downstream:** same outbox-drain-on-bell-poll dependency as Flow 2 — see `cron.md`. Team digest generation (PM/LEAD/PM-only variants per `permissions.md`) optionally calls the same Anthropic path as Flow 4 to summarize the day's pulses; same lack of budget enforcement.

## Flows explicitly out of scope for this document

Per the shipping-artifacts anti-PRD rule, pure-read dashboards, activity feeds, and report viewing are omitted — they touch only `assertProjectMember` and have no side effects beyond the read itself.
