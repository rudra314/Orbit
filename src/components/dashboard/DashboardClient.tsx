"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardData } from "@/services/dashboardService";
import type { WorkItemType, Severity, ProjectType } from "@prisma/client";

const REFRESH_MS = 60_000;

const HEALTH_META = {
  GREEN: { dot: "🟢", label: "On track", color: "#00875A" },
  AMBER: { dot: "🟡", label: "At risk", color: "#FF8B00" },
  RED: { dot: "🔴", label: "Blocked", color: "#DE350B" },
} as const;

const TYPE_COLOR: Record<WorkItemType, string> = {
  STORY: "#0052CC",
  BUG: "#DE350B",
  TASK: "#00875A",
  SPIKE: "#8777D9",
};

const SEVERITY_COLOR: Record<Severity, string> = {
  BLOCKER: "#DE350B",
  CRITICAL: "#FF5630",
  MAJOR: "#FF8B00",
  MINOR: "#FFAB00",
  TRIVIAL: "#6B778C",
};

const DISCIPLINE_LABEL: Record<string, string> = {
  PRODUCT: "Product",
  UX: "UX",
  DEVELOPMENT: "Development",
  QE: "QE",
  DEVOPS: "DevOps",
  ARCHITECTURE: "Architecture",
  DELIVERY: "Delivery",
  OTHER: "Other",
  UNASSIGNED: "Unassigned",
};

const TYPE_LABEL: Record<WorkItemType, string> = {
  STORY: "Story",
  BUG: "Bug",
  TASK: "Task",
  SPIKE: "Spike",
};

function projectTypeLabel(t: ProjectType) {
  return t === "FIXED_BID" ? "Fixed-bid" : "Internal";
}

