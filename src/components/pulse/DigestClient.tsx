"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/board/meta";
import type { pulseService } from "@/services/pulseService";

type DigestData = Awaited<ReturnType<typeof pulseService.getDigestPageData>>;

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function DigestClient({ initialData }: { initialData: DigestData }) {
  const [data, setData] = useState<DigestData>(initialData);
  const [date, setDate] = useState(initialData.date);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportText, setExportText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  }

  async function reload(nextDate: string, regenerate = false) {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ date: nextDate });
      if (regenerate) sp.set("regenerate", "true");
      const res = await fetch(`/api/v1/projects/${data.project.id}/pulse/digest?${sp}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not load digest.");
      const { digest } = (await res.json()) as { digest: Omit<DigestData, "project"> };
      setData({ project: data.project, ...digest });
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not load digest.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      await reload(date, true);
    } finally {
      setRegenerating(false);
    }
  }

  async function handleRespond(pulseItemId: string, response: string) {
    try {
      const res = await fetch(`/api/v1/projects/${data.project.id}/pulse/${pulseItemId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not respond.");
      setRespondingId(null);
      await reload(date);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not respond.");
    }
  }

  async function handleRemind(userId: string) {
    try {
      const res = await fetch(`/api/v1/projects/${data.project.id}/pulse/remind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not send reminder.");
      flash("Reminder sent.");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not send reminder.");
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/v1/projects/${data.project.id}/pulse/export?date=${date}`,
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not export.");
      const { markdown } = (await res.json()) as { markdown: string };
      setExportText(markdown);
      await navigator.clipboard.writeText(markdown).catch(() => {});
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not export.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col overflow-y-auto px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Team Digest</h1>
          <p className="text-sm text-muted-foreground">{data.dateLabel}</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            reload(e.target.value);
          }}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between rounded-md border border-border bg-card px-4 py-2 text-sm">
        <span className="text-foreground">
          {data.submissionCount} of {data.totalMembers} members submitted · {data.blockers.length}{" "}
          blocker{data.blockers.length === 1 ? "" : "s"}
        </span>
        <button
          onClick={() => reload(date)}
          disabled={loading}
          className="text-primary hover:underline disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {data.aiEnabled ? (
        <div className="mb-4 rounded-md border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              ✨ AI summary
            </span>
            {data.canRegenerate && (
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="text-xs text-primary hover:underline disabled:opacity-50"
              >
                {regenerating ? "Regenerating…" : "Regenerate"}
              </button>
            )}
          </div>
          <p className="mt-2 text-sm text-foreground">
            {data.aiSummary ?? "No summary yet — no updates submitted today."}
          </p>
        </div>
      ) : (
        <div className="mb-4 rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
          AI summary not available (AI is disabled for this project).
        </div>
      )}

      <div className="mb-4 rounded-md border border-danger/40 bg-danger/5 p-4">
        <h2 className="text-sm font-semibold text-danger">Blockers ({data.blockers.length})</h2>
        {data.blockers.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">None reported today.</p>
        ) : (
          <div className="mt-2 flex flex-col gap-3">
            {data.blockers.map((b) => (
              <div key={b.pulseItemId} className="rounded-md border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-sm">
                  <Avatar id={b.userId} name={b.userName} avatarUrl={b.avatarUrl} size={20} />
                  <span className="font-medium text-foreground">{b.userName}</span>
                  <span className="text-muted-foreground">
                    {b.itemKey} · {b.itemTitle}
                  </span>
                </div>
                <p className="mt-1 text-sm text-foreground">{b.blockerDetail}</p>

                {b.dmResponse ? (
                  <p className="mt-2 rounded-md bg-[#0F6E56]/10 px-2 py-1 text-xs text-[#0F6E56]">
                    Responded {b.dmRespondedAt && fmtTime(b.dmRespondedAt)}: {b.dmResponse}
                  </p>
                ) : data.canRespond ? (
                  respondingId === b.pulseItemId ? (
                    <ResponseBox
                      onCancel={() => setRespondingId(null)}
                      onSend={(text) => handleRespond(b.pulseItemId, text)}
                    />
                  ) : (
                    <button
                      onClick={() => setRespondingId(b.pulseItemId)}
                      className="mt-2 text-xs text-primary hover:underline"
                    >
                      Respond
                    </button>
                  )
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">Team updates</h2>
        {data.submitted.map((p) => (
          <div key={p.userId} className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-sm">
              <Avatar id={p.userId} name={p.userName} avatarUrl={p.avatarUrl} size={22} />
              <span className="font-medium text-foreground">{p.userName}</span>
              {p.discipline && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {p.discipline}
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {fmtTime(p.submittedAt)}
              </span>
            </div>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {p.items.map((it) => (
                <li
                  key={it.id}
                  className={it.isBlocker ? "text-danger" : "text-foreground"}
                >
                  <span className="font-medium">{it.itemKey}</span> {it.title}: {it.progressNote}
                </li>
              ))}
            </ul>
            {p.generalNote && (
              <p className="mt-2 text-xs italic text-muted-foreground">{p.generalNote}</p>
            )}
          </div>
        ))}

        {data.unsubmitted.map((m) => (
          <div
            key={m.userId}
            className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
          >
            <Avatar id={m.userId} name={m.name} avatarUrl={m.avatarUrl} size={22} />
            <span>{m.name}</span>
            <span className="italic">No pulse submitted today</span>
            {data.canSendReminder && (
              <button
                onClick={() => handleRemind(m.userId)}
                className="ml-auto text-xs text-primary hover:underline"
              >
                Send reminder
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-sm">
        <Link href={`/${data.project.key}/pulse/history`} className="text-primary hover:underline">
          View pulse history
        </Link>
        {data.canExport && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "Export for sprint call"}
          </button>
        )}
      </div>

      {exportText && (
        <div className="mt-4 rounded-md border border-border bg-card p-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Copied to clipboard — paste into Teams or a sprint call doc.
          </p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-foreground">
            {exportText}
          </pre>
        </div>
      )}
    </div>
  );
}

function ResponseBox({
  onSend,
  onCancel,
}: {
  onSend: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="mt-2 flex flex-col gap-2">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Reply to this blocker…"
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:underline">
          Cancel
        </button>
        <button
          onClick={() => text.trim() && onSend(text.trim())}
          disabled={!text.trim()}
          className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          Send response
        </button>
      </div>
    </div>
  );
}
