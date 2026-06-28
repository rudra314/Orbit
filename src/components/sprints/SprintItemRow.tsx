"use client";

import type { BoardColumn, BoardItem } from "@/components/board/types";
import { Avatar, PriorityDot, TypeIcon } from "@/components/board/meta";

// Presentational backlog-style row used across sprint views. Drag wiring (in
// the planning view) is applied by a wrapper, so this stays hook-free.
export function SprintItemRow({
  item,
  columns,
  onClick,
  right,
  dimmed = false,
}: {
  item: BoardItem;
  columns: BoardColumn[];
  onClick?: () => void;
  right?: React.ReactNode;
  dimmed?: boolean;
}) {
  const col = columns.find((c) => c.id === item.statusId);
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 border-b border-border bg-card px-3 py-2 text-sm ${
        onClick ? "cursor-pointer hover:bg-muted/40" : ""
      } ${dimmed ? "opacity-50 line-through" : ""}`}
    >
      <TypeIcon type={item.type} />
      <span className="w-16 shrink-0 truncate text-xs text-muted-foreground">
        {item.itemKey}
      </span>
      <span className="flex-1 truncate text-card-foreground">
        {item.isBlocked && <span className="mr-1 text-danger">⚠</span>}
        {item.title}
      </span>
      <PriorityDot priority={item.priority} />
      <span className="w-9 shrink-0 rounded bg-muted px-1 py-0.5 text-center text-[11px] text-muted-foreground">
        {item.storyPoints != null ? item.storyPoints : "–"}
      </span>
      {col && (
        <span
          className="hidden w-24 shrink-0 truncate rounded px-1.5 py-0.5 text-center text-[11px] md:inline-block"
          style={{ color: col.color, backgroundColor: `${col.color}1a` }}
        >
          {col.name}
        </span>
      )}
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
      {right}
    </div>
  );
}
