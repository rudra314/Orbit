"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type {
  BoardColumn,
  BoardItem,
  BoardMember,
  StatusCategory,
  WorkItemType,
} from "@/components/board/types";
import {
  PRIORITIES,
  PRIORITY_META,
  TYPE_META,
  TypeIcon,
  WORK_ITEM_TYPES,
} from "@/components/board/meta";
import { WorkItemDetail } from "@/components/board/WorkItemDetail";
import { GenerateModal } from "@/components/ai/GenerateModal";
import { EpicSidebar, StatusBadge } from "./EpicSidebar";
import { BacklogItemRow } from "./BacklogItemRow";
import type {
  BacklogData,
  EpicWithStats,
  FeatureRollup,
  RollupStatus,
} from "./types";

type Filters = {
  type: WorkItemType | "";
  priority: string;
  assigneeId: string;
  statusId: string;
  sprint: string; // "", "__unassigned__", or sprintId
  search: string;
};

const EMPTY_FILTERS: Filters = {
  type: "",
  priority: "",
  assigneeId: "",
  statusId: "",
  sprint: "",
  search: "",
};

function rollup(
  items: BoardItem[],
  catOf: Map<string, StatusCategory>,
): { total: number; done: number; completionPct: number; status: RollupStatus } {
  let done = 0;
  let inProg = 0;
  for (const it of items) {
    const c = catOf.get(it.statusId);
    if (c === "COMPLETED") done++;
    else if (c === "IN_PROGRESS") inProg++;
  }
  const total = items.length;
  const status: RollupStatus =
    total === 0
      ? "NOT_STARTED"
      : done === total
        ? "COMPLETED"
        : done > 0 || inProg > 0
          ? "IN_PROGRESS"
          : "NOT_STARTED";
  return {
    total,
    done,
    completionPct: total === 0 ? 0 : Math.round((done / total) * 100),
    status,
  };
}

