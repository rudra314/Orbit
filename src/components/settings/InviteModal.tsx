"use client";

import { useState } from "react";

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

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring";

function pretty(v: string) {
  return v.charAt(0) + v.slice(1).toLowerCase();
}

export function InviteModal({
  projectId,
  onClose,
  onInvited,
}: {
  projectId: string;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("CONTRIBUTOR");
  const [discipline, setDiscipline] =
    useState<(typeof DISCIPLINES)[number]>("DEVELOPMENT");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/team/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, discipline, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not send invite.");
      onInvited();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send invite.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-foreground">Invite member</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              Email address
            </label>
            <input
              autoFocus
              type="email"
              className={inputCls}
              placeholder="teammate@innominds.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">Role</label>
              <select
                className={inputCls}
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {pretty(r)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">
                Discipline
              </label>
              <select
                className={inputCls}
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value as typeof discipline)}
              >
                {DISCIPLINES.map((d) => (
                  <option key={d} value={d}>
                    {pretty(d)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              Message <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              className={inputCls}
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={send}
            disabled={busy || !email.trim()}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send invite"}
          </button>
        </div>
      </div>
    </div>
  );
}
