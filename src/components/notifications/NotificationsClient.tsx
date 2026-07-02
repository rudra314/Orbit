"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { relativeTime, absoluteTime } from "@/components/activity/time";
import { notificationIcon, type NotificationDto } from "./types";

export function NotificationsClient({
  initialItems,
  initialCursor,
}: {
  initialItems: NotificationDto[];
  initialCursor: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/v1/notifications?limit=30&cursor=${cursor}`);
      const data = await res.json();
      setItems((prev) => [...prev, ...(data.notifications ?? [])]);
      setCursor(data.nextCursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  }

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await fetch("/api/v1/notifications/read-all", { method: "POST" });
  }

  function open(n: NotificationDto) {
    if (!n.read) {
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
      );
      fetch(`/api/v1/notifications/${n.id}/read`, { method: "POST" });
    }
    if (n.link) router.push(n.link);
  }

  return (
    <div className="flex-1 px-6 py-4">
      {items.length > 0 && (
        <div className="mb-2 flex justify-end">
          <button
            onClick={markAllRead}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Mark all as read
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <span className="text-3xl" aria-hidden>
            ✅
          </span>
          <p className="text-sm text-muted-foreground">You&apos;re all caught up.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => open(n)}
                className="flex w-full gap-3 px-4 py-3 text-left hover:bg-muted"
              >
                <span className="mt-0.5 shrink-0 text-lg leading-none">
                  {notificationIcon(n.type)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-foreground">{n.title}</span>
                  {n.body && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {n.body}
                    </span>
                  )}
                  <span
                    className="mt-0.5 block text-xs text-muted-foreground"
                    title={absoluteTime(n.createdAt)}
                  >
                    {relativeTime(n.createdAt)}
                  </span>
                </span>
                {!n.read && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {cursor && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-3 w-full rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-60"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
