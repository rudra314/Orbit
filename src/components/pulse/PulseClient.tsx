"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TypeIcon } from "@/components/board/meta";
import type { WorkItemType } from "@prisma/client";
import type { pulseService } from "@/services/pulseService";

type PulseData = Awaited<ReturnType<typeof pulseService.getPulsePageData>>;
type ActiveItem = PulseData["activeItems"][number];
type PulseItem = NonNullable<PulseData["pulse"]>["items"][number];

type Row = {
  workItemId: string;
  itemKey: string;
  type: string;
  title: string;
  statusName: string;
  statusColor: string;
  progressNote: string;
  isBlocker: boolean;
  blockerDetail: string;
  hoursLogged: string;
};

function fromActive(a: ActiveItem): Row {
  return {
    workItemId: a.id,
    itemKey: a.itemKey,
    type: a.type,
    title: a.title,
    statusName: a.statusName,
    statusColor: a.statusColor,
    progressNote: "",
    isBlocker: false,
    blockerDetail: "",
    hoursLogged: "",
  };
}

function fromPulseItem(p: PulseItem): Row {
  return {
    workItemId: p.workItemId,
    itemKey: p.itemKey,
    type: p.type,
    title: p.title,
    statusName: p.statusName,
    statusColor: p.statusColor,
    progressNote: p.progressNote,
    isBlocker: p.isBlocker,
    blockerDetail: p.blockerDetail ?? "",
    hoursLogged: p.hoursLogged != null ? String(p.hoursLogged) : "",
  };
}

function buildRows(data: PulseData): Row[] {
  const rows = (data.pulse?.items ?? []).map(fromPulseItem);
  const seen = new Set(rows.map((r) => r.workItemId));
  for (const a of data.activeItems) {
    if (!seen.has(a.id)) rows.push(fromActive(a));
  }
  return rows;
}

