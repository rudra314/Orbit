# Permissions

## Roles

- **Org level** (`OrgRole`: `OWNER | ADMIN | MEMBER`, `prisma/orbit-schema-v3.prisma:89-93`) — **defined but not enforced anywhere in code.** `orgRepository.ts` only checks membership existence (`countMembership`) and hardcodes `role: "MEMBER"` on every new member (`ensureMember`, line 23). No code path branches on `OWNER` vs `ADMIN` vs `MEMBER`. Treat org-level role as a placeholder for future multi-tenant/billing work, not a current control.
- **Project level** (`ProjectRole`: `PM > LEAD > CONTRIBUTOR > VIEWER > GUEST`, schema lines 203-220) — this is where all real authorization happens. Rank order (`src/services/permissionService.ts:16-22`): PM=4, LEAD=3, CONTRIBUTOR=2, VIEWER=1, GUEST=0.
- **Discipline** (e.g. `QE`) — a project-member attribute used for one specific carve-out (test case review), not a general permission axis.

Scope is always derived from the DB, never from the session token: every `permissionService` check does a fresh `projectMemberRepository.find(projectId, userId)` lookup per call — no caching, no stale-claim risk, but also no batching (N+1-safe per request, not per page load — see `performance-audit-static` for whether this matters).

`GUEST` exists in the schema and is offered in the initial project-setup invite UI, but `teamService.ts`'s `ROLES` array (used by `changeRole`) omits it — a member's role can never be changed *to* GUEST after project creation. Minor inconsistency, not a security gap (GUEST is the lowest rank).

## Enforcement point

Authorization is enforced exclusively in **`src/services/permissionService.ts`**, called from the service layer (never from `src/api/v1/*.ts` route handlers directly, and never from `src/app/**`). API handlers only check *authentication* (`getAuthedUser()` → 401); services check *authorization* (`permissionService.assert*()` → throws `PermissionError` → mapped to 403 by the handler). This means a bug that skips calling a service function bypasses authorization — reviewed and no such gap was found (see Resource × Operation matrix below, "coverage" column).

There is no row-level security (RLS) in Postgres — Supabase RLS is not used for the application's own tables (only relevant to Supabase's own `auth.users`). All authorization is code-enforced in `permissionService`.

## permissionService — full function inventory

| Function | Guard | Used for |
|---|---|---|
| `assertProjectRole(userId, projectId, minRole)` | generic floor via `ROLE_RANK` | building block for the below |
| `assertCanCreateProject(userId, orgId)` | any org member | project creation |
| `assertProjectMember(userId, projectId)` | membership only | read-access gate (backlog, board, dashboard, digest views, etc.) |
| `assertCanMutateBoard(userId, projectId)` | PM/LEAD/CONTRIBUTOR | create/update/delete work items, move cards, epics, features |
| `assertCanManageSprints` | PM/LEAD | create/start/complete/delete sprints |
| `assertCanUseAi` | PM/LEAD | trigger AI backlog generation, approve/reject generations |
| `assertCanManageLinks` | PM/LEAD | create/remove work-item links |
| `assertCanReviewTestCase` | PM/LEAD, or Discipline===QE | review/status-change a test case |
| `assertCanDelete` | PM only | delete work items, invite team members (reused for invite — see note below) |
| `assertCanImport` | PM/LEAD | backlog Excel import |
| `assertCanManageDeliverables` | PM only | create/update/delete deliverables |
| `assertCanMarkDelivered` | PM/LEAD | mark a deliverable delivered |
| `assertCanManageReports` | PM/LEAD | weekly report create/update |
| `assertCanSubmitPulse` | PM/LEAD/CONTRIBUTOR | submit a daily pulse |
| `assertCanRespondToPulseBlocker` | PM/LEAD | respond to a flagged blocker |
| `assertCanManagePulseDigest` | PM only | regenerate AI digest, send reminder |
| `assertCanExportPulseDigest` | PM/LEAD | export digest markdown |

Note: `teamService.invite()` reuses `assertCanDelete` (PM-only) rather than a dedicated `assertCanInvite` — functionally correct (invites are PM-only) but the name is misleading if read in isolation; flagged for maintainers, not a bug.

