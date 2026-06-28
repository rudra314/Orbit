"use client";

import { useState } from "react";
import type {
  BoardColumn,
  BoardItem,
  BoardSprint,
} from "@/components/board/types";
import { Avatar, PRIORITIES, PRIORITY_META, PriorityDot, TypeIcon } from "@/components/board/meta";

export function BacklogItemRow({
  item,
  columns,
  sprints,
  selected,
  canEdit,
  canDelete,
  onToggleSelect,
  onOpen,
  onPatch,
  onDelete,
}: {
  item: BoardItem;
  columns: BoardColumn[];
  sprints: BoardSprint[];
  selected: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [editingPoints, setEditingPoints] = useState(false);
  const [pointsDraft, setPointsDraft] = useState(item.storyPoints?.toString() ?? "");
  const [menuOpen, setMenuOpen] = useState(false);

  const column = columns.find((c) => c.id === item.statusId);
  const sprint = item.sprintId
    ? sprints.find((s) => s.id === item.sprintId)
    : null;

  function commitPoints() {
    setEditingPoints(false);
    const next = pointsDraft === "" ? null : Number(pointsDraft);
    if (next !== item.storyPoints) onPatch({ storyPoints: next });
  }

  return (
    <div
      className={`group flex items-center gap-2 border-b border-border px-3 py-2 text-sm hover:bg-muted/40 ${
        selected ? "bg-primary/5" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        className="shrink-0"
        aria-label={`Select ${item.itemKey}`}
      />
      <TypeIcon type={item.type} />
      <span className="w-16 shrink-0 truncate text-xs text-muted-foreground">
        {item.itemKey}
      </span>

      <button
        onClick={onOpen}
        className="flex-1 truncate text-left text-card-foreground hover:underline"
      >
        {item.isBlocked && <span className="mr-1 text-danger">⚠</span>}
        {item.title}
      </button>

      <span
        className="hidden items-center gap-1 sm:flex"
        title={`${PRIORITY_META[item.priority].label} priority`}
      >
        <PriorityDot priority={item.priority} />
      </span>

      {/* Story points (click to edit) */}
      {editingPoints ? (
        <input
          autoFocus
          type="number"
          min={0}
          value={pointsDraft}
          onChange={(e) => setPointsDraft(e.target.value)}
          onBlur={commitPoints}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitPoints();
            if (e.key === "Escape") setEditingPoints(false);
          }}
          className="w-12 rounded border border-input bg-background px-1 py-0.5 text-xs text-foreground outline-none"
        />
      ) : (
        <button
          onClick={() => canEdit && setEditingPoints(true)}
          title="Story points"
          className="w-9 shrink-0 rounded bg-muted px-1 py-0.5 text-center text-[11px] text-muted-foreground hover:ring-1 hover:ring-ring"
        >
          {item.storyPoints != null ? `${item.storyPoints}` : "–"}
        </button>
      )}

      {/* Status badge */}
      {column && (
        <span
          className="hidden w-24 shrink-0 truncate rounded px-1.5 py-0.5 text-center text-[11px] md:inline-block"
          style={{ color: column.color, backgroundColor: `${column.color}1a` }}
        >
          {column.name}
        </span>
      )}

      {/* Sprint badge */}
      <span className="hidden w-20 shrink-0 truncate text-right text-[11px] text-muted-foreground lg:inline-block">
        {sprint ? sprint.name : ""}
      </span>

      {/* Assignee */}
      <span className="shrink-0">
        {item.assignee ? (
          <Avatar
            id={item.assignee.id}
            name={item.assignee.name}
            avatarUrl={item.assignee.avatarUrl}
            size={22}
          />
        ) : (
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-dashed border-border text-[10px] text-muted-foreground">
            ?
          </span>
        )}
      </span>

      {/* ••• menu */}
      {canEdit && (
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded px-1 text-muted-foreground hover:bg-muted"
            aria-label="Row actions"
          >
            •••
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border border-border bg-card p-2 shadow-lg">
                <label className="mb-1 block text-[11px] text-muted-foreground">
                  Move to sprint
                </label>
                <select
                  value={item.sprintId ?? ""}
                  onChange={(e) => {
                    onPatch({ sprintId: e.target.value || null });
                    setMenuOpen(false);
                  }}
                  className="mb-2 w-full rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground"
                >
                  <option value="">Backlog (no sprint)</option>
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <label className="mb-1 block text-[11px] text-muted-foreground">
                  Change priority
                </label>
                <select
                  value={item.priority}
                  onChange={(e) => {
                    onPatch({ priority: e.target.value });
                    setMenuOpen(false);
                  }}
                  className="mb-2 w-full rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_META[p].label}
                    </option>
                  ))}
                </select>

                {canDelete && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                    className="w-full rounded px-2 py-1 text-left text-xs text-danger hover:bg-danger/10"
                  >
                    Delete item
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
