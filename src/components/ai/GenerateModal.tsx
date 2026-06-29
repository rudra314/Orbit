"use client";

import { useState } from "react";
import { ReviewTree } from "./ReviewTree";
import { summaryLine, type GeneratedBacklog, type GenerationSummaryCounts } from "./types";

type Step = "input" | "generating" | "review";

const MIN_CHARS = 50;

export function GenerateModal({
  projectId,
  aiEnabled,
  modelLabel,
  onClose,
  onApproved,
}: {
  projectId: string;
  aiEnabled: boolean;
  modelLabel: string;
  onClose: () => void;
  onApproved: (counts: GenerationSummaryCounts) => void;
}) {
  const [step, setStep] = useState<Step>("input");
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [output, setOutput] = useState<GeneratedBacklog>({ epics: [] });
  const [summary, setSummary] = useState<GenerationSummaryCounts | null>(null);
  const [approved, setApproved] = useState<GeneratedBacklog>({ epics: [] });
  const [selectedCount, setSelectedCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const canGenerate = aiEnabled && input.trim().length >= MIN_CHARS && !busy;

  async function handleGenerate() {
    setError(null);
    setStep("generating");
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/ai/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputText: input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed.");
      setGenerationId(data.generationId);
      setOutput(data.output);
      setApproved(data.output);
      setSummary(data.summary);
      setSelectedCount(data.summary.stories);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
      setStep("input");
    }
  }

  async function handleApprove() {
    if (!generationId || selectedCount === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/ai/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId, approvedItems: approved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Approval failed.");
      onApproved(data.counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed.");
      setBusy(false);
    }
  }

  async function handleReject() {
    if (!generationId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/ai/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reject failed.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed.");
      setBusy(false);
    }
  }

  // The modal can't be dismissed while a generation is in flight.
  const dismissable = step !== "generating";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-foreground">
            {step === "review"
              ? "Review generated backlog"
              : "Generate backlog from requirements"}
          </h2>
          {dismissable && (
            <button
              onClick={onClose}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {step === "input" && (
            <div className="space-y-3">
              <textarea
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste your requirements, feature description, or SOW section here…"
                rows={10}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Using {modelLabel}</span>
                <span>
                  {input.trim().length} chars
                  {input.trim().length < MIN_CHARS &&
                    ` (min ${MIN_CHARS})`}
                </span>
              </div>
              {!aiEnabled && (
                <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
                  AI generation is disabled for this project. Enable it in
                  project settings → AI config.
                </p>
              )}
            </div>
          )}

          {step === "generating" && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Spinner />
              <p className="text-sm font-medium text-foreground">
                Generating stories and test cases…
              </p>
              <p className="text-xs text-muted-foreground">
                Usually takes 15–30 seconds
              </p>
            </div>
          )}

          {step === "review" && summary && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Generated {summaryLine(summary)}.
              </p>
              <ReviewTree
                initial={output}
                onChange={(a, count) => {
                  setApproved(a);
                  setSelectedCount(count);
                }}
              />
            </div>
          )}
        </div>

        {error && (
          <div className="border-t border-border bg-danger/10 px-4 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          {step === "input" && (
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Generate
            </button>
          )}
          {step === "review" && (
            <>
              <button
                onClick={handleReject}
                disabled={busy}
                className="rounded-md border border-danger px-4 py-1.5 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                Reject all
              </button>
              <button
                onClick={handleApprove}
                disabled={busy || selectedCount === 0}
                className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Approve selected ({selectedCount})
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
  );
}