export function BacklogClient({ data }: { data: BacklogData }) {
  const {
    project,
    columns,
    members,
    sprints,
    currentUserId,
    canEdit,
    canDelete,
    canImport,
    canUseAi,
    aiEnabled,
    aiModelLabel,
  } = data;

  const [showGenerate, setShowGenerate] = useState(false);
  const [items, setItems] = useState<BoardItem[]>(data.items);
  const [epics, setEpics] = useState<EpicWithStats[]>(data.epics);
  const [selectedEpicId, setSelectedEpicId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [unassignedToSprint, setUnassignedToSprint] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createType, setCreateType] = useState<WorkItemType | null>(null);
  const [createFeatureId, setCreateFeatureId] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catOf = useMemo(
    () => new Map(columns.map((c) => [c.id, c.category])),
    [columns],
  );

  function flash(message: string) {
    setError(message);
    setTimeout(() => setError(null), 3500);
  }

  // Live epic/feature stats derived from current items.
  const epicViews = useMemo(
    () =>
      epics.map((e) => {
        const eItems = items.filter((it) => it.epicId === e.id);
        const stats = rollup(eItems, catOf);
        return {
          ...e,
          ...stats,
          features: e.features.map((f) => {
            const fi = eItems.filter((it) => it.featureId === f.id);
            const fstats = rollup(fi, catOf);
            return { ...f, ...fstats };
          }),
        };
      }),
    [epics, items, catOf],
  );

  const selectedEpic = epicViews.find((e) => e.id === selectedEpicId) ?? null;

  // Filtering predicate.
  const visible = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return items.filter((it) => {
      if (selectedEpicId && it.epicId !== selectedEpicId) return false;
      if (filters.type && it.type !== filters.type) return false;
      if (filters.priority && it.priority !== filters.priority) return false;
      if (filters.assigneeId && it.assigneeId !== filters.assigneeId) return false;
      if (filters.statusId && it.statusId !== filters.statusId) return false;
      if (unassignedToSprint && it.sprintId) return false;
      if (filters.sprint === "__unassigned__" && it.sprintId) return false;
      if (
        filters.sprint &&
        filters.sprint !== "__unassigned__" &&
        it.sprintId !== filters.sprint
      )
        return false;
      if (
        q &&
        !it.title.toLowerCase().includes(q) &&
        !it.itemKey.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [items, filters, selectedEpicId, unassignedToSprint]);

  const detailItem = detailId
    ? (items.find((i) => i.id === detailId) ?? null)
    : null;

  // --- Mutations ------------------------------------------------------

  async function handlePatch(id: string, patch: Record<string, unknown>) {
    const snapshot = items;
    setItems((prev) =>
      prev.map((it) => (it.id === id ? applyPatch(it, patch, members) : it)),
    );
    try {
      const res = await fetch(`/api/v1/work-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Update failed");
      const { item } = await res.json();
      setItems((prev) => prev.map((it) => (it.id === id ? item : it)));
    } catch (e) {
      setItems(snapshot);
      flash(e instanceof Error ? e.message : "Could not save.");
    }
  }

  async function handleMove(id: string, statusId: string) {
    const snapshot = items;
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, statusId } : it)),
    );
    try {
      const res = await fetch(`/api/v1/work-items/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Move failed");
      const { item } = await res.json();
      setItems((prev) => prev.map((it) => (it.id === id ? item : it)));
    } catch (e) {
      setItems(snapshot);
      flash(e instanceof Error ? e.message : "Could not move.");
    }
  }

  async function handleDelete(id: string) {
    const snapshot = items;
    setItems((prev) => prev.filter((it) => it.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (detailId === id) setDetailId(null);
    try {
      const res = await fetch(`/api/v1/work-items/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed");
    } catch (e) {
      setItems(snapshot);
      flash(e instanceof Error ? e.message : "Could not delete.");
    }
  }

  async function handleCreateItem(input: {
    type: WorkItemType;
    title: string;
    assigneeId: string | null;
    storyPoints: number | null;
    featureId: string | null;
  }) {
    const tempId = `temp-${Date.now()}`;
    const temp = buildTempItem(tempId, input, selectedEpicId, members, columns);
    setItems((prev) => [...prev, temp]);
    try {
      const res = await fetch("/api/v1/work-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectKey: project.key,
          type: input.type,
          title: input.title,
          assigneeId: input.assigneeId,
          epicId: selectedEpicId,
          featureId: input.featureId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Create failed");
      const { item } = await res.json();
      setItems((prev) => prev.map((it) => (it.id === tempId ? item : it)));
      if (input.storyPoints != null) {
        handlePatch(item.id, { storyPoints: input.storyPoints });
      }
    } catch (e) {
      setItems((prev) => prev.filter((it) => it.id !== tempId));
      flash(e instanceof Error ? e.message : "Could not create item.");
    }
  }

  async function handleCreateEpic(title: string) {
    try {
      const res = await fetch("/api/v1/epics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectKey: project.key, title }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Create failed");
      const { epic } = await res.json();
      setEpics((prev) => [
        ...prev,
        { ...epic, total: 0, done: 0, completionPct: 0, features: [] },
      ]);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not create epic.");
    }
  }

  async function handleCreateFeature(epicId: string, title: string) {
    try {
      const res = await fetch("/api/v1/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epicId, title }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Create failed");
      const { feature } = await res.json();
      setEpics((prev) =>
        prev.map((e) =>
          e.id === epicId
            ? {
                ...e,
                features: [
                  ...e.features,
                  { id: feature.id, title: feature.title, total: 0, done: 0, status: "NOT_STARTED" as RollupStatus },
                ],
              }
            : e,
        ),
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not create feature.");
    }
  }

  async function handleBulk(action: string, value: string | null) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const snapshot = items;
    // Optimistic
    if (action === "delete") {
      setItems((prev) => prev.filter((it) => !selectedIds.has(it.id)));
    } else {
      setItems((prev) =>
        prev.map((it) => {
          if (!selectedIds.has(it.id)) return it;
          if (action === "sprint") return { ...it, sprintId: value };
          if (action === "priority") return applyPatch(it, { priority: value }, members);
          if (action === "assignee") return applyPatch(it, { assigneeId: value }, members);
          return it;
        }),
      );
    }
    setSelectedIds(new Set());
    try {
      const res = await fetch("/api/v1/work-items/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectKey: project.key, ids, action, value }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Bulk action failed");
    } catch (e) {
      setItems(snapshot);
      flash(e instanceof Error ? e.message : "Bulk action failed.");
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Group visible items by feature when an epic is selected.
  const ungrouped = visible.filter((it) => !it.featureId);

  return (
    <div className="flex h-full overflow-hidden">
      <EpicSidebar
        epics={epicViews}
        selectedEpicId={selectedEpicId}
        onSelect={(id) => {
          setSelectedEpicId(id);
          setCreateType(null);
        }}
        canEdit={canEdit}
        onCreateEpic={handleCreateEpic}
        totalItems={items.length}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Search title or key…"
            className="w-48 rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-ring"
          />
          <FilterSelect
            value={filters.type}
            onChange={(v) => setFilters({ ...filters, type: v as Filters["type"] })}
            placeholder="Type: any"
            options={WORK_ITEM_TYPES.map((t) => ({ value: t, label: TYPE_META[t].label }))}
          />
          <FilterSelect
            value={filters.priority}
            onChange={(v) => setFilters({ ...filters, priority: v })}
            placeholder="Priority: any"
            options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))}
          />
          <FilterSelect
            value={filters.assigneeId}
            onChange={(v) => setFilters({ ...filters, assigneeId: v })}
            placeholder="Assignee: any"
            options={members.map((m) => ({ value: m.userId, label: m.name }))}
          />
          <FilterSelect
            value={filters.statusId}
            onChange={(v) => setFilters({ ...filters, statusId: v })}
            placeholder="Status: any"
            options={columns.map((c) => ({ value: c.id, label: c.name }))}
          />
          <FilterSelect
            value={filters.sprint}
            onChange={(v) => setFilters({ ...filters, sprint: v })}
            placeholder="Sprint: any"
            options={[
              { value: "__unassigned__", label: "Unassigned to sprint" },
              ...sprints.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <button
            onClick={() => setUnassignedToSprint((v) => !v)}
            className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
              unassignedToSprint
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            Needs planning
          </button>

          {canImport && (
            <Link
              href={`/${project.key}/backlog/import`}
              className="ml-auto rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              ↑ Import
            </Link>
          )}

          {canUseAi && (
            <button
              onClick={() => setShowGenerate(true)}
              className={`${canImport ? "" : "ml-auto"} rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary`}
            >
              ✦ Generate stories
            </button>
          )}

          {canEdit && (
            <div className={`relative ${canUseAi ? "" : "ml-auto"}`}>
              <button
                onClick={() => setCreateMenuOpen((v) => !v)}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
              >
                + Create item
              </button>
              {createMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setCreateMenuOpen(false)}
                  />
                  <div className="absolute right-0 z-20 mt-1 w-36 rounded-md border border-border bg-card p-1 shadow-lg">
                    {WORK_ITEM_TYPES.map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          setCreateType(t);
                          setCreateFeatureId(null);
                          setCreateMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                      >
                        <TypeIcon type={t} /> {TYPE_META[t].label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {selectedIds.size > 0 && (
          <BulkActionBar
            count={selectedIds.size}
            sprints={sprints}
            members={members}
            canDelete={canDelete}
            onAction={handleBulk}
            onClear={() => setSelectedIds(new Set())}
          />
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <EmptyState>
              No items yet. Create your first story or generate from requirements
              (coming soon).
            </EmptyState>
          ) : selectedEpic ? (
            <EpicView
              epic={selectedEpic}
              ungrouped={ungrouped}
              visible={visible}
              columns={columns}
              sprints={sprints}
              members={members}
              selectedIds={selectedIds}
              canEdit={canEdit}
              canDelete={canDelete}
              onToggle={toggleSelect}
              onOpen={setDetailId}
              onPatch={handlePatch}
              onDelete={handleDelete}
              onCreateFeature={handleCreateFeature}
              createType={createType}
              createFeatureId={createFeatureId}
              onStartCreate={(featureId) => {
                setCreateType(createType ?? "STORY");
                setCreateFeatureId(featureId);
              }}
              onCancelCreate={() => setCreateType(null)}
              onCreateItem={handleCreateItem}
            />
          ) : (
            <>
              {visible.length === 0 ? (
                <EmptyState>No items match your filters.</EmptyState>
              ) : (
                visible.map((it) => (
                  <BacklogItemRow
                    key={it.id}
                    item={it}
                    columns={columns}
                    sprints={sprints}
                    selected={selectedIds.has(it.id)}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    onToggleSelect={() => toggleSelect(it.id)}
                    onOpen={() => setDetailId(it.id)}
                    onPatch={(p) => handlePatch(it.id, p)}
                    onDelete={() => handleDelete(it.id)}
                  />
                ))
              )}
              {createType && (
                <CreateItemRow
                  type={createType}
                  members={members}
                  onCancel={() => setCreateType(null)}
                  onCreate={(vals) =>
                    handleCreateItem({ ...vals, type: createType, featureId: null })
                  }
                />
              )}
            </>
          )}
        </div>
      </div>

      {detailItem && (
        <WorkItemDetail
          key={detailItem.id}
          item={detailItem}
          columns={columns}
          members={members}
          sprints={sprints}
          canEdit={canEdit}
          currentUserId={currentUserId}
          onClose={() => setDetailId(null)}
          onPatch={(p) => handlePatch(detailItem.id, p)}
          onMove={(s) => handleMove(detailItem.id, s)}
          onNavigate={(id) => setDetailId(id)}
        />
      )}

      {showGenerate && (
        <GenerateModal
          projectId={project.id}
          aiEnabled={aiEnabled}
          modelLabel={aiModelLabel}
          onClose={() => setShowGenerate(false)}
          onApproved={() => {
            // New items span epics/features with server-generated keys; a full
            // reload is the simplest reliable way to show the updated backlog.
            window.location.reload();
          }}
        />
      )}

      {error && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-danger px-4 py-2 text-sm text-white shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}

// --- Epic view (feature groups) ---------------------------------------

function EpicView({
  epic,
  ungrouped,
  visible,
  columns,
  sprints,
  members,
  selectedIds,
  canEdit,
  canDelete,
  onToggle,
  onOpen,
  onPatch,
  onDelete,
  onCreateFeature,
  createType,
  createFeatureId,
  onStartCreate,
  onCancelCreate,
  onCreateItem,
}: {
  epic: EpicWithStats & { features: FeatureRollup[] };
  ungrouped: BoardItem[];
  visible: BoardItem[];
  columns: BoardColumn[];
  sprints: { id: string; name: string; status: string }[];
  members: BoardMember[];
  selectedIds: Set<string>;
  canEdit: boolean;
  canDelete: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onPatch: (id: string, p: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onCreateFeature: (epicId: string, title: string) => Promise<void>;
  createType: WorkItemType | null;
  createFeatureId: string | null;
  onStartCreate: (featureId: string | null) => void;
  onCancelCreate: () => void;
  onCreateItem: (input: {
    type: WorkItemType;
    title: string;
    assigneeId: string | null;
    storyPoints: number | null;
    featureId: string | null;
  }) => void;
}) {
  const [addingFeature, setAddingFeature] = useState(false);
  const [featureTitle, setFeatureTitle] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const rowProps = (it: BoardItem) => ({
    item: it,
    columns,
    sprints,
    selected: selectedIds.has(it.id),
    canEdit,
    canDelete,
    onToggleSelect: () => onToggle(it.id),
    onOpen: () => onOpen(it.id),
    onPatch: (p: Record<string, unknown>) => onPatch(it.id, p),
    onDelete: () => onDelete(it.id),
  });

  if (epic.total === 0 && createType === null) {
    return (
      <div>
        <EpicHeader epic={epic} />
        <EmptyState>No stories in this epic yet.</EmptyState>
        {canEdit && (
          <div className="px-4 pb-4">
            <button
              onClick={() => onStartCreate(null)}
              className="text-sm text-primary hover:underline"
            >
              + Add a story
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <EpicHeader epic={epic} />

      {/* Feature groups */}
      {epic.features.map((f) => {
        const fItems = visible.filter((it) => it.featureId === f.id);
        const isCollapsed = collapsed.has(f.id);
        return (
          <div key={f.id} className="border-b border-border">
            <div className="flex items-center gap-2 bg-muted/40 px-3 py-1.5">
              <button
                onClick={() =>
                  setCollapsed((prev) => {
                    const n = new Set(prev);
                    n.has(f.id) ? n.delete(f.id) : n.add(f.id);
                    return n;
                  })
                }
                className="text-xs text-muted-foreground"
              >
                {isCollapsed ? "▸" : "▾"}
              </button>
              <span className="text-sm font-medium text-foreground">{f.title}</span>
              <StatusBadge status={f.status} />
              <span className="text-xs text-muted-foreground">
                {f.done}/{f.total}
              </span>
              {canEdit && (
                <button
                  onClick={() => onStartCreate(f.id)}
                  className="ml-auto text-xs text-primary hover:underline"
                >
                  + add
                </button>
              )}
            </div>
            {!isCollapsed && (
              <>
                {fItems.map((it) => (
                  <BacklogItemRow key={it.id} {...rowProps(it)} />
                ))}
                {createType && createFeatureId === f.id && (
                  <CreateItemRow
                    type={createType}
                    members={members}
                    onCancel={onCancelCreate}
                    onCreate={(vals) =>
                      onCreateItem({ ...vals, type: createType, featureId: f.id })
                    }
                  />
                )}
              </>
            )}
          </div>
        );
      })}

      {/* Ungrouped items (no feature) */}
      {ungrouped.length > 0 && (
        <div>
          {epic.features.length > 0 && (
            <div className="bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              No feature
            </div>
          )}
          {ungrouped.map((it) => (
            <BacklogItemRow key={it.id} {...rowProps(it)} />
          ))}
        </div>
      )}

      {/* Create row for ungrouped */}
      {createType && createFeatureId === null && (
        <CreateItemRow
          type={createType}
          members={members}
          onCancel={onCancelCreate}
          onCreate={(vals) =>
            onCreateItem({ ...vals, type: createType, featureId: null })
          }
        />
      )}

      {/* Footer actions */}
      {canEdit && (
        <div className="flex items-center gap-4 px-4 py-3">
          {!createType && (
            <button
              onClick={() => onStartCreate(null)}
              className="text-sm text-primary hover:underline"
            >
              + Add story
            </button>
          )}
          {addingFeature ? (
            <input
              autoFocus
              value={featureTitle}
              onChange={(e) => setFeatureTitle(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter" && featureTitle.trim()) {
                  await onCreateFeature(epic.id, featureTitle.trim());
                  setFeatureTitle("");
                  setAddingFeature(false);
                }
                if (e.key === "Escape") setAddingFeature(false);
              }}
              placeholder="Feature name, then Enter"
              className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-ring"
            />
          ) : (
            <button
              onClick={() => setAddingFeature(true)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              + Add feature
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EpicHeader({ epic }: { epic: EpicWithStats }) {
  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-foreground">{epic.title}</h2>
        <StatusBadge status={epic.status} />
        <span className="text-xs text-muted-foreground">
          {epic.done}/{epic.total} done · {epic.completionPct}%
        </span>
      </div>
      {(epic.startDate || epic.targetDate) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {epic.startDate ? new Date(epic.startDate).toLocaleDateString() : "—"} →{" "}
          {epic.targetDate ? new Date(epic.targetDate).toLocaleDateString() : "—"}
        </p>
      )}
    </div>
  );
}

// --- Small pieces ------------------------------------------------------

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-ring"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function CreateItemRow({
  type,
  members,
  onCreate,
  onCancel,
}: {
  type: WorkItemType;
  members: BoardMember[];
  onCreate: (vals: {
    title: string;
    assigneeId: string | null;
    storyPoints: number | null;
  }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [points, setPoints] = useState("");

  function save() {
    if (!title.trim()) return;
    onCreate({
      title: title.trim(),
      assigneeId: assigneeId || null,
      storyPoints: points === "" ? null : Number(points),
    });
    setTitle("");
    setPoints("");
  }

  return (
    <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-3 py-2">
      <TypeIcon type={type} />
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onCancel();
        }}
        placeholder={`New ${TYPE_META[type].label.toLowerCase()} title…`}
        className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-ring"
      />
      <select
        value={assigneeId}
        onChange={(e) => setAssigneeId(e.target.value)}
        className="rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground"
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.name}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={0}
        value={points}
        onChange={(e) => setPoints(e.target.value)}
        placeholder="pts"
        className="w-14 rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground"
      />
      <button
        onClick={save}
        disabled={!title.trim()}
        className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        Add
      </button>
      <button
        onClick={onCancel}
        className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
      >
        Cancel
      </button>
    </div>
  );
}

function BulkActionBar({
  count,
  sprints,
  members,
  canDelete,
  onAction,
  onClear,
}: {
  count: number;
  sprints: { id: string; name: string }[];
  members: BoardMember[];
  canDelete: boolean;
  onAction: (action: string, value: string | null) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/10 px-3 py-2 text-sm">
      <span className="font-medium text-foreground">{count} selected</span>

      <select
        defaultValue=""
        onChange={(e) => {
          if (e.target.value !== "") onAction("sprint", e.target.value || null);
          e.target.value = "";
        }}
        className="rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground"
      >
        <option value="" disabled>
          Add to sprint…
        </option>
        <option value="__none__">Remove from sprint</option>
        {sprints.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <select
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) onAction("priority", e.target.value);
          e.target.value = "";
        }}
        className="rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground"
      >
        <option value="" disabled>
          Change priority…
        </option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_META[p].label}
          </option>
        ))}
      </select>

      <select
        defaultValue=""
        onChange={(e) => {
          if (e.target.value !== "") onAction("assignee", e.target.value === "__none__" ? null : e.target.value);
          e.target.value = "";
        }}
        className="rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground"
      >
        <option value="" disabled>
          Assign to…
        </option>
        <option value="__none__">Unassign</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.name}
          </option>
        ))}
      </select>

      {canDelete && (
        <button
          onClick={() => onAction("delete", null)}
          className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger/10"
        >
          Delete
        </button>
      )}
      <button
        onClick={onClear}
        className="ml-auto text-xs text-muted-foreground hover:text-foreground"
      >
        Clear
      </button>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-16 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

// --- Optimistic helpers ------------------------------------------------

function applyPatch(
  item: BoardItem,
  patch: Record<string, unknown>,
  members: BoardMember[],
): BoardItem {
  const next = { ...item, ...patch } as BoardItem;
  if ("assigneeId" in patch) {
    const id = patch.assigneeId as string | null;
    const m = id ? members.find((mm) => mm.userId === id) : null;
    next.assignee = m ? { id: m.userId, name: m.name, avatarUrl: m.avatarUrl } : null;
  }
  return next;
}

function buildTempItem(
  tempId: string,
  input: {
    type: WorkItemType;
    title: string;
    assigneeId: string | null;
    storyPoints: number | null;
    featureId: string | null;
  },
  epicId: string | null,
  members: BoardMember[],
  columns: BoardColumn[],
): BoardItem {
  const m = input.assigneeId
    ? members.find((mm) => mm.userId === input.assigneeId)
    : null;
  const firstCol = [...columns].sort((a, b) => a.displayOrder - b.displayOrder)[0];
  return {
    id: tempId,
    itemKey: "…",
    type: input.type,
    title: input.title,
    description: null,
    acceptanceCriteria: null,
    edgeCases: null,
    businessValue: null,
    priority: "MEDIUM",
    severity: null,
    discipline: null,
    storyPoints: input.storyPoints,
    estimatedHours: null,
    loggedHours: 0,
    isBlocked: false,
    blockerReason: null,
    verificationStatus: null,
    statusId: firstCol?.id ?? "",
    sprintId: null,
    epicId,
    featureId: input.featureId,
    assigneeId: input.assigneeId,
    reporterId: null,
    assignee: m ? { id: m.userId, name: m.name, avatarUrl: m.avatarUrl } : null,
    stepsToReproduce: null,
    expectedResult: null,
    actualResult: null,
    environment: null,
    buildVersion: null,
    researchQuestion: null,
    timeBox: null,
    outcomeSummary: null,
    taskCategory: null,
    dueDate: null,
    createdAt: new Date().toISOString(),
    linkCount: 0,
  };
}
