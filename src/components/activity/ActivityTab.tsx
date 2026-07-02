"use client";

import { useEffect, useState } from "react";
import type { ActivityContext, ActivityEvent, ActivityPage } from "./types";
import { ActivityEventRow } from "./ActivityEventRow";

// Builds the id → name/color lookups the renderer needs from the board context
// already loaded in the detail panel.
export function buildContext(
  columns: { id: string; name: string; color: string }[],
  members: { userId: string; name: string }[],
  sprints: { id: string; name: string }[],
): ActivityContext {
  return {
    statuses: Object.fromEntries(
      columns.map((c) => [c.id, { name: c.name, color: c.color }]),
    ),
    members: Object.fromEntries(members.map((m) => [m.userId, m.name])),
    sprints: Object.fromEntries(sprints.map((s) => [s.id, s.name])),
  };
}

export function ActivityTab({
  itemId,
  ctx,
}: {
  itemId: string;
  ctx: ActivityContext;
}) {
  const isTemp = itemId.startsWith("temp-");
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isTemp);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isTemp) return;
    let active = true;
    fetch(`/api/v1/work-items/${itemId}/activity`)
      .then((r) => r.json())
      .then((d: ActivityPage & { error?: string }) => {
        if (!active) return;
        if (d.error) setError(d.error);
        else {
          setEvents(d.events);
          setCursor(d.nextCursor);
        }
      })
      .catch(() => active && setError("Could not load activity."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [itemId, isTemp]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/v1/work-items/${itemId}/activity?cursor=${cursor}`,
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

  if (isTemp) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Activity appears once this item is saved.
      </p>
    );
  }
  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  }
  if (error) {
    return (
      <p className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
    );
  }
  if (events.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        History begins here — no activity yet.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {events.map((e) => (
        <ActivityEventRow key={e.id} event={e} ctx={ctx} />
      ))}
      {cursor && (
        <div className="pt-3">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