export function DashboardClient({
  projectId,
  initialData,
}: {
  projectId: string;
  initialData: DashboardData;
}) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [, forceTick] = useState(0);

  // The data carries the server time it was built; that's our "last updated".
  const lastUpdated = new Date(data.generatedAt).getTime();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/dashboard`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const { data: fresh } = (await res.json()) as { data: DashboardData };
      setData(fresh);
    } catch {
      // Transient network errors are ignored — the next poll retries.
    }
  }, [projectId]);

  // Poll every 60s.
  useEffect(() => {
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Re-render the "updated N ago" label periodically.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const health = HEALTH_META[data.health.level];
  const k = data.keyNumbers;

  return (
    <div className="flex h-full flex-col overflow-auto bg-background">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-border px-6 py-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">
              {data.project?.name ?? "Dashboard"}
            </h1>
            {data.project && (
              <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {projectTypeLabel(data.project.type)}
              </span>
            )}
          </div>
          <div
            className="flex items-center gap-1.5 text-sm font-medium"
            style={{ color: health.color }}
            title={data.health.reasons.join(" · ")}
          >
            <span>{health.dot}</span>
            <span>{health.label}</span>
            <span className="font-normal text-muted-foreground">
              — {data.health.reasons[0]}
            </span>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          Last updated: {relativeTime(lastUpdated)}
        </div>
      </div>

      <div className="flex flex-col gap-5 px-6 py-5">
        {/* Row 1 — key numbers */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KeyCard label="Sprint progress">
            <div className="text-sm font-semibold text-foreground">
              {k.sprintName
                ? `${k.sprintName} — ${k.sprintProgress.done} of ${k.sprintProgress.total} (${k.sprintProgress.pct}%)`
                : "No active sprint"}
            </div>
            {k.sprintName && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-muted">
                <div
                  className="h-full rounded bg-primary"
                  style={{ width: `${k.sprintProgress.pct}%` }}
                />
              </div>
            )}
          </KeyCard>
          <KeyCard label="Days remaining">
            <span className="text-2xl font-semibold text-foreground">
              {k.daysRemaining ?? "—"}
            </span>
            {k.daysRemaining !== null && (
              <span className="ml-1 text-sm text-muted-foreground">days left</span>
            )}
          </KeyCard>
          <KeyCard label="Open blockers">
            <span
              className={`text-2xl font-semibold ${k.openBlockers > 0 ? "text-danger" : "text-foreground"}`}
            >
              {k.openBlockers}
            </span>
          </KeyCard>
          <KeyCard label="Deliverables">
            <span className="text-2xl font-semibold text-foreground">
              {k.deliverables.delivered}
            </span>
            <span className="ml-1 text-sm text-muted-foreground">
              of {k.deliverables.total} delivered
            </span>
          </KeyCard>
        </div>

        {/* Row 2 — work breakdown */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Panel title="Work by status">
            <div className="flex flex-col gap-2">
              {data.workByStatus.map((s) => (
                <div key={s.category}>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{s.label}</span>
                    <span>
                      {s.count} ({s.pct}%)
                    </span>
                  </div>
                  <div className="mt-0.5 h-2 w-full overflow-hidden rounded bg-muted">
                    <div
                      className="h-full rounded bg-primary"
                      style={{ width: `${s.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Work by type">
            <Donut
              segments={data.workByType.map((t) => ({
                label: TYPE_LABEL[t.type],
                value: t.count,
                color: TYPE_COLOR[t.type],
              }))}
            />
          </Panel>

          <Panel title="Work by discipline">
            <BarList
              rows={data.workByDiscipline.map((d) => ({
                label: DISCIPLINE_LABEL[d.discipline] ?? d.discipline,
                value: d.count,
              }))}
            />
          </Panel>
        </div>

        {/* Row 3 — quality and risks */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Panel title="Open bugs by severity">
            <div className="flex flex-wrap gap-2">
              {data.openBugsBySeverity.map((s) => (
                <span
                  key={s.severity}
                  className="rounded px-2 py-1 text-xs font-medium"
                  style={{
                    color: SEVERITY_COLOR[s.severity],
                    backgroundColor: `${SEVERITY_COLOR[s.severity]}1a`,
                  }}
                >
                  {s.severity[0] + s.severity.slice(1).toLowerCase()}: {s.count}
                </span>
              ))}
            </div>
          </Panel>

          <Panel title="Test cases">
            <div className="flex gap-4 text-sm">
              <Stat n={data.testCaseStatus.active} label="Active" tone="text-[#00875A]" />
              <Stat n={data.testCaseStatus.draft} label="Draft" />
              <Stat n={data.testCaseStatus.total} label="Total" />
            </div>
          </Panel>

          <Panel title="High-priority, not in a sprint">
            <span
              className={`text-2xl font-semibold ${data.highPriorityNotInSprint > 0 ? "text-[#FF8B00]" : "text-foreground"}`}
            >
              {data.highPriorityNotInSprint}
            </span>
            <span className="ml-1 text-sm text-muted-foreground">items</span>
          </Panel>
        </div>

        {/* Row 4 — upcoming + latest summary */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Panel title="Upcoming deliverables (next 30 days)">
            {data.upcomingDeliverables.length === 0 ? (
              <p className="text-sm text-muted-foreground">None due soon.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <tbody>
                  {data.upcomingDeliverables.map((d, i) => (
                    <tr key={i} className="border-t border-border first:border-0">
                      <td className="py-1.5 pr-2 text-foreground">{d.name}</td>
                      <td className="py-1.5 text-right text-muted-foreground">
                        {new Date(d.dueDate).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="Latest PM summary">
            {data.latestReport ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {data.latestReport.title}
                  </span>
                  {data.latestReport.approvedAt && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(data.latestReport.approvedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {data.latestReport.excerpt || "No summary text."}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No approved report yet.
              </p>
            )}
          </Panel>
        </div>

        {/* Row 5 — team */}
        <Panel title="Work by assignee">
          {data.workByAssignee.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active work assigned.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Member</th>
                  <th className="py-1 font-medium">In progress</th>
                  <th className="py-1 font-medium">Done this sprint</th>
                </tr>
              </thead>
              <tbody>
                {data.workByAssignee.map((m, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1.5 text-foreground">{m.name}</td>
                    <td className="py-1.5 text-muted-foreground">{m.inProgress}</td>
                    <td className="py-1.5 text-muted-foreground">{m.doneThisSprint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}

// --- presentational helpers -----------------------------------------------

function KeyCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <div className="flex flex-col">
      <span className={`text-lg font-semibold ${tone ?? "text-foreground"}`}>{n}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.every((r) => r.value === 0)) {
    return <p className="text-sm text-muted-foreground">No items.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{r.label}</span>
            <span>{r.value}</span>
          </div>
          <div className="mt-0.5 h-2 w-full overflow-hidden rounded bg-muted">
            <div
              className="h-full rounded bg-[#0052CC]"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Donut({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">No items.</p>;
  }
  // Build a conic-gradient from cumulative slice boundaries (no mutation: each
  // slice's start is the sum of the preceding slices' values).
  const positive = segments.filter((s) => s.value > 0);
  const stops = positive
    .map((s, i) => {
      const before = positive.slice(0, i).reduce((a, x) => a + x.value, 0);
      const from = (before / total) * 360;
      const to = ((before + s.value) / total) * 360;
      return `${s.color} ${from}deg ${to}deg`;
    })
    .join(", ");

  return (
    <div className="flex items-center gap-4">
      <div
        className="h-24 w-24 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops})` }}
      >
        <div className="flex h-full w-full items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-card text-sm font-semibold text-foreground">
            {total}
          </div>
        </div>
      </div>
      <ul className="flex flex-col gap-1 text-xs">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-muted-foreground">
              {s.label} ({s.value})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function relativeTime(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs} seconds ago`;
  const mins = Math.floor(secs / 60);
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}