`teamService.changeRole()` (`teamService.ts:106-123`) and `changeDiscipline()` (`:162-163`) use inline PM/LEAD/self-service branches rather than a single `permissionService` helper — more granular logic than the generic helpers support (e.g., a member can change their own discipline; only PM/LEAD can change others'). Reviewed and consistent with intent, just not centralized.

## Resource × Operation × Role matrix

| Resource | Create | Read | Update | Delete | Notes |
|---|---|---|---|---|---|
| Project | PM (any org member can create a new one) | any project member | PM only (`settingsService`) | PM only (archive/delete) | |
| Epic / Feature | PM/LEAD/CONTRIBUTOR | any member | PM/LEAD/CONTRIBUTOR | PM/LEAD/CONTRIBUTOR (via `assertCanMutateBoard`) | |
| Work Item (Story/Bug/Task/Spike) | PM/LEAD/CONTRIBUTOR | any member | PM/LEAD/CONTRIBUTOR | PM only | move-card/status change also PM/LEAD/CONTRIBUTOR |
| Sprint | PM/LEAD | any member | PM/LEAD | PM/LEAD | start/complete same floor |
| Test Case | via AI approval or manual (PM/LEAD/CONTRIBUTOR through board mutation path) | any member | PM/LEAD, or QE discipline | PM only (assumed via generic delete floor — no dedicated check found beyond `assertCanReviewTestCase` for status changes) | |
| Deliverable | PM only | any member | PM only | PM only | mark-delivered relaxed to PM/LEAD |
| Weekly Report | PM/LEAD | any member | PM/LEAD | not found as a separate action | |
| Comment | any member (own) | any member | author-only within 15 min edit window | author, or PM (`assertCanDelete`) for others' comments | ownership + time-window check, not role-based |
| Link (WorkItemLink) | PM/LEAD | any member | n/a | PM/LEAD | |
| Team membership | PM only (invite) | any member (roster read) | PM only (role/discipline change has extra self-service carve-out) | PM only (remove) | |
| Daily Pulse | PM/LEAD/CONTRIBUTOR (submit) | any member | n/a | n/a | blocker-response: PM/LEAD; digest regenerate/reminder: PM only; export: PM/LEAD |
| AI Generation | PM/LEAD (trigger) | PM/LEAD (implicit — review UI) | PM/LEAD (approve/reject) | n/a | see `automation.md` — approvalRule config is not actually consulted |
| Notification | system-only create (via outbox worker) | own user only (scoped by SQL `WHERE userId`, not by a permission check) | own user only (mark read) | n/a | cross-user access structurally impossible, not permission-gated |
| Audit Log | n/a (system-written) | LEAD+ (read); PM-only for export | n/a | n/a | |
| Activity Log | n/a (system-written) | any member | n/a | n/a | |
| Import (Excel backlog) | PM/LEAD | n/a | n/a | n/a | |

## Coverage audit result

Every service file with mutating methods was checked for a `permissionService` call preceding the mutation (70 call sites across 20 service files, enumerated during the codebase read). **No missing permission check was found.** Three services have no `permissionService` calls by design, each with a different, verified reason:

- `notificationService.ts` — read/mark-read scoped by `WHERE userId = :self` in the repository query itself; cross-user access is structurally impossible rather than checked.
- `backlogService.ts` — read-only; the underlying `projectRepository.getByKeyForUser` bakes membership into the Prisma `where` clause.
- `authService.ts` — the bootstrap path (`ensureUser` on login) is explicitly pre-authorization by definition.

## Gaps worth reviewer attention

1. **Org-level roles are unenforced** (see above) — if a future feature needs org-admin-only actions (billing, cross-project settings), there is currently no code path to gate on `OWNER`/`ADMIN`.
2. **`ProjectAiConfig.approvalRule` is defined but never read** — `aiService.approveGeneration` hardcodes PM-or-LEAD regardless of the configured rule. A project set to `ANY_REVIEWER` cannot actually grant approval rights to a non-PM/LEAD reviewer. See `automation.md`.
