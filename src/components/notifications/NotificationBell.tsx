"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { relativeTime } from "@/components/activity/time";
import { notificationIcon, type NotificationDto } from "./types";

const POLL_MS = 60_000;

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Poll the unread count on mount and every 60s.
  useEffect(() => {
    let active = true;
    async function tick() {
      try {
        const res = await fetch("/api/v1/notifications/unread-count");
        if (!res.ok) return;
        const data = await res.json();
        if (active && typeof data.count === "number") setCount(data.count);
      } catch {
        // transient — the next poll will retry
      }
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Close the panel on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function loadList() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/notifications?limit=10");
      const data = await res.json();
      setItems(data.notifications ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  }

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setCount(0);
    await fetch("/api/v1/notifications/read-all", { method: "POST" });
  }

  async function openNotification(n: NotificationDto) {
    setOpen(false);
    if (!n.read) {
      setCount((c) => Math.max(0, c - 1));
      fetch(`/api/v1/notifications/${n.id}/read`, { method: "POST" });
    }
    if (n.link) router.push(n.link);
  }

  const badge = count > 9 ? "9+" : String(count);

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        title="Notifications"
        onClick={toggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
      >
        🔔
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-md border border-border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold text-foreground">
              Notifications
            </span>
            <button
              onClick={markAllRead}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Mark all as read
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Loading…
              </p>
            ) : items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                You&apos;re all caught up.
              </p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className="flex w-full gap-2 border-b border-border px-3 py-2.5 text-left hover:bg-muted"
                >
                  <span className="mt-0.5 shrink-0 text-base leading-none">
                    {notificationIcon(n.type)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-foreground">{n.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {relativeTime(n.createdAt)}
                    </span>
                  </span>
                  {!n.read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              ))
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-3 py-2 text-center text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
