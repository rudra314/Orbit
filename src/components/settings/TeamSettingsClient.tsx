"use client";

import { useState } from "react";
import { Avatar } from "@/components/board/meta";
import type {
  TeamData,
  TeamMemberDto,
  PendingInviteDto,
} from "@/services/teamService";
import { InviteModal } from "./InviteModal";

const ROLES = ["PM", "LEAD", "CONTRIBUTOR", "VIEWER"] as const;
const DISCIPLINES = [
  "PRODUCT",
  "UX",
  "DEVELOPMENT",
  "QE",
  "DEVOPS",
  "ARCHITECTURE",
  "DELIVERY",
  "OTHER",
] as const;

const LEAD_ASSIGNABLE = new Set(["CONTRIBUTOR", "VIEWER"]);

function pretty(v: string) {
  return v.charAt(0) + v.slice(1).toLowerCase();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const selectCls =
  "rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-ring disabled:opacity-60";

export function TeamSettingsClient({
  projectId,
  currentUserId,
  initial,
}: {
  projectId: string;
  currentUserId: string;
  initial: TeamData;
}) {
  const [members, setMembers] = useState<TeamMemberDto[]>(initial.members);
  const [invites, setInvites] = useState<PendingInviteDto[]>(initial.invitations);
  const viewerRole = initial.viewerRole;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const isPM = viewerRole === "PM";
  const canResend = viewerRole === "PM" || viewerRole === "LEAD";

  async function refresh() {
    const res = await fetch(`/api/v1/projects/${projectId}/team`);
    if (res.ok) {
      const data: TeamData = await res.json();
      setMembers(data.members);
      setInvites(data.invitations);
    }
  }

  function canChangeRole(member: TeamMemberDto) {
    if (isPM) return true;
    if (viewerRole === "LEAD") return LEAD_ASSIGNABLE.has(member.role);
    return false;
  }

  function roleOptionsFor() {
    if (isPM) return ROLES;
    // Lead may only move a member between Contributor and Viewer.
    return ROLES.filter((r) => LEAD_ASSIGNABLE.has(r));
  }

  function canChangeDiscipline(member: TeamMemberDto) {
    return isPM || member.userId === currentUserId;
  }

  async function mutate(url: string, init: RequestInit, label: string) {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Something went wrong.");
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  function changeRole(member: TeamMemberDto, role: string) {
    mutate(
      `/api/v1/projects/${projectId}/team/${member.userId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      },
      `role-${member.userId}`,
    );
  }

  function changeDiscipline(member: TeamMemberDto, discipline: string) {
    mutate(
      `/api/v1/projects/${projectId}/team/${member.userId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discipline }),
      },
      `disc-${member.userId}`,
    );
  }

  function removeMember(member: TeamMemberDto) {
    if (!confirm(`Remove ${member.name} from this project?`)) return;
    mutate(
      `/api/v1/projects/${projectId}/team/${member.userId}`,
      { method: "DELETE" },
      `remove-${member.userId}`,
    );
  }

  function resendInvite(invite: PendingInviteDto) {
    mutate(
      `/api/v1/projects/${projectId}/team/invitations/${invite.id}/resend`,
      { method: "POST" },
      `resend-${invite.id}`,
    );
  }

  function cancelInvite(invite: PendingInviteDto) {
    if (!confirm(`Cancel the invitation to ${invite.email}?`)) return;
    mutate(
      `/api/v1/projects/${projectId}/team/invitations/${invite.id}`,
      { method: "DELETE" },
      `cancel-${invite.id}`,
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Members */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Members ({members.length})
          </h2>
          {isPM && (
            <button
              onClick={() => setShowInvite(true)}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              Invite member
            </button>
          )}
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2 font-medium">Member</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Discipline</th>
                <th className="px-3 py-2 font-medium">Joined</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar id={m.userId} name={m.name} avatarUrl={m.avatarUrl} size={28} />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">
                          {m.name}
                          {m.userId === currentUserId && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              (you)
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {m.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {canChangeRole(m) ? (
                      <select
                        className={selectCls}
                        value={m.role}
                        disabled={busy === `role-${m.userId}`}
                        onChange={(e) => changeRole(m, e.target.value)}
                      >
                        {/* Keep the current role visible even if not normally assignable. */}
                        {Array.from(new Set([m.role, ...roleOptionsFor()])).map((r) => (
                          <option key={r} value={r}>
                            {pretty(r)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-foreground">{pretty(m.role)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {canChangeDiscipline(m) ? (
                      <select
                        className={selectCls}
                        value={m.discipline}
                        disabled={busy === `disc-${m.userId}`}
                        onChange={(e) => changeDiscipline(m, e.target.value)}
                      >
                        {DISCIPLINES.map((d) => (
                          <option key={d} value={d}>
                            {pretty(d)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-foreground">{pretty(m.discipline)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {fmtDate(m.joinedAt)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isPM && (
                      <button
                        onClick={() => removeMember(m)}
                        disabled={busy === `remove-${m.userId}`}
                        className="text-xs text-danger hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pending invitations */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-foreground">
          Pending invitations ({invites.length})
        </h2>
        {invites.length === 0 ? (
          <p className="rounded-md border border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No pending invitations.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Invited by</th>
                  <th className="px-3 py-2 font-medium">Sent</th>
                  <th className="px-3 py-2 font-medium">Expires</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-foreground">{inv.email}</td>
                    <td className="px-3 py-2 text-foreground">{pretty(inv.role)}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {inv.invitedByName}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {fmtDate(inv.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {fmtDate(inv.expiresAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-3">
                        {canResend && (
                          <button
                            onClick={() => resendInvite(inv)}
                            disabled={busy === `resend-${inv.id}`}
                            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                          >
                            Resend
                          </button>
                        )}
                        {isPM && (
                          <button
                            onClick={() => cancelInvite(inv)}
                            disabled={busy === `cancel-${inv.id}`}
                            className="text-xs text-danger hover:underline disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showInvite && (
        <InviteModal
          projectId={projectId}
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
