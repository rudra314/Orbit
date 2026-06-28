"use client";

import { useState } from "react";
import type { EpicWithStats } from "./types";
import { ROLLUP_META } from "./types";

export function StatusBadge({
  status,
}: {
  status: EpicWithStats["status"];
}) {
  const meta = ROLLUP_META[status];
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ color: meta.color, backgroundColor: `${meta.color}1a` }}
    >
      {meta.label}
    </span>
  );
}

export function EpicSidebar({
  epics,
  selectedEpicId,
  onSelect,
  canEdit,
  onCreateEpic,
  totalItems,
}: {
  epics: EpicWithStats[];
  selectedEpicId: string | null;
  onSelect: (id: string | null) => void;
  canEdit: boolean;
  onCreateEpic: (title: string) => Promise<void>;
  totalItems: number;
}) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await onCreateEpic(title.trim());
      setTitle("");
      setCreating(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-background">
      <div className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Epics
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        <button
          onClick={() => onSelect(null)}
          className={`mb-1 flex w-full items-center justify-between rounded-md px-2 py-2 text-sm ${
            selectedEpicId === null
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <span>All items</span>
          <span className="text-xs text-muted-foreground">{totalItems}</span>
        </button>

        {epics.map((epic) => (
          <button
            key={epic.id}
            onClick={() => onSelect(epic.id)}
            className={`mb-1 block w-full rounded-md px-2 py-2 text-left ${
              selectedEpicId === epic.id
                ? "bg-muted text-foreground"
                : "hover:bg-muted"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm font-medium text-foreground">
                {epic.title}
              </span>
              <span className="text-xs text-muted-foreground">{epic.total}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge status={epic.status} />
              <div className="flex flex-1 items-center gap-1">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-success"
                    style={{ width: `${epic.completionPct}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {epic.completionPct}%
                </span>
              </div>
            </div>
          </button>
        ))}

        {epics.length === 0 && !creating && (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            No epics yet.
          </p>
        )}
      </div>

      {canEdit && (
        <div className="border-t border-border p-2">
          {creating ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") {
                  setCreating(false);
                  setTitle("");
                }
              }}
              onBlur={() => {
                if (!title.trim()) setCreating(false);
              }}
              placeholder="Epic name, then Enter"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring"
            />
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full rounded-md border border-dashed border-border px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              + Create epic
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
