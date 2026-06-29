"use client";

import { useEffect, useState } from "react";
import type {
  BoardItem,
  Priority,
  TestCaseDto,
  TestStep,
  TestType,
} from "./types";
import {
  PRIORITIES,
  PRIORITY_META,
  TEST_STATUS_META,
  TEST_TYPE_LABEL,
} from "./meta";

type Filter = "ALL" | "DRAFT" | "ACTIVE" | "REJECTED";
const FILTERS: [Filter, string][] = [
  ["ALL", "All"],
  ["DRAFT", "Draft"],
  ["ACTIVE", "Active"],
  ["REJECTED", "Rejected"],
];

export function TestCasesTab({
  item,
  canEdit,
  canReviewTests,
}: {
  item: BoardItem;
  canEdit: boolean;
  canReviewTests: boolean;
}) {
  const isTemp = item.id.startsWith("temp-");
  const [testCases, setTestCases] = useState<TestCaseDto[]>([]);
  const [loading, setLoading] = useState(!isTemp);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (isTemp) return;
    let active = true;
    fetch(`/api/v1/work-items/${item.id}/test-cases`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) setError(d.error);
        else setTestCases(d.testCases);
      })
      .catch(() => active && setError("Could not load test cases."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [item.id, isTemp]);

  async function save(
    payload: {
      title: string;
      testType: TestType;
      priority: Priority;
      preconditions: string;
      steps: TestStep[];
      expectedResult: string;
    },
    editingId: string | "new",
  ) {
    setError(null);
    const url =
      editingId === "new"
        ? `/api/v1/work-items/${item.id}/test-cases`
        : `/api/v1/test-cases/${editingId}`;
    const res = await fetch(url, {
      method: editingId === "new" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Could not save the test case.");
      return;
    }
    setTestCases(d.testCases);
    setEditing(null);
  }

  async function transition(id: string, action: "approve" | "reject" | "deprecate") {
    setError(null);
    const res = await fetch(`/api/v1/test-cases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Could not update the test case.");
      return;
    }
    setTestCases(d.testCases);
  }

  async function generate() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch(`/api/v1/work-items/${item.id}/test-cases/generate`, {
        method: "POST",
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Generation failed.");
        return;
      }
      setTestCases(d.testCases);
    } catch {
      setError("Generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  if (isTemp) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Save this item before adding test cases.
      </p>
    );
  }
  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  }

  const visible = testCases.filter((tc) =>
    filter === "ALL" ? true : tc.status === filter,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-2.5 py-1 text-xs ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setEditing("new");
              setExpandedId(null);
            }}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            + Add test case
          </button>
          {item.type === "STORY" && (
            <button
              onClick={generate}
              disabled={generating}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {generating ? "Generating…" : "Generate test cases"}
            </button>
          )}
        </div>
      )}

      {editing === "new" && (
        <TestCaseForm
          onCancel={() => setEditing(null)}
          onSave={(p) => save(p, "new")}
        />
      )}

      {visible.length === 0 && editing !== "new" && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No test cases{filter === "ALL" ? " yet" : ` in ${filter.toLowerCase()}`}.
        </p>
      )}

      <div className="space-y-2">
        {visible.map((tc) =>
          editing === tc.id ? (
            <TestCaseForm
              key={tc.id}
              initial={tc}
              onCancel={() => setEditing(null)}
              onSave={(p) => save(p, tc.id)}
            />
          ) : (
            <TestCaseCard
              key={tc.id}
              tc={tc}
              expanded={expandedId === tc.id}
              canEdit={canEdit}
              canReview={canReviewTests}
              onToggle={() =>
                setExpandedId((cur) => (cur === tc.id ? null : tc.id))
              }
              onEdit={() => {
                setEditing(tc.id);
                setExpandedId(null);
              }}
              onTransition={(a) => transition(tc.id, a)}
            />
          ),
        )}
      </div>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {children}
    </span>
  );
}

function TestCaseCard({
  tc,
  expanded,
  canEdit,
  canReview,
  onToggle,
  onEdit,
  onTransition,
}: {
  tc: TestCaseDto;
  expanded: boolean;
  canEdit: boolean;
  canReview: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onTransition: (action: "approve" | "reject" | "deprecate") => void;
}) {
  const status = TEST_STATUS_META[tc.status];
  return (
    <div className="rounded-md border border-border bg-card">
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-2 p-2.5 text-left"
      >
        <span className="mt-0.5 text-xs text-muted-foreground">
          {expanded ? "▾" : "▸"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-card-foreground">{tc.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge color={status.color}>{status.label}</Badge>
            <Badge color="#42526E">{TEST_TYPE_LABEL[tc.testType]}</Badge>
            <Badge color={PRIORITY_META[tc.priority].color}>
              {PRIORITY_META[tc.priority].label}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              {tc.steps.length} step{tc.steps.length === 1 ? "" : "s"}
            </span>
            {tc.aiGenerationId && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                AI generated
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {tc.createdByName ?? "Unknown"} ·{" "}
            {new Date(tc.createdAt).toLocaleDateString()}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border px-2.5 py-3">
          {tc.preconditions && (
            <Field label="Preconditions">
              <p className="whitespace-pre-wrap text-sm text-card-foreground">
                {tc.preconditions}
              </p>
            </Field>
          )}

          <Field label="Steps">
            {tc.steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No steps.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase text-muted-foreground">
                    <th className="w-6 pb-1 font-medium">#</th>
                    <th className="pb-1 font-medium">Action</th>
                    <th className="pb-1 font-medium">Expected result</th>
                  </tr>
                </thead>
                <tbody>
                  {tc.steps.map((s) => (
                    <tr key={s.stepNumber} className="align-top">
                      <td className="py-0.5 pr-1 text-muted-foreground">
                        {s.stepNumber}
                      </td>
                      <td className="py-0.5 pr-2 text-card-foreground">
                        {s.action}
                      </td>
                      <td className="py-0.5 text-card-foreground">
                        {s.expectedResult}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Field>

          {tc.expectedResult && (
            <Field label="Overall expected result">
              <p className="whitespace-pre-wrap text-sm text-card-foreground">
                {tc.expectedResult}
              </p>
            </Field>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {canReview && tc.status === "DRAFT" && (
              <>
                <button
                  onClick={() => onTransition("approve")}
                  className="rounded-md bg-success px-3 py-1 text-xs font-medium text-white"
                >
                  Approve
                </button>
                <button
                  onClick={() => onTransition("reject")}
                  className="rounded-md border border-border px-3 py-1 text-xs text-danger hover:bg-muted"
                >
                  Reject
                </button>
              </>
            )}
            {canReview && tc.status === "ACTIVE" && (
              <button
                onClick={() => onTransition("deprecate")}
                className="rounded-md border border-border px-3 py-1 text-xs text-foreground hover:bg-muted"
              >
                Deprecate
              </button>
            )}
            {canEdit && (
              <button
                onClick={onEdit}
                className="rounded-md border border-border px-3 py-1 text-xs text-foreground hover:bg-muted"
              >
                Edit
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function TestCaseForm({
  initial,
  onCancel,
  onSave,
}: {
  initial?: TestCaseDto;
  onCancel: () => void;
  onSave: (payload: {
    title: string;
    testType: TestType;
    priority: Priority;
    preconditions: string;
    steps: TestStep[];
    expectedResult: string;
  }) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [testType, setTestType] = useState<TestType>(initial?.testType ?? "MANUAL");
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "MEDIUM");
  const [preconditions, setPreconditions] = useState(initial?.preconditions ?? "");
  const [expectedResult, setExpectedResult] = useState(initial?.expectedResult ?? "");
  const [steps, setSteps] = useState<{ action: string; expectedResult: string }[]>(
    initial && initial.steps.length > 0
      ? initial.steps.map((s) => ({ action: s.action, expectedResult: s.expectedResult }))
      : [{ action: "", expectedResult: "" }],
  );
  const [busy, setBusy] = useState(false);

  function setStep(i: number, patch: Partial<{ action: string; expectedResult: string }>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addStep() {
    setSteps((prev) => [...prev, { action: "", expectedResult: "" }]);
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }
  function moveStep(i: number, dir: -1 | 1) {
    setSteps((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function submit() {
    if (!title.trim() || busy) return;
    setBusy(true);
    onSave({
      title: title.trim(),
      testType,
      priority,
      preconditions,
      expectedResult,
      steps: steps
        .filter((s) => s.action.trim())
        .map((s, i) => ({
          stepNumber: i + 1,
          action: s.action.trim(),
          expectedResult: s.expectedResult.trim(),
        })),
    });
  }

  const input =
    "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring";

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-3">
      <p className="text-xs font-semibold text-card-foreground">
        {initial ? "Edit test case" : "New test case"}
      </p>

      <div>
        <FieldLabel>Title</FieldLabel>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What does this test verify?"
          className={input}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Type</FieldLabel>
          <select
            value={testType}
            onChange={(e) => setTestType(e.target.value as TestType)}
            className={input}
          >
            <option value="MANUAL">Manual</option>
            <option value="AUTOMATED">Automated</option>
          </select>
        </div>
        <div>
          <FieldLabel>Priority</FieldLabel>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className={input}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <FieldLabel>Preconditions</FieldLabel>
        <textarea
          value={preconditions}
          onChange={(e) => setPreconditions(e.target.value)}
          rows={2}
          placeholder="Optional"
          className={`${input} resize-y`}
        />
      </div>

      <div>
        <FieldLabel>Steps</FieldLabel>
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="mt-2 w-4 text-xs text-muted-foreground">{i + 1}</span>
              <div className="flex-1 space-y-1">
                <input
                  value={s.action}
                  onChange={(e) => setStep(i, { action: e.target.value })}
                  placeholder="Action"
                  className={input}
                />
                <input
                  value={s.expectedResult}
                  onChange={(e) => setStep(i, { expectedResult: e.target.value })}
                  placeholder="Expected result"
                  className={input}
                />
              </div>
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => moveStep(i, -1)}
                  disabled={i === 0}
                  aria-label="Move step up"
                  className="rounded px-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => moveStep(i, 1)}
                  disabled={i === steps.length - 1}
                  aria-label="Move step down"
                  className="rounded px-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeStep(i)}
                aria-label="Delete step"
                className="mt-1 rounded px-1 text-muted-foreground hover:bg-muted hover:text-danger"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addStep}
          className="mt-2 rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-muted"
        >
          + Add step
        </button>
      </div>

      <div>
        <FieldLabel>Expected result (overall)</FieldLabel>
        <textarea
          value={expectedResult}
          onChange={(e) => setExpectedResult(e.target.value)}
          rows={2}
          placeholder="Optional"
          className={`${input} resize-y`}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={!title.trim() || busy}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-xs font-medium text-muted-foreground">
      {children}
    </label>
  );
}