export function PulseClient({
  data,
  currentUserName,
}: {
  data: PulseData;
  currentUserName: string;
}) {
  const [editing, setEditing] = useState(!data.alreadySubmitted);
  const [submitted, setSubmitted] = useState(data.pulse);
  const [rows, setRows] = useState<Row[]>(() => buildRows(data));
  const [generalNote, setGeneralNote] = useState(data.pulse?.generalNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const router = useRouter();

  const canSubmit = useMemo(() => rows.some((r) => r.progressNote.trim()), [rows]);

  function updateRow(workItemId: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.workItemId === workItemId ? { ...r, ...patch } : r)));
  }

  function removeRow(workItemId: string) {
    setRows((prev) => prev.filter((r) => r.workItemId !== workItemId));
  }

  function addRow(item: { id: string; itemKey: string; type: string; title: string }) {
    if (rows.some((r) => r.workItemId === item.id)) return;
    setRows((prev) => [
      ...prev,
      {
        workItemId: item.id,
        itemKey: item.itemKey,
        type: item.type,
        title: item.title,
        statusName: "",
        statusColor: "#6B778C",
        progressNote: "",
        isBlocker: false,
        blockerDetail: "",
        hoursLogged: "",
      },
    ]);
    setAddOpen(false);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const items = rows
        .filter((r) => r.progressNote.trim())
        .map((r) => ({
          workItemId: r.workItemId,
          progressNote: r.progressNote.trim(),
          isBlocker: r.isBlocker,
          blockerDetail: r.isBlocker ? r.blockerDetail.trim() || null : null,
          hoursLogged: r.hoursLogged.trim() ? Number(r.hoursLogged) : null,
        }));
      const res = await fetch(`/api/v1/projects/${data.project.id}/pulse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          generalNote: generalNote.trim() || null,
          date: data.date,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not submit.");
      const { pulse } = (await res.json()) as { pulse: PulseData["pulse"] };
      setSubmitted(pulse);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit pulse.");
    } finally {
      setBusy(false);
    }
  }

  const submittedTime = submitted
    ? new Date(submitted.submittedAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col overflow-y-auto px-6 py-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Daily Pulse</h1>
          <p className="text-sm text-muted-foreground">
            {data.dateLabel}
            {data.sprintName && ` · ${data.sprintName}, Day ${data.sprintDay}`}
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Filing for
          <input
            type="date"
            value={data.date}
            min={data.yesterdayDate}
            max={data.todayDate}
            onChange={(e) =>
              router.push(`/${data.project.key}/pulse?date=${e.target.value}`)
            }
            className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-ring"
          />
        </label>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {data.canSubmitForYesterday && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-warning/40 bg-warning/10 px-4 py-3">
          <span className="text-sm text-foreground">
            Looks like you missed yesterday&apos;s pulse.
          </span>
          <Link
            href={`/${data.project.key}/pulse?date=${data.yesterdayDate}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Submit for yesterday
          </Link>
        </div>
      )}

      {!editing && submitted ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-md border border-[#00875A]/30 bg-[#00875A]/10 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium text-[#00875A]">
              ✓ Pulse submitted at {submittedTime}
            </span>
            <button
              onClick={() => setEditing(true)}
              className="text-sm text-primary hover:underline"
            >
              Edit submission
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {submitted.items.map((it) => (
              <div key={it.id} className="rounded-md border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <TypeIcon type={it.type as WorkItemType} />
                  <span>{it.itemKey}</span>
                  <span className="truncate text-muted-foreground">{it.title}</span>
                  {it.isBlocker && (
                    <span className="ml-auto rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                      Blocker
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-foreground">{it.progressNote}</p>
                {it.isBlocker && it.blockerDetail && (
                  <p className="mt-1 text-sm text-danger">Blocked: {it.blockerDetail}</p>
                )}
                {it.hoursLogged != null && (
                  <p className="mt-1 text-xs text-muted-foreground">{it.hoursLogged}h logged</p>
                )}
                {it.dmResponse && (
                  <p className="mt-2 rounded-md bg-[#0F6E56]/10 px-2 py-1 text-xs text-[#0F6E56]">
                    DM: {it.dmResponse}
                  </p>
                )}
              </div>
            ))}
            {submitted.generalNote && (
              <p className="rounded-md border border-border bg-card p-3 text-sm italic text-muted-foreground">
                {submitted.generalNote}
              </p>
            )}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          <p>You have no items currently In Progress or In Review.</p>
          <p>Are you working on something? Update its status on the board first.</p>
          <Link href={`/${data.project.key}/board`} className="text-primary hover:underline">
            Go to board
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Your active items today</h2>
            <p className="text-xs text-muted-foreground">
              Add a quick progress note to each item you worked on.
            </p>
          </div>

          {rows.map((r) => (
            <div key={r.workItemId} className="rounded-md border border-border bg-card p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <TypeIcon type={r.type as WorkItemType} />
                <span>{r.itemKey}</span>
                <span className="truncate text-muted-foreground">{r.title}</span>
                {r.statusName && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ color: r.statusColor, backgroundColor: `${r.statusColor}1a` }}
                  >
                    {r.statusName}
                  </span>
                )}
                <button
                  onClick={() => removeRow(r.workItemId)}
                  className="ml-auto text-xs text-muted-foreground hover:underline"
                >
                  Remove this item
                </button>
              </div>

              <textarea
                value={r.progressNote}
                onChange={(e) => updateRow(r.workItemId, { progressNote: e.target.value })}
                placeholder="What did you do on this? Where does it stand?"
                rows={2}
                className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring"
              />

              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={r.isBlocker}
                    onChange={(e) => updateRow(r.workItemId, { isBlocker: e.target.checked })}
                  />
                  Flag as blocker
                </label>
                <label className="flex items-center gap-1.5 text-muted-foreground">
                  Hours today
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={r.hoursLogged}
                    onChange={(e) => updateRow(r.workItemId, { hoursLogged: e.target.value })}
                    className="w-16 rounded-md border border-input bg-background px-1.5 py-1 text-foreground outline-none focus:border-ring"
                  />
                </label>
              </div>

              {r.isBlocker && (
                <textarea
                  value={r.blockerDetail}
                  onChange={(e) => updateRow(r.workItemId, { blockerDetail: e.target.value })}
                  placeholder="What specifically is blocking you? Who can unblock it?"
                  rows={2}
                  className="mt-2 w-full rounded-md border border-danger/40 bg-danger/5 px-2 py-1.5 text-sm text-foreground outline-none focus:border-danger"
                />
              )}
            </div>
          ))}

          <button
            onClick={() => setAddOpen(true)}
            className="self-start text-sm text-primary hover:underline"
          >
            + Add another item
          </button>

          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Anything else the PM/DM should know today?
            <textarea
              value={generalNote}
              onChange={(e) => setGeneralNote(e.target.value)}
              placeholder="Context, risks, decisions made, plans for tomorrow…"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-normal text-foreground outline-none focus:border-ring"
            />
          </label>

          <div className="flex justify-end gap-2">
            {data.alreadySubmitted && (
              <button
                onClick={() => setEditing(false)}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
            )}
            <button
              onClick={submit}
              disabled={!canSubmit || busy}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Submitting…" : "Submit pulse"}
            </button>
          </div>
        </div>
      )}

      {addOpen && (
        <AddItemModal
          projectId={data.project.id}
          onClose={() => setAddOpen(false)}
          onAdd={addRow}
        />
      )}

      <p className="mt-6 text-xs text-muted-foreground">Submitting as {currentUserName}</p>
    </div>
  );
}

function AddItemModal({
  projectId,
  onClose,
  onAdd,
}: {
  projectId: string;
  onClose: () => void;
  onAdd: (item: { id: string; itemKey: string; type: string; title: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; itemKey: string; type: string; title: string }[]
  >([]);
  const [loading, setLoading] = useState(false);

  async function search(q: string) {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v1/projects/${projectId}/pulse/search?q=${encodeURIComponent(q)}`,
      );
      const data = await res.json();
      setResults(data.results ?? []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-foreground">Add another item</h2>
        <input
          autoFocus
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Search by key or title…"
          className="mt-3 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring"
        />
        <div className="mt-2 max-h-64 overflow-y-auto">
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            query.trim() && (
              <p className="py-4 text-center text-sm text-muted-foreground">No matches.</p>
            )
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                onClick={() => onAdd(r)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <TypeIcon type={r.type as WorkItemType} />
                <span className="font-medium text-foreground">{r.itemKey}</span>
                <span className="truncate text-muted-foreground">{r.title}</span>
              </button>
            ))
          )}
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
