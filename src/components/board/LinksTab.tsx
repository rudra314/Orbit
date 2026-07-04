"use client";

import { useEffect, useState } from "react";
import type { BoardItem, LinkDto, LinkSearchResult, LinkType } from "./types";
import {
  Avatar,
  LINK_TYPE_LABEL,
  LINK_TYPE_ORDER,
  LINK_TYPE_REVERSE_LABEL,
  TypeIcon,
} from "./meta";

export function LinksTab({
  item,
  canEdit,
  canRemoveLinks,
  onNavigate,
  onLinkCountChange,
}: {
  item: BoardItem;
  canEdit: boolean;
  canRemoveLinks: boolean;
  onNavigate?: (itemId: string) => void;
  onLinkCountChange?: (itemId: string, count: number) => void;
}) {
  const isTemp = item.id.startsWith("temp-");
  const [links, setLinks] = useState<LinkDto[]>([]);
  const [loading, setLoading] = useState(!isTemp);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (isTemp) return;
    let active = true;
    fetch(`/api/v1/work-items/${item.id}/links`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) setError(d.error);
        else setLinks(d.links);
      })
      .catch(() => active && setError("Could not load links."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [item.id, isTemp]);

  function applyResult(d: { links: LinkDto[]; linkCount: number }) {
    setLinks(d.links);
    onLinkCountChange?.(item.id, d.linkCount);
  }

  async function createLink(targetItemId: string, linkType: LinkType) {
    setError(null);
    const res = await fetch(`/api/v1/work-items/${item.id}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetItemId, linkType }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Could not create the link.");
      return;
    }
    applyResult(d);
    setAdding(false);
  }

  async function removeLink(linkId: string) {
    setError(null);
    const snapshot = links;
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
    const res = await fetch(`/api/v1/work-items/${item.id}/links/${linkId}`, {
      method: "DELETE",
    });
    const d = await res.json();
    if (!res.ok) {
      setLinks(snapshot);
      setError(d.error ?? "Could not remove the link.");
      return;
    }
    applyResult(d);
  }

  if (isTemp) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Save this item before adding links.
      </p>
    );
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  }

  const grouped = LINK_TYPE_ORDER.flatMap((type) => {
    const out = links.filter((l) => l.linkType === type && l.direction === "out");
    const inc = links.filter((l) => l.linkType === type && l.direction === "in");
    return [
      { key: `${type}-out`, label: LINK_TYPE_LABEL[type], rows: out },
      {
        key: `${type}-in`,
        label: LINK_TYPE_REVERSE_LABEL[type] ?? LINK_TYPE_LABEL[type],
        rows: inc,
      },
    ];
  }).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {grouped.length === 0 && !adding && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No links yet.
        </p>
      )}

      {grouped.map((g) => (
        <div key={g.key}>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.label} ({g.rows.length})
          </h4>
          <div className="space-y-1.5">
            {g.rows.map((l) => (
              <LinkRow
                key={l.id}
                link={l}
                canRemove={canRemoveLinks}
                onNavigate={onNavigate}
                onRemove={() => removeLink(l.id)}
              />
            ))}
          </div>
        </div>
      ))}

      {canEdit &&
        (adding ? (
          <AddLinkForm
            itemId={item.id}
            onCancel={() => setAdding(false)}
            onSelect={createLink}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            + Add link
          </button>
        ))}
    </div>
  );
}

function LinkRow({
  link,
  canRemove,
  onNavigate,
  onRemove,
}: {
  link: LinkDto;
  canRemove: boolean;
  onNavigate?: (itemId: string) => void;
  onRemove: () => void;
}) {
  const it = link.item;
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
      <button
        onClick={() => onNavigate?.(it.id)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        title={`${it.itemKey} ${it.title}`}
      >
        <TypeIcon type={it.type} className="h-3.5 w-3.5 shrink-0" />
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {it.itemKey}
        </span>
        <span className="truncate text-sm text-card-foreground">{it.title}</span>
      </button>
      <StatusBadge name={it.statusName} color={it.statusColor} />
      {it.assignee ? (
        <Avatar
          id={it.assignee.id}
          name={it.assignee.name}
          avatarUrl={it.assignee.avatarUrl}
          size={20}
        />
      ) : (
        <span className="h-5 w-5 shrink-0" />
      )}
      {canRemove && (
        <button
          onClick={onRemove}
          aria-label="Remove link"
          className="shrink-0 rounded px-1 text-muted-foreground hover:bg-muted hover:text-danger"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function StatusBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {name}
    </span>
  );
}

function AddLinkForm({
  itemId,
  onCancel,
  onSelect,
}: {
  itemId: string;
  onCancel: () => void;
  onSelect: (targetItemId: string, linkType: LinkType) => void;
}) {
  const [linkType, setLinkType] = useState<LinkType>("RELATES_TO");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkSearchResult[]>([]);

  useEffect(() => {
    const q = query.trim();
    let active = true;
    const timer = setTimeout(() => {
      if (!q) {
        if (active) setResults([]);
        return;
      }
      fetch(`/api/v1/work-items/${itemId}/link-search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => active && setResults(d.results ?? []))
        .catch(() => active && setResults([]));
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, itemId]);

  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-card-foreground">Add link</span>
        <button
          onClick={onCancel}
          className="rounded px-1 text-muted-foreground hover:bg-muted"
          aria-label="Cancel"
        >
          ✕
        </button>
      </div>
      <select
        value={linkType}
        onChange={(e) => setLinkType(e.target.value as LinkType)}
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring"
      >
        {LINK_TYPE_ORDER.map((t) => (
          <option key={t} value={t}>
            {LINK_TYPE_LABEL[t]}
          </option>
        ))}
      </select>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by key or title…"
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring"
      />
      {results.length > 0 && (
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => onSelect(r.id, linkType)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
            >
              <TypeIcon type={r.type} className="h-3.5 w-3.5 shrink-0" />
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                {r.itemKey}
              </span>
              <span className="truncate text-sm text-card-foreground">{r.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
