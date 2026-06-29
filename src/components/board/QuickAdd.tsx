"use client";

import { useState } from "react";
import type { BoardMember, WorkItemType } from "./types";
import { TYPE_META, TypeIcon, WORK_ITEM_TYPES } from "./meta";

export function QuickAdd({
  members,
  stories,
  onCreate,
  onCancel,
}: {
  members: BoardMember[];
  stories: { id: string; itemKey: string; title: string }[];
  onCreate: (input: {
    type: WorkItemType;
    title: string;
    assigneeId: string | null;
    foundInStoryId?: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [type, setType] = useState<WorkItemType>("STORY");
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [foundInStoryId, setFoundInStoryId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate({
        type,
        title: title.trim(),
        assigneeId: assigneeId || null,
        foundInStoryId: type === "BUG" ? foundInStoryId || null : null,
      });
      setTitle("");
      setFoundInStoryId("");
      // keep the form open for rapid entry
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="mb-2 flex gap-1">
        {WORK_ITEM_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            title={TYPE_META[t].label}
            className={`flex h-7 w-7 items-center justify-center rounded ${
              type === t ? "bg-muted ring-1 ring-ring" : "hover:bg-muted"
            }`}
          >
            <TypeIcon type={t} />
          </button>
        ))}
      </div>
      <textarea
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") onCancel();
        }}
        rows={2}
        placeholder="What needs doing?"
        className="w-full resize-none rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring"
      />
      {type === "BUG" && stories.length > 0 && (
        <select
          value={foundInStoryId}
          onChange={(e) => setFoundInStoryId(e.target.value)}
          title="Found while testing"
          className="mt-2 w-full rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground outline-none"
        >
          <option value="">Found while testing… (optional)</option>
          {stories.map((s) => (
            <option key={s.id} value={s.id}>
              {s.itemKey} — {s.title}
            </option>
          ))}
        </select>
      )}

      <div className="mt-2 flex items-center gap-2">
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="flex-1 rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground outline-none"
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim() || busy}
          className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Done
        </button>
      </div>
    </div>
  );
}
