"use client";

import { useMemo, useState } from "react";
import type { DeliverableDto } from "@/services/deliverableService";
import type { DeliverableStatus } from "@prisma/client";

const STATUS_META: Record<DeliverableStatus, { label: string; color: string }> = {
  PLANNED: { label: "Planned", color: "#6B778C" },
  IN_PROGRESS: { label: "In progress", color: "#0052CC" },
  READY_FOR_REVIEW: { label: "Ready for review", color: "#8777D9" },
  DELIVERED: { label: "Delivered", color: "#00875A" },
  ACCEPTED: { label: "Accepted", color: "#0F6E56" },
  DEFERRED: { label: "Deferred", color: "#FF8B00" },
};

const STATUS_ORDER: DeliverableStatus[] = [
  "PLANNED",
  "IN_PROGRESS",
  "READY_FOR_REVIEW",
  "DELIVERED",
  "ACCEPTED",
  "DEFERRED",
];

type Member = { userId: string; name: string };

type Props = {
  projectKey: string;
  initialDeliverables: DeliverableDto[];
  members: Member[];
  canManage: boolean;
  canMarkDelivered: boolean;
};

function isDelivered(d: DeliverableDto) {
  return d.status === "DELIVERED" || d.status === "ACCEPTED";
}

function isOverdue(d: DeliverableDto) {
  return !!d.dueDate && !isDelivered(d) && new Date(d.dueDate) < startOfToday();
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

export function DeliverablesClient({
  projectKey,
  initialDeliverables,
  members,
  canManage,
  canMarkDelivered,
}: Props) {
  const [items, setItems] = useState<DeliverableDto[]>(initialDeliverables);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<DeliverableDto | null>(null);
  const [showForm, setShowForm] = useState(false);

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  const summary = useMemo(() => {
    return {
      total: items.length,
      delivered: items.filter(isDelivered).length,
      inProgress: items.filter(
        (d) => d.status === "IN_PROGRESS" || d.status === "READY_FOR_REVIEW",
      ).length,
      planned: items.filter((d) => d.status === "PLANNED").length,
      overdue: items.filter(isOverdue).length,
    };
  }, [items]);

  async function handleSave(
    body: Record<string, unknown>,
    existing: DeliverableDto | null,
  ) {
    const url = existing
      ? `/api/v1/deliverables/${existing.id}`
      : "/api/v1/deliverables";
    const method = existing ? "PATCH" : "POST";
    const payload = existing ? body : { ...body, projectKey };
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Could not save.");
    const { deliverable } = (await res.json()) as { deliverable: DeliverableDto };
    setItems((prev) =>
      existing
        ? prev.map((d) => (d.id === deliverable.id ? deliverable : d))
        : [...prev, deliverable],
    );
  }

  async function handleMarkDelivered(d: DeliverableDto) {
    if (!window.confirm(`Mark "${d.name}" as delivered today?`)) return;
    try {
      const res = await fetch(`/api/v1/deliverables/${d.id}/deliver`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed.");
      const { deliverable } = (await res.json()) as { deliverable: DeliverableDto };
      setItems((prev) => prev.map((x) => (x.id === deliverable.id ? deliverable : x)));
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not mark delivered.");
    }
  }

  async function handleDelete(d: DeliverableDto) {
    if (!window.confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
    const snapshot = items;
    setItems((prev) => prev.filter((x) => x.id !== d.id));
    try {
      const res = await fetch(`/api/v1/deliverables/${d.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed.");
    } catch (e) {
      setItems(snapshot);
      flash(e instanceof Error ? e.message : "Could not delete.");
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header + summary */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Deliverables</h1>
            <p className="text-sm text-muted-foreground">
              Track what&apos;s been delivered to the client.
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              + Add deliverable
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <Stat label="Total" n={summary.total} />
          <Stat icon="✅" label="Delivered" n={summary.delivered} tone="text-[#00875A]" />
          <Stat icon="🔄" label="In progress" n={summary.inProgress} tone="text-[#0052CC]" />
          <Stat icon="⏳" label="Planned" n={summary.planned} />
          <Stat icon="⚠️" label="Overdue" n={summary.overdue} tone="text-danger" />
        </div>
      </div>

      {error && (
        <div className="border-b border-danger bg-danger/10 px-6 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-16 text-center text-sm text-muted-foreground">
            No deliverables yet.
            {canManage && " Add the first one to start tracking."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Owner</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Due</th>
                  <th className="px-3 py-2 font-medium">Delivered</th>
                  <th className="px-3 py-2 font-medium">Artifact</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                  {(canManage || canMarkDelivered) && (
                    <th className="px-3 py-2 font-medium">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-medium text-foreground">{d.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{d.owner ?? "—"}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={d.status} />
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2 ${
                        isOverdue(d) ? "font-medium text-danger" : "text-muted-foreground"
                      }`}
                    >
                      {fmt(d.dueDate)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {fmt(d.deliveredAt)}
                    </td>
                    <td className="px-3 py-2">
                      {d.artifactUrl ? (
                        <a
                          href={d.artifactUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                          title={d.artifactUrl}
                        >
                          🔗 link
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td
                      className="max-w-[14rem] truncate px-3 py-2 text-muted-foreground"
                      title={d.notes ?? undefined}
                    >
                      {d.notes ?? "—"}
                    </td>
                    {(canManage || canMarkDelivered) && (
                      <td className="whitespace-nowrap px-3 py-2">
                        <div className="flex gap-2 text-xs">
                          {canManage && (
                            <button
                              onClick={() => {
                                setEditing(d);
                                setShowForm(true);
                              }}
                              className="text-primary hover:underline"
                            >
                              Edit
                            </button>
                          )}
                          {canMarkDelivered && !isDelivered(d) && (
                            <button
                              onClick={() => handleMarkDelivered(d)}
                              className="text-[#00875A] hover:underline"
                            >
                              Mark delivered
                            </button>
                          )}
                          {canManage && (
                            <button
                              onClick={() => handleDelete(d)}
                              className="text-danger hover:underline"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <DeliverableForm
          deliverable={editing}
          members={members}
          onClose={() => setShowForm(false)}
          onSave={async (body) => {
            await handleSave(body, editing);
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  n,
  tone,
}: {
  icon?: string;
  label: string;
  n: number;
  tone?: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {icon && <span>{icon}</span>}
      <span className={`font-semibold ${tone ?? "text-foreground"}`}>{n}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: DeliverableStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ color: meta.color, backgroundColor: `${meta.color}1a` }}
    >
      {meta.label}
    </span>
  );
}

// --- Add/Edit form (modal) -------------------------------------------

function DeliverableForm({
  deliverable,
  members,
  onClose,
  onSave,
}: {
  deliverable: DeliverableDto | null;
  members: Member[];
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(deliverable?.name ?? "");
  const [owner, setOwner] = useState(deliverable?.owner ?? "");
  const [description, setDescription] = useState(deliverable?.description ?? "");
  const [status, setStatus] = useState<DeliverableStatus>(
    deliverable?.status ?? "PLANNED",
  );
  const [dueDate, setDueDate] = useState(
    deliverable?.dueDate ? deliverable.dueDate.slice(0, 10) : "",
  );
  const [artifactUrl, setArtifactUrl] = useState(deliverable?.artifactUrl ?? "");
  const [notes, setNotes] = useState(deliverable?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onSave({
        name: name.trim(),
        owner: owner || null,
        description,
        status,
        dueDate: dueDate || null,
        artifactUrl,
        notes,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-xl">
        <h2 className="text-base font-semibold text-foreground">
          {deliverable ? "Edit deliverable" : "Add deliverable"}
        </h2>

        {err && (
          <div className="mt-3 rounded-md border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {err}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3">
          <Field label="Name">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Owner">
              <select
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as DeliverableStatus)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring"
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Due date">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring"
              />
            </Field>
            <Field label="Artifact URL">
              <input
                value={artifactUrl}
                onChange={(e) => setArtifactUrl(e.target.value)}
                placeholder="https://…"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring"
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring"
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !name.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Saving…" : deliverable ? "Save changes" : "Add deliverable"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}
