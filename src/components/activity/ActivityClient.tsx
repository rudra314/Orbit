"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import type { ActivityEvent, ActivityPage } from "./types";
import { buildContext } from "./ActivityTab";
import { ActivityEventRow } from "./ActivityEventRow";
import { dayLabel } from "./time";

const EVENT_CATEGORIES = [
  ["", "All activity"],
  ["status", "Status changes"],
  ["comments", "Comments"],
  ["ai", "AI activity"],
  ["sprint", "Sprint events"],
  ["links", "Links"],
] as const;

const WORK_ITEM_TYPES = [
  ["", "All types"],
  ["STORY", "Story"],
  ["BUG", "Bug"],
  ["TASK", "Task"],
  ["SPIKE", "Spike"],
] as const;

type Filters = {
  category: string;
  userId: string;
  workItemType: string;
  from: string;
  to: string;
};

const EMPTY_FILTERS: Filters = {
  category: "",
  userId: "",
  workItemType: "",
  from: "",
  to: "",
};

export function ActivityClient({
  projectId,
  projectKey,
  columns,
  members,
  sprints,
}: {
  projectId: string;
  projectKey: string;
  columns: { id: string; name: string; color: string }[];
  members: { userId: string; name: string }[];
  sprints: { id: string; name: string }[];
}) {
  const ctx = buildContext(columns, members, sprints);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasAny, setHasAny] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildQuery = useCallback(
    (cur?: string) => {
      const sp = new URLSearchParams();
      if (filters.category) sp.set("category", filters.category);
      if (filters.userId) sp.set("userId", filters.userId);
      if (filters.workItemType) sp.set("workItemType", filters.workItemType);
      if (filters.from) sp.set("from", new Date(filters.from).toISOString());
      // Include the whole "to" day by pushing to end-of-day.
      if (filters.to) {
        const end = new Date(filters.to);
        end.setHours(23, 59, 59, 999);
        sp.set("to", end.toISOString());
      }
      if (cur) sp.set("cursor", cur);
      return sp.toString();
    },
    [filters],
  );

  // Reload from scratch whenever a filter changes. The loading flag is raised by
  // the filter handlers (and the initial state), not synchronously here.
  useEffect(() => {
    let active = true;
    fetch(`/api/v1/projects/${projectId}/activity?${buildQuery()}`)
      .then((r) => r.json())
      .then((d: ActivityPage & { hasAny?: boolean; error?: string }) => {
        if (!active) return;
        if (d.error) {
          setError(d.error);
        } else {
          setError(null);
          setEvents(d.events);
          setCursor(d.nextCursor);
          setHasAny(d.hasAny ?? true);
        }
      })
      .catch(() => active && setError("Could not load activity."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [projectId, buildQuery]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/v1/projects/${projectId}/activity?${buildQuery(cursor)}`,
      );
      const d: ActivityPage = await res.json();
      setEvents((prev) => [...prev, ...d.events]);
      setCursor(d.nextCursor);
    } catch {
      setError("Could not load more activity.");
    } finally {
      setLoadingMore(false);
    }
  }

  function set<K extends keyof Filters>(key: K, value: string) {
    setLoading(true);
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setLoading(true);
    setFilters(EMPTY_FILTERS);
  }

  const selectCls =
    "rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring";

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Activity</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={filters.category}
            onChange={(e) => set("category", e.target.value)}
            className={selectCls}
          >
            {EVENT_CATEGORIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={filters.userId}
            onChange={(e) => set("userId", e.target.value)}
            className={selectCls}
          >
            <option value="">All members</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            value={filters.workItemType}
            onChange={(e) => set("workItemType", e.target.value)}
            className={selectCls}
          >
            {WORK_ITEM_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => set("from", e.target.value)}
            className={selectCls}
            aria-label="From date"
          />
          <input
            type="date"
            value={filters.to}
            onChange={(e) => set("to", e.target.value)}
            className={selectCls}
            aria-label="To date"
          />
          {(filters.category ||
            filters.userId ||
            filters.workItemType ||
            filters.from ||
            filters.to) && (
            <button
              onClick={clearFilters}
              className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {error && (
          <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {loading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : events.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {hasAny
              ? "No activity matches these filters."
              : "No activity yet. Activity appears here as your team works on items."}
          </p>
        ) : (
          <>
            <Timeline events={events} ctx={ctx} projectKey={projectKey} />
            {cursor && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="mt-3 w-full rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Timeline({
  events,
  ctx,
  projectKey,
}: {
  events: ActivityEvent[];
  ctx: ReturnType<typeof buildContext>;
  projectKey: string;
}) {
  return (
    <div>
      {events.map((e, i) => {
        const label = dayLabel(e.createdAt);
        const showDivider = i === 0 || label !== dayLabel(events[i - 1].createdAt);
        return (
          <Fragment key={e.id}>
            {showDivider && (
              <div className="sticky top-0 bg-background py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </div>
            )}
            <ActivityEventRow
              event={e}
              ctx={ctx}
              showItem
              projectKey={projectKey}
            />
          </Fragment>
        );
      })}
    </div>
  );
}
