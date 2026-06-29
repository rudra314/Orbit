"use client";

import { useState } from "react";
import type { ReportDto } from "@/services/reportService";
import type { ReportStatus } from "@prisma/client";
import { ReportEditor } from "./ReportEditor";

const STATUS_META: Record<ReportStatus, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "#6B778C" },
  APPROVED: { label: "Approved", color: "#00875A" },
  SHARED: { label: "Shared", color: "#0052CC" },
  ARCHIVED: { label: "Archived", color: "#97A0AF" },
};

type Props = {
  projectId: string;
  initialReports: ReportDto[];
  canManage: boolean;
};

export function ReportsClient({ projectId, initialReports, canManage }: Props) {
  const [reports, setReports] = useState<ReportDto[]>(initialReports);
  const [open, setOpen] = useState<ReportDto | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/reports`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Generation failed.");
      const { report } = (await res.json()) as { report: ReportDto };
      setReports((prev) => [report, ...prev]);
      setOpen(report);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not generate report.");
    } finally {
      setGenerating(false);
    }
  }

  function applyUpdate(updated: ReportDto) {
    setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setOpen(updated);
  }

  async function handleArchive(report: ReportDto) {
    if (!window.confirm(`Archive "${report.title}"?`)) return;
    try {
      const res = await fetch(`/api/v1/reports/${report.id}/archive`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed.");
      const { report: updated } = (await res.json()) as { report: ReportDto };
      setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not archive.");
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Weekly reports</h1>
          <p className="text-sm text-muted-foreground">
            Status updates for the delivery head, drafted from live project data.
          </p>
        </div>
        {canManage && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate report"}
          </button>
        )}
      </div>

      {error && (
        <div className="border-b border-danger bg-danger/10 px-6 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto px-6 py-4">
        {reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-16 text-center text-sm text-muted-foreground">
            No reports yet.
            {canManage && " Generate the first weekly status update."}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {reports.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{r.title}</span>
                    <StatusBadge status={r.status} />
                    {r.aiAssisted && (
                      <span className="rounded bg-[#8777D9]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#8777D9]">
                        ✨ AI assisted
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Created {new Date(r.createdAt).toLocaleDateString()}
                    {r.approvedAt &&
                      ` · Approved ${new Date(r.approvedAt).toLocaleDateString()}`}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <button
                    onClick={() => setOpen(r)}
                    className="text-primary hover:underline"
                  >
                    {canManage && r.status === "DRAFT" ? "Edit" : "View"}
                  </button>
                  {canManage && r.status !== "ARCHIVED" && (
                    <button
                      onClick={() => handleArchive(r)}
                      className="text-muted-foreground hover:underline"
                    >
                      Archive
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {open && (
        <ReportEditor
          report={open}
          canManage={canManage}
          onClose={() => setOpen(null)}
          onUpdate={applyUpdate}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ReportStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ color: meta.color, backgroundColor: `${meta.color}1a` }}
    >
      {meta.label}
    </span>
  );
}
