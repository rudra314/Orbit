"use client";

import { useState } from "react";
import type { ReportDto, ReportData } from "@/services/reportService";

type Props = {
  report: ReportDto;
  canManage: boolean;
  onClose: () => void;
  onUpdate: (report: ReportDto) => void;
};

// One bullet per line <-> string[] conversion for the list sections.
const toText = (lines: string[]) => lines.join("\n");
const toLines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");

export function ReportEditor({ report, canManage, onClose, onUpdate }: Props) {
  const editable = canManage && report.status === "DRAFT";
  const data = report.data;

  const [summary, setSummary] = useState(report.content.executiveSummary);
  const [achievements, setAchievements] = useState(
    toText(report.content.keyAchievements),
  );
  const [risks, setRisks] = useState(toText(report.content.risksAndBlockers));
  const [nextWeek, setNextWeek] = useState(toText(report.content.nextWeekFocus));
  const [busy, setBusy] = useState<"save" | "approve" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function content() {
    return {
      executiveSummary: summary.trim(),
      keyAchievements: toLines(achievements),
      risksAndBlockers: toLines(risks),
      nextWeekFocus: toLines(nextWeek),
    };
  }

  async function send(
    url: string,
    method: "PATCH" | "POST",
    mode: "save" | "approve",
  ) {
    setBusy(mode);
    setErr(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed.");
      const { report: updated } = (await res.json()) as { report: ReportDto };
      onUpdate(updated);
      if (mode === "approve") onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold text-foreground">{report.title}</h2>
          <button
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {/* Non-editable data widgets */}
          {data && <DataWidgets data={data} />}

          {err && (
            <div className="mt-4 rounded-md border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
              {err}
            </div>
          )}

          {/* Editable narrative sections */}
          <div className="mt-5 flex flex-col gap-4">
            <Section label="Executive summary">
              <textarea
                value={summary}
                readOnly={!editable}
                onChange={(e) => setSummary(e.target.value)}
                rows={4}
                placeholder="3-4 sentence summary for the delivery head…"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring read-only:opacity-80"
              />
            </Section>

            <ListSection
              label="Key achievements this week"
              value={achievements}
              onChange={setAchievements}
              readOnly={!editable}
            />
            <ListSection
              label="Risks and blockers"
              value={risks}
              onChange={setRisks}
              readOnly={!editable}
            />
            <ListSection
              label="Next week focus"
              value={nextWeek}
              onChange={setNextWeek}
              readOnly={!editable}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <button
            disabled
            title="Coming in Phase 2"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground opacity-50"
          >
            Download as PDF
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              Close
            </button>
            {editable && (
              <>
                <button
                  onClick={() => send(`/api/v1/reports/${report.id}`, "PATCH", "save")}
                  disabled={busy !== null}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  {busy === "save" ? "Saving…" : "Save draft"}
                </button>
                <button
                  onClick={() =>
                    send(`/api/v1/reports/${report.id}/approve`, "POST", "approve")
                  }
                  disabled={busy !== null}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {busy === "approve" ? "Approving…" : "Approve and save"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- data widgets ----------------------------------------------------------

function DataWidgets({ data }: { data: ReportData }) {
  const p = data.sprintProgress;
  const blockers = data.openBlockers.length;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Widget label="Sprint progress" tone="text-foreground">
        <div className="text-sm font-semibold text-foreground">
          {p.doneItems}/{p.totalItems} items
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
          <div
            className="h-full rounded bg-primary"
            style={{ width: `${p.pct}%` }}
          />
        </div>
      </Widget>
      <Widget label="Completed this week">
        <span className="text-lg font-semibold text-[#00875A]">
          {data.completedThisWeek.length}
        </span>
      </Widget>
      <Widget label="Open blockers">
        <span
          className={`text-lg font-semibold ${blockers > 0 ? "text-danger" : "text-foreground"}`}
        >
          {blockers}
        </span>
      </Widget>
      <Widget label="Upcoming deliverables">
        <span className="text-lg font-semibold text-foreground">
          {data.upcomingDeliverables.length}
        </span>
      </Widget>
    </div>
  );
}

function Widget({
  label,
  children,
}: {
  label: string;
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function ListSection({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
}) {
  return (
    <Section label={`${label} (one per line)`}>
      <textarea
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring read-only:opacity-80"
      />
    </Section>
  );
}
