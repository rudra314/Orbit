"use client";

import type { BoardItem } from "./types";
import { Avatar, PriorityDot, TypeIcon } from "./meta";

// Presentational card. Drag wiring is applied by the parent (BoardClient)
// via the passed-in props so this stays reusable for the drag overlay.
export function WorkItemCard({
  item,
  onClick,
  dragging = false,
}: {
  item: BoardItem;
  onClick?: () => void;
  dragging?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-md border border-border bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md ${
        dragging ? "rotate-1 shadow-lg" : ""
      }`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <TypeIcon type={item.type} />
        <span className="text-xs font-medium text-muted-foreground">
          {item.itemKey}
        </span>
        {item.isBlocked && (
          <span
            title={item.blockerReason ?? "Blocked"}
            className="ml-0.5 text-xs text-danger"
          >
            ⚠
          </span>
        )}
        <span className="ml-auto">
          <PriorityDot priority={item.priority} />
        </span>
      </div>

      <p className="line-clamp-2 text-sm text-card-foreground">{item.title}</p>

      <div className="mt-2 flex items-center gap-2">
        {item.storyPoints != null && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {item.storyPoints} pt
          </span>
        )}
        {item.linkCount > 0 && (
          <span
            title={`${item.linkCount} linked item${item.linkCount > 1 ? "s" : ""}`}
            className="flex items-center gap-0.5 text-[11px] text-muted-foreground"
          >
            🔗 {item.linkCount}
          </span>
        )}
        <span className="ml-auto">
          {item.assignee ? (
            <Avatar
              id={item.assignee.id}
              name={item.assignee.name}
              avatarUrl={item.assignee.avatarUrl}
              size={22}
            />
          ) : (
            <span
              title="Unassigned"
              className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-dashed border-border text-[10px] text-muted-foreground"
            >
              ?
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
