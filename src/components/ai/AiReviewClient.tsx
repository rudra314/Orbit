"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ReviewTree } from "./ReviewTree";
import {
  summaryLine,
  type GeneratedBacklog,
  type GenerationSummary,
} from "./types";

type StatusFilter = "ALL" | GenerationSummary["status"];

const STATUS_STYLE: Record<GenerationSummary["status"], string> = {
  DRAFT: "bg-warning/15 text-warning",
  EDITED: "bg-muted text-muted-foreground",
  APPROVED: "bg-primary/15 text-primary",
  REJECTED: "bg-danger/15 text-danger",
  ARCHIVED: "bg-muted text-muted-foreground",
};

export function AiReviewClient({
  projectId,
  canUseAi,
  generations,
}: {
  projectId: string;
  canUseAi: boolean;
  generations: GenerationSummary[];
}) {
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [reviewing, setReviewing] = useState<GenerationSummary | null>(null);

  const visible = useMemo(
    () =>
      filter === "ALL"
        ? generations
        : generations.filter((g) => g.status === filter),
    [generations, filter],
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">AI review queue</h1>
          <p className="text-sm text-muted-foreground">
            Every AI generation for this project — the PM&apos;s audit trail.
          </p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as StatusFilter)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring"
        >
          {["ALL", "DRAFT", "APPROVED", "REJECTED", "ARCHIVED"].map((s) => (
            <option key={s} value={s}>
              {s === "ALL" ? "All statuses" : s}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-border py-16 text-center text-sm text-muted-foreground">
          No generations{filter !== "ALL" ? ` with status ${filter}` : ""} yet.
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[g.status]}`}
              >
                {g.status}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {summaryLine(g.summary)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(g.createdAt).toLocaleString()}
                  {g.generatedByName ? ` · ${g.generatedByName}` : ""}
                  {g.status === "APPROVED"
                    ? ` · ${g.createdEntityCount} items created`
                    : ""}
                </p>
              </div>
              <button
                onClick={() => setReviewing(g)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                Review
              </button>
            </div>
          ))}
        </div>
      )}

      {reviewing && (
        <ReviewModal
          projectId={projectId}
          generation={reviewing}
          canApprove={canUseAi && reviewing.status === "DRAFT"}
          onClose={() => setReviewing(null)}
        />
      )}
    </div>
  );
}

function ReviewModal({
  projectId,
  generation,
  canApprove,
  onClose,
}: {
  projectId: string;
  generation: GenerationSummary;
  canApprove: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [approved, setApproved] = useState<GeneratedBacklog>(generation.output);
  const [selectedCount, setSelectedCount] = useState(generation.summary.stories);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(path: "approve" | "reject", body: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/ai/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId: generation.id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed.");
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-foreground">
            {generation.status === "DRAFT" ? "Review generation" : "Generation"}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Generated {summaryLine(generation.summary)}.
          </p>
          <ReviewTree
            initial={generation.output}
            readOnly={!canApprove}
            onChange={(a, count) => {
              setApproved(a);
              setSelectedCount(count);
            }}
          />
        </div>

        {generation.reviewNote && (
          <div className="border-t border-border px-4 py-2 text-sm text-muted-foreground">
            Review note: {generation.reviewNote}
          </div>
        )}

        {error && (
          <div className="border-t border-border bg-danger/10 px-4 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {canApprove && (
          <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
            <button
              onClick={() => act("reject", {})}
              disabled={busy}
              className="rounded-md border border-danger px-4 py-1.5 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              Reject all
            </button>
            <button
              onClick={() => act("approve", { approvedItems: approved })}
              disabled={busy || selectedCount === 0}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Approve selected ({selectedCount})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
