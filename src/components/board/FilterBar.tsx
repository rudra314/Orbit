"use client";

import type {
  BoardItem,
  BoardMember,
  BoardSprint,
  Discipline,
  Priority,
  WorkItemType,
} from "./types";
import { DISCIPLINES, PRIORITIES, PRIORITY_META, TYPE_META, WORK_ITEM_TYPES } from "./meta";

export type Filters = {
  assigneeId: string;
  type: WorkItemType | "";
  priority: Priority | "";
  sprintId: string;
  discipline: Discipline | "";
  myItems: boolean;
  blockedOnly: boolean;
};

export const DEFAULT_FILTERS: Filters = {
  assigneeId: "",
  type: "",
  priority: "",
  sprintId: "",
  discipline: "",
  myItems: false,
  blockedOnly: false,
};

export function activeFilterCount(f: Filters) {
  let n = 0;
  if (f.assigneeId) n++;
  if (f.type) n++;
  if (f.priority) n++;
  if (f.sprintId) n++;
  if (f.discipline) n++;
  if (f.myItems) n++;
  if (f.blockedOnly) n++;
  return n;
}

// Pure predicate so the same logic is testable and reused.
export function matchesFilters(
  item: BoardItem,
  f: Filters,
  currentUserId: string,
) {
  if (f.myItems && item.assigneeId !== currentUserId) return false;
  if (f.assigneeId) {
    if (f.assigneeId === "__unassigned__") {
      if (item.assigneeId) return false;
    } else if (item.assigneeId !== f.assigneeId) return false;
  }
  if (f.type && item.type !== f.type) return false;
  if (f.priority && item.priority !== f.priority) return false;
  if (f.sprintId) {
    if (f.sprintId === "__unassigned__") {
      if (item.sprintId) return false;
    } else if (item.sprintId !== f.sprintId) return false;
  }
  if (f.discipline && item.discipline !== f.discipline) return false;
  if (f.blockedOnly && !item.isBlocked) return false;
  return true;
}

const selectCls =
  "rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-ring";

export function FilterBar({
  members,
  sprints,
  filters,
  setFilters,
}: {
  members: BoardMember[];
  sprints: BoardSprint[];
  filters: Filters;
  setFilters: (f: Filters) => void;
}) {
  const count = activeFilterCount(filters);
  const set = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch });

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2">
      <button
        type="button"
        onClick={() => set({ myItems: !filters.myItems })}
        className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
          filters.myItems
            ? "border-primary bg-primary/10 text-foreground"
            : "border-border text-muted-foreground hover:bg-muted"
        }`}
      >
        My items
      </button>

      <select
        value={filters.assigneeId}
        onChange={(e) => set({ assigneeId: e.target.value })}
        className={selectCls}
      >
        <option value="">Assignee: any</option>
        <option value="__unassigned__">Unassigned</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.name}
          </option>
        ))}
      </select>

      <select
        value={filters.type}
        onChange={(e) => set({ type: e.target.value as Filters["type"] })}
        className={selectCls}
      >
        <option value="">Type: any</option>
        {WORK_ITEM_TYPES.map((t) => (
          <option key={t} value={t}>
            {TYPE_META[t].label}
          </option>
        ))}
      </select>

      <select
        value={filters.priority}
        onChange={(e) => set({ priority: e.target.value as Filters["priority"] })}
        className={selectCls}
      >
        <option value="">Priority: any</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_META[p].label}
          </option>
        ))}
      </select>

      <select
        value={filters.sprintId}
        onChange={(e) => set({ sprintId: e.target.value })}
        className={selectCls}
      >
        <option value="">Sprint: all items</option>
        <option value="__unassigned__">Backlog (no sprint)</option>
        {sprints.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.status === "ACTIVE" ? " (active)" : ""}
          </option>
        ))}
      </select>

      <select
        value={filters.discipline}
        onChange={(e) =>
          set({ discipline: e.target.value as Filters["discipline"] })
        }
        className={selectCls}
      >
        <option value="">Discipline: any</option>
        {DISCIPLINES.map((d) => (
          <option key={d} value={d}>
            {d.charAt(0) + d.slice(1).toLowerCase()}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => set({ blockedOnly: !filters.blockedOnly })}
        className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
          filters.blockedOnly
            ? "border-danger bg-danger/10 text-danger"
            : "border-border text-muted-foreground hover:bg-muted"
        }`}
      >
        ⚠ Blocked
      </button>

      {count > 0 && (
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
            {count} active
          </span>
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
