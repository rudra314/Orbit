"use client";

import { useEffect, useMemo, useState } from "react";
import type { GenEpic, GeneratedBacklog, GenStory } from "./types";

const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const POINTS = [1, 2, 3, 5, 8, 13];

function storyKey(ei: number, fi: number, si: number) {
  return `${ei}-${fi}-${si}`;
}

// Filters the (edited) tree down to the checked stories, dropping empty
// features and epics. This is exactly what the approve endpoint receives.
function buildApproved(epics: GenEpic[], selected: Set<string>): GeneratedBacklog {
  const out: GenEpic[] = [];
  epics.forEach((epic, ei) => {
    const features = epic.features
      .map((feature, fi) => ({
        ...feature,
        stories: feature.stories.filter((_, si) =>
          selected.has(storyKey(ei, fi, si)),
        ),
      }))
      .filter((f) => f.stories.length > 0);
    if (features.length > 0) out.push({ ...epic, features });
  });
  return { epics: out };
}

export function ReviewTree({
  initial,
  readOnly = false,
  onChange,
}: {
  initial: GeneratedBacklog;
  readOnly?: boolean;
  // Emits the approved subtree and the number of selected stories.
  onChange?: (approved: GeneratedBacklog, selectedStories: number) => void;
}) {
  const [epics, setEpics] = useState<GenEpic[]>(initial.epics);
  const [selected, setSelected] = useState<Set<string>>(() => {
    const all = new Set<string>();
    initial.epics.forEach((e, ei) =>
      e.features.forEach((f, fi) =>
        f.stories.forEach((_, si) => all.add(storyKey(ei, fi, si))),
      ),
    );
    return all;
  });
  const [editing, setEditing] = useState<string | null>(null);

  const approved = useMemo(
    () => buildApproved(epics, selected),
    [epics, selected],
  );

  useEffect(() => {
    onChange?.(approved, selected.size);
    // onChange identity is stable enough for our callers (defined inline but
    // we only care about value changes here).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approved]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function updateStory(ei: number, fi: number, si: number, patch: Partial<GenStory>) {
    setEpics((prev) =>
      prev.map((e, i) =>
        i !== ei
          ? e
          : {
              ...e,
              features: e.features.map((f, j) =>
                j !== fi
                  ? f
                  : {
                      ...f,
                      stories: f.stories.map((s, k) =>
                        k !== si ? s : { ...s, ...patch },
                      ),
                    },
              ),
            },
      ),
    );
  }

  return (
    <div className="space-y-4">
      {epics.map((epic, ei) => (
        <div key={ei} className="rounded-lg border border-border">
          <div className="border-b border-border bg-muted/40 px-3 py-2">
            <h3 className="text-sm font-semibold text-foreground">{epic.title}</h3>
            {epic.description && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {epic.description}
              </p>
            )}
          </div>

          {epic.features.map((feature, fi) => (
            <div key={fi} className="border-b border-border last:border-b-0">
              <div className="bg-muted/20 px-3 py-1.5 text-xs font-medium text-foreground">
                {feature.title}
              </div>
              {feature.stories.map((story, si) => {
                const key = storyKey(ei, fi, si);
                const isEditing = editing === key;
                return (
                  <div key={si} className="border-t border-border px-3 py-2">
                    <div className="flex items-start gap-2">
                      {!readOnly && (
                        <input
                          type="checkbox"
                          checked={selected.has(key)}
                          onChange={() => toggle(key)}
                          className="mt-1 h-4 w-4 accent-[var(--primary)]"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <StoryEditor
                            story={story}
                            onChange={(p) => updateStory(ei, fi, si, p)}
                            onDone={() => setEditing(null)}
                          />
                        ) : (
                          <StoryView
                            story={story}
                            canEdit={!readOnly}
                            onEdit={() => setEditing(key)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function StoryView({
  story,
  canEdit,
  onEdit,
}: {
  story: GenStory;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-muted-foreground"
          aria-label="Toggle details"
        >
          {open ? "▾" : "▸"}
        </button>
        <span className="flex-1 text-sm text-foreground">{story.title}</span>
        <PriorityTag priority={story.priority} />
        {story.storyPoints != null && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {story.storyPoints} pts
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {story.testCases.length} TC
        </span>
        {canEdit && (
          <button
            onClick={onEdit}
            className="text-xs text-primary hover:underline"
          >
            Edit
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-2 pl-5 text-xs">
          {story.description && (
            <Field label="Description">{story.description}</Field>
          )}
          {story.acceptanceCriteria && (
            <Field label="Acceptance criteria">
              <pre className="whitespace-pre-wrap font-sans">
                {story.acceptanceCriteria}
              </pre>
            </Field>
          )}
          {story.edgeCases && <Field label="Edge cases">{story.edgeCases}</Field>}
          {story.testCases.length > 0 && (
            <div>
              <span className="font-medium text-muted-foreground">
                Test cases
              </span>
              <ul className="mt-1 space-y-1">
                {story.testCases.map((tc, i) => (
                  <li key={i} className="rounded border border-border p-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {tc.title}
                      </span>
                      <PriorityTag priority={tc.priority} />
                    </div>
                    {tc.preconditions && (
                      <p className="mt-1 text-muted-foreground">
                        Pre: {tc.preconditions}
                      </p>
                    )}
                    {tc.steps.length > 0 && (
                      <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-muted-foreground">
                        {tc.steps.map((s, j) => (
                          <li key={j}>
                            {s.action}
                            {s.expectedResult ? ` → ${s.expectedResult}` : ""}
                          </li>
                        ))}
                      </ol>
                    )}
                    {tc.expectedResult && (
                      <p className="mt-1 text-muted-foreground">
                        Expected: {tc.expectedResult}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StoryEditor({
  story,
  onChange,
  onDone,
}: {
  story: GenStory;
  onChange: (patch: Partial<GenStory>) => void;
  onDone: () => void;
}) {
  return (
    <div className="space-y-2">
      <input
        value={story.title}
        onChange={(e) => onChange({ title: e.target.value })}
        className="w-full rounded border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-ring"
      />
      <textarea
        value={story.acceptanceCriteria ?? ""}
        onChange={(e) => onChange({ acceptanceCriteria: e.target.value })}
        placeholder="Acceptance criteria (Given/When/Then)…"
        rows={3}
        className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-ring"
      />
      <textarea
        value={story.edgeCases ?? ""}
        onChange={(e) => onChange({ edgeCases: e.target.value })}
        placeholder="Edge cases…"
        rows={2}
        className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-ring"
      />
      <div className="flex items-center gap-2">
        <select
          value={story.priority}
          onChange={(e) => onChange({ priority: e.target.value })}
          className="rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={story.storyPoints ?? ""}
          onChange={(e) =>
            onChange({
              storyPoints: e.target.value === "" ? null : Number(e.target.value),
            })
          }
          className="rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground"
        >
          <option value="">— pts</option>
          {POINTS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button
          onClick={onDone}
          className="ml-auto rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="font-medium text-muted-foreground">{label}</span>
      <div className="text-foreground">{children}</div>
    </div>
  );
}

function PriorityTag({ priority }: { priority: string }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
      {priority}
    </span>
  );
}
