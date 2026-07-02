"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/board/meta";
import { absoluteTime, relativeTime } from "@/components/activity/time";
import type { AuditEntry } from "@/services/auditService";

const ACTIONS = [
  ["", "All actions"],
  ["created", "Created"],
  ["updated", "Updated"],
  ["deleted", "Deleted"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["role_changed", "Role changed"],
  ["permission_changed", "Permission changed"],
] as const;

const ENTITY_TYPES = [
  ["", "All entities"],
  ["WorkItem", "Work item"],
  ["Sprint", "Sprint"],
  ["Project", "Project"],
  ["AiGeneration", "AI generation"],
  ["ProjectMember", "Member"],
  ["Invitation", "Invitation"],
  ["ProjectAiConfig", "AI config"],
] as const;

type Filters = {
  action: string;
  userId: string;
  entityType: string;
  from: string;
  to: string;
};

const EMPTY: Filters = { action: "", userId: "", entityType: "", from: "", to: "" };

const selectCls =
  "rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring";

function pretty(v: string) {
  return v
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

// Renders a compact "field: old → new" summary from the audit row's values.
function summarize(entry: AuditEntry): string {
  const oldV = (entry.oldValue ?? {}) as Record<string, unknown>;
  const newV = (entry.newValue ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(oldV), ...Object.keys(newV)])];
  if (keys.length === 0) return "—";

  const fmt = (v: unknown) =>
    v == null
      ? "—"
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);

  return keys
    .slice(0, 4)
    .map((k) => {
      const before = oldV[k];
      const after = newV[k];
      if (k in oldV && k in newV) return `${k}: ${fmt(before)} → ${fmt(after)}`;
      if (k in newV) return `${k}: ${fmt(after)}`;
      return `${k}: ${fmt(before)}`;
    })
    .join("; ");
}

export function AuditClient({
  projectId,
  projectKey,
  canExport,
  actors,
  initialEntries,
  initialCursor,
}: {
  projectId: string;
  projectKey: string;
  canExport: boolean;
  actors: { id: string; name: string }[];
  initialEntries: AuditEntry[];
  initialCursor: string | null;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [entries, setEntries] = useState<AuditEntry[]>(initialEntries);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Skip the fetch on first mount — the server already provided page one.
  const firstRender = useRef(true);

  const buildQuery = useCallback(
    (cur?: string) => {
      const sp = new URLSearchParams();
      if (filters.action) sp.set("action", filters.action);
      if (filters.userId) sp.set("userId", filters.userId);
      if (filters.entityType) sp.set("entityType", filters.entityType);
      if (filters.from) sp.set("from", new Date(filters.from).toISOString());
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

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    let active = true;
    setLoading(true);
    fetch(`/api/v1/projects/${projectId}/audit?${buildQuery()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) setError(d.error);
        else {
          setError(null);
          setEntries(d.entries);
          setCursor(d.nextCursor);
        }
      })
      .catch(() => active && setError("Could not load the audit log."))
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
        `/api/v1/projects/${projectId}/audit?${buildQuery(cursor)}`,
      );
      const d = await res.json();
      setEntries((prev) => [...prev, ...d.entries]);
      setCursor(d.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  function set<K extends keyof Filters>(key: K, value: string) {
    setFilters((p) => ({ ...p, [key]: value }));
  }

  function exportCsv() {
    const qs = buildQuery();
    window.open(
      `/api/v1/projects/${projectId}/audit/export?format=csv${qs ? `&${qs}` : ""}`,
      "_blank",
    );
  }

  const hasFilters =
    filters.action || filters.userId || filters.entityType || filters.from || filters.to;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">Audit log</h1>
          {canExport && (
            <button
              onClick={exportCsv}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            >
              Export CSV
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={filters.action}
            onChange={(e) => set("action", e.target.value)}
            className={selectCls}
          >
            {ACTIONS.map(([v, l]) => (
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
            <option value="">All actors</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={filters.entityType}
            onChange={(e) => set("entityType", e.target.value)}
            className={selectCls}
          >
            {ENTITY_TYPES.map(([v, l]) => (
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
          {hasFilters && (
            <button
              onClick={() => setFilters(EMPTY)}
              className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {error && <p className="text-sm text-danger">{error}</p>}

        {loading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {hasFilters
              ? "No audit entries match these filters."
              : "No audit history yet."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Actor</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Entity</th>
                  <th className="px-3 py-2 font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td
                      className="whitespace-nowrap px-3 py-2 text-muted-foreground"
                      title={absoluteTime(e.createdAt)}
                    >
                      {relativeTime(e.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      {e.actor ? (
                        <span className="flex items-center gap-2">
                          <Avatar
                            id={e.actor.id}
                            name={e.actor.name}
                            avatarUrl={e.actor.avatarUrl}
                            size={20}
                          />
                          <span className="text-foreground">{e.actor.name}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">System</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-foreground">{pretty(e.action)}</td>
                    <td className="px-3 py-2">
                      {e.entityKey ? (
                        <Link
                          href={`/${projectKey}/board?item=${e.entityId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {e.entityKey}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          {pretty(e.entityType)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {summarize(e)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {cursor && !loading && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="mt-3 w-full rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}
