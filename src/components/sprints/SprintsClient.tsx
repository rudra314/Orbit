"use client";

import { useMemo, useState } from "react";
import { daysRemaining as daysLeft } from "@/lib/projectMetrics";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type {
  BoardColumn,
  BoardItem,
  BoardMember,
  StatusCategory,
  WorkItemType,
} from "@/components/board/types";
import { TYPE_META, TypeIcon, WORK_ITEM_TYPES } from "@/components/board/meta";
import { WorkItemDetail } from "@/components/board/WorkItemDetail";
import { SprintItemRow } from "./SprintItemRow";
import type { Capacity, SprintDTO, SprintsData } from "./types";

// ---- helpers ----------------------------------------------------------

// Span in whole days between two dates — used for sprint *duration* (start→end).
// For "days left from now" use daysRemaining from @/lib/projectMetrics so this
// page and the dashboard never disagree.
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString() : "—";
}

export function SprintsClient({ data }: { data: SprintsData }) {
  const { project, columns, members, canEdit, canManage, currentUserId } = data;

  const [sprints, setSprints] = useState<SprintDTO[]>(data.sprints);
  const [items, setItems] = useState<BoardItem[]>(data.items);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editSprint, setEditSprint] = useState<SprintDTO | null>(null);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const catOf = useMemo<Map<string, StatusCategory>>(
    () => new Map(columns.map((c) => [c.id, c.category])),
    [columns],
  );
  const isDone = (it: BoardItem) => catOf.get(it.statusId) === "COMPLETED";

  function flash(m: string) {
    setError(m);
    setTimeout(() => setError(null), 3500);
  }

  const activeSprint = sprints.find((s) => s.status === "ACTIVE") ?? null;
  const planningSprints = sprints.filter((s) => s.status === "PLANNING");
  const completedSprints = sprints
    .filter((s) => s.status === "COMPLETED")
    .reverse();

  const itemsOf = (sprintId: string | null) =>
    items.filter((it) => it.sprintId === sprintId);

  function capacityOf(sprintId: string): Capacity {
    const list = itemsOf(sprintId);
    return {
      total: list.length,
      done: list.filter(isDone).length,
      points: list.reduce((s, i) => s + (i.storyPoints ?? 0), 0),
      donePoints: list
        .filter(isDone)
        .reduce((s, i) => s + (i.storyPoints ?? 0), 0),
      hours: list.reduce((s, i) => s + (i.estimatedHours ?? 0), 0),
    };
  }

  const detailItem = detailId
    ? (items.find((i) => i.id === detailId) ?? null)
    : null;

  // ---- mutations ------------------------------------------------------

  async function api(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
    return res.json();
  }

  async function createSprint(payload: {
    name: string;
    startDate: string | null;
    endDate: string | null;
    goal: string | null;
  }) {
    try {
      const { sprint } = await api("/api/v1/sprints", "POST", {
        projectKey: project.key,
        ...payload,
      });
      setSprints((prev) => [...prev, sprint]);
      setCreateOpen(false);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not create sprint.");
    }
  }

  async function updateSprint(id: string, patch: Record<string, unknown>) {
    const snapshot = sprints;
    setSprints((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
    try {
      const { sprint } = await api(`/api/v1/sprints/${id}`, "PATCH", patch);
      setSprints((prev) => prev.map((s) => (s.id === id ? sprint : s)));
      setEditSprint(null);
    } catch (e) {
      setSprints(snapshot);
      flash(e instanceof Error ? e.message : "Could not update sprint.");
    }
  }

  async function deleteSprint(id: string) {
    if (!confirm("Delete this sprint? Its items return to the backlog.")) return;
    const snapSprints = sprints;
    const snapItems = items;
    setSprints((prev) => prev.filter((s) => s.id !== id));
    setItems((prev) =>
      prev.map((it) => (it.sprintId === id ? { ...it, sprintId: null } : it)),
    );
    if (planningId === id) setPlanningId(null);
    try {
      await api(`/api/v1/sprints/${id}`, "DELETE");
    } catch (e) {
      setSprints(snapSprints);
      setItems(snapItems);
      flash(e instanceof Error ? e.message : "Could not delete sprint.");
    }
  }

  async function startSprint(id: string) {
    const cap = capacityOf(id);
    if (!confirm(`Start this sprint? ${cap.total} items, ${cap.points} pts.`))
      return;
    const snapshot = sprints;
    setSprints((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "ACTIVE" } : s)),
    );
    try {
      const { sprint } = await api(`/api/v1/sprints/${id}/start`, "POST");
      setSprints((prev) => prev.map((s) => (s.id === id ? sprint : s)));
    } catch (e) {
      setSprints(snapshot);
      flash(e instanceof Error ? e.message : "Could not start sprint.");
    }
  }

  async function completeSprint(
    id: string,
    carryoverTo: "backlog" | "next",
    nextSprintId: string | null,
  ) {
    const snapSprints = sprints;
    const snapItems = items;
    const incompleteIds = itemsOf(id)
      .filter((it) => !isDone(it))
      .map((it) => it.id);
    const target = carryoverTo === "next" ? nextSprintId : null;
    setSprints((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status: "COMPLETED", endDate: new Date().toISOString() }
          : s,
      ),
    );
    setItems((prev) =>
      prev.map((it) =>
        incompleteIds.includes(it.id) ? { ...it, sprintId: target } : it,
      ),
    );
    setCompleteId(null);
    try {
      await api(`/api/v1/sprints/${id}/complete`, "POST", {
        carryoverTo,
        nextSprintId,
      });
    } catch (e) {
      setSprints(snapSprints);
      setItems(snapItems);
      flash(e instanceof Error ? e.message : "Could not complete sprint.");
    }
  }

  async function assignItem(itemId: string, sprintId: string | null) {
    const snapshot = items;
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, sprintId } : it)),
    );
    try {
      const { item } = await api(`/api/v1/work-items/${itemId}`, "PATCH", {
        sprintId,
      });
      setItems((prev) => prev.map((it) => (it.id === itemId ? item : it)));
    } catch (e) {
      setItems(snapshot);
      flash(e instanceof Error ? e.message : "Could not move item.");
    }
  }

  async function patchItem(id: string, patch: Record<string, unknown>) {
    const snapshot = items;
    setItems((prev) =>
      prev.map((it) => (it.id === id ? applyPatch(it, patch, members) : it)),
    );
    try {
      const { item } = await api(`/api/v1/work-items/${id}`, "PATCH", patch);
      setItems((prev) => prev.map((it) => (it.id === id ? item : it)));
    } catch (e) {
      setItems(snapshot);
      flash(e instanceof Error ? e.message : "Could not save.");
    }
  }

  async function moveItem(id: string, statusId: string) {
    const snapshot = items;
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, statusId } : it)),
    );
    try {
      const { item } = await api(`/api/v1/work-items/${id}/status`, "PATCH", {
        statusId,
      });
      setItems((prev) => prev.map((it) => (it.id === id ? item : it)));
    } catch (e) {
      setItems(snapshot);
      flash(e instanceof Error ? e.message : "Could not move.");
    }
  }

  async function quickAdd(
    sprintId: string,
    vals: { type: WorkItemType; title: string; assigneeId: string | null },
  ) {
    const tempId = `temp-${Date.now()}`;
    const temp = buildTempItem(tempId, vals, sprintId, members, columns);
    setItems((prev) => [...prev, temp]);
    try {
      const { item } = await api("/api/v1/work-items", "POST", {
        projectKey: project.key,
        type: vals.type,
        title: vals.title,
        assigneeId: vals.assigneeId,
      });
      const { item: assigned } = await api(
        `/api/v1/work-items/${item.id}`,
        "PATCH",
        { sprintId },
      );
      setItems((prev) => prev.map((it) => (it.id === tempId ? assigned : it)));
    } catch (e) {
      setItems((prev) => prev.filter((it) => it.id !== tempId));
      flash(e instanceof Error ? e.message : "Could not add item.");
    }
  }

  const suggestedName = `Sprint ${sprints.length + 1}`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h1 className="text-base font-semibold text-foreground">Sprints</h1>
        {canManage && (
          <button
            onClick={() => setCreateOpen(true)}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            + Create sprint
          </button>
        )}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        {sprints.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No sprints yet.{" "}
            {canManage
              ? "Create your first sprint to start planning."
              : "Ask your PM to create one."}
          </div>
        )}

        {/* ACTIVE SPRINT */}
        {activeSprint && (
          <ActiveSprintView
            sprint={activeSprint}
            items={itemsOf(activeSprint.id)}
            capacity={capacityOf(activeSprint.id)}
            columns={columns}
            canManage={canManage}
            onOpenItem={setDetailId}
            onComplete={() => setCompleteId(activeSprint.id)}
          />
        )}

        {/* PLANNING SPRINTS */}
        {planningSprints.map((sprint) => (
          <PlanningSprintCard
            key={sprint.id}
            sprint={sprint}
            sprintItems={itemsOf(sprint.id)}
            backlogItems={itemsOf(null)}
            capacity={capacityOf(sprint.id)}
            columns={columns}
            members={members}
            canEdit={canEdit}
            canManage={canManage}
            planning={planningId === sprint.id}
            onTogglePlanning={() =>
              setPlanningId((p) => (p === sprint.id ? null : sprint.id))
            }
            onOpenItem={setDetailId}
            onAssign={assignItem}
            onQuickAdd={(vals) => quickAdd(sprint.id, vals)}
            onStart={() => startSprint(sprint.id)}
            onEdit={() => setEditSprint(sprint)}
            onDelete={() => deleteSprint(sprint.id)}
          />
        ))}

        {/* HISTORY */}
        {completedSprints.length > 0 && (
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Completed sprints
            </h2>
            <div className="space-y-2">
              {completedSprints.map((sprint) => (
                <CompletedSprintRow
                  key={sprint.id}
                  sprint={sprint}
                  items={itemsOf(sprint.id)}
                  capacity={capacityOf(sprint.id)}
                  columns={columns}
                  onOpenItem={setDetailId}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {createOpen && (
        <SprintFormModal
          title="Create sprint"
          defaultName={suggestedName}
          onCancel={() => setCreateOpen(false)}
          onSave={createSprint}
        />
      )}
      {editSprint && (
        <SprintFormModal
          title="Edit sprint"
          defaultName={editSprint.name}
          defaultGoal={editSprint.goal ?? ""}
          defaultStart={editSprint.startDate}
          defaultEnd={editSprint.endDate}
          onCancel={() => setEditSprint(null)}
          onSave={(payload) => updateSprint(editSprint.id, payload)}
        />
      )}
      {completeId && (
        <CompleteSprintModal
          sprint={sprints.find((s) => s.id === completeId)!}
          items={itemsOf(completeId)}
          isDone={isDone}
          planningSprints={planningSprints}
          onCancel={() => setCompleteId(null)}
          onConfirm={(to, nextId) => completeSprint(completeId, to, nextId)}
        />
      )}

      {detailItem && (
        <WorkItemDetail
          key={detailItem.id}
          item={detailItem}
          columns={columns}
          members={members}
          sprints={sprints.map((s) => ({
            id: s.id,
            name: s.name,
            status: s.status,
          }))}
          canEdit={canEdit}
          currentUserId={currentUserId}
          onClose={() => setDetailId(null)}
          onPatch={(p) => patchItem(detailItem.id, p)}
          onMove={(s) => moveItem(detailItem.id, s)}
          onNavigate={(id) => setDetailId(id)}
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

// ---- Active sprint ----------------------------------------------------

function ActiveSprintView({
  sprint,
  items,
  capacity,
  columns,
  canManage,
  onOpenItem,
  onComplete,
}: {
  sprint: SprintDTO;
  items: BoardItem[];
  capacity: Capacity;
  columns: BoardColumn[];
  canManage: boolean;
  onOpenItem: (id: string) => void;
  onComplete: () => void;
}) {
  const today = new Date();
  const end = sprint.endDate ? new Date(sprint.endDate) : null;
  const daysRemaining = daysLeft(end, today);

  return (
    <div className="rounded-lg border border-primary/40 bg-card">
      <div className="flex items-start justify-between border-b border-border p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
              ACTIVE
            </span>
            <h2 className="text-lg font-semibold text-foreground">
              {sprint.name}
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {fmt(sprint.startDate)} → {fmt(sprint.endDate)}
            {daysRemaining != null && ` · ${daysRemaining} days remaining`}
          </p>
          {sprint.goal && (
            <p className="mt-2 max-w-2xl text-sm text-card-foreground">
              🎯 {sprint.goal}
            </p>
          )}
        </div>
        {canManage && (
          <button
            onClick={onComplete}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            Complete sprint
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
        <Stat label="Progress" value={`${capacity.done} / ${capacity.total} items`} />
        <Stat
          label="Points"
          value={`${capacity.donePoints} / ${capacity.points} pts done`}
        />
        <Stat
          label="Days remaining"
          value={daysRemaining != null ? `${daysRemaining}` : "—"}
        />
      </div>

      <Burndown sprint={sprint} capacity={capacity} />

      <div className="border-t border-border">
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No items in this sprint.
          </p>
        ) : (
          items.map((it) => (
            <SprintItemRow
              key={it.id}
              item={it}
              columns={columns}
              onClick={() => onOpenItem(it.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Simple burndown summary: ideal points-remaining per day (full chart is Phase 2).
function Burndown({
  sprint,
  capacity,
}: {
  sprint: SprintDTO;
  capacity: Capacity;
}) {
  if (!sprint.startDate || !sprint.endDate || capacity.points === 0) return null;
  const start = new Date(sprint.startDate);
  const end = new Date(sprint.endDate);
  const totalDays = Math.max(1, daysBetween(start, end));
  const today = new Date();
  const rows = [];
  for (let d = 0; d <= totalDays; d++) {
    const day = new Date(start.getTime() + d * 86_400_000);
    const idealRemaining = Math.round(
      capacity.points * (1 - d / totalDays),
    );
    const isToday = day.toDateString() === today.toDateString();
    rows.push({ day, idealRemaining, isToday });
  }
  return (
    <div className="border-t border-border px-4 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Burndown · {capacity.donePoints}/{capacity.points} pts done (ideal line —
        full chart in Phase 2)
      </p>
      <div className="flex flex-wrap gap-1">
        {rows.map((r, i) => (
          <div
            key={i}
            title={`${r.day.toLocaleDateString()} · ideal ${r.idealRemaining} pts left`}
            className={`flex flex-col items-center rounded px-1.5 py-1 text-[10px] ${
              r.isToday
                ? "bg-primary/15 text-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <span>{r.day.getMonth() + 1}/{r.day.getDate()}</span>
            <span className="font-medium">{r.idealRemaining}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

// ---- Planning sprint card + drag split view ---------------------------

function PlanningSprintCard({
  sprint,
  sprintItems,
  backlogItems,
  capacity,
  columns,
  members,
  canEdit,
  canManage,
  planning,
  onTogglePlanning,
  onOpenItem,
  onAssign,
  onQuickAdd,
  onStart,
  onEdit,
  onDelete,
}: {
  sprint: SprintDTO;
  sprintItems: BoardItem[];
  backlogItems: BoardItem[];
  capacity: Capacity;
  columns: BoardColumn[];
  members: BoardMember[];
  canEdit: boolean;
  canManage: boolean;
  planning: boolean;
  onTogglePlanning: () => void;
  onOpenItem: (id: string) => void;
  onAssign: (itemId: string, sprintId: string | null) => void;
  onQuickAdd: (vals: {
    type: WorkItemType;
    title: string;
    assigneeId: string | null;
  }) => void;
  onStart: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const duration =
    sprint.startDate && sprint.endDate
      ? daysBetween(new Date(sprint.startDate), new Date(sprint.endDate))
      : null;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              PLANNING
            </span>
            <h2 className="text-base font-semibold text-foreground">
              {sprint.name}
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {fmt(sprint.startDate)} → {fmt(sprint.endDate)}
            {duration != null && ` · ${duration} days`}
          </p>
          {sprint.goal && (
            <p className="mt-1 text-sm text-card-foreground">🎯 {sprint.goal}</p>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              onClick={onTogglePlanning}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            >
              {planning ? "Done planning" : "Plan"}
            </button>
            <button
              onClick={onStart}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              Start sprint
            </button>
            <button
              onClick={onEdit}
              className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="rounded-md px-2 py-1.5 text-sm text-danger hover:bg-danger/10"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <CapacityBar capacity={capacity} />

      {planning && canEdit ? (
        <PlanningBoard
          sprint={sprint}
          sprintItems={sprintItems}
          backlogItems={backlogItems}
          columns={columns}
          members={members}
          onAssign={onAssign}
          onOpenItem={onOpenItem}
          onQuickAdd={onQuickAdd}
        />
      ) : (
        <div className="border-t border-border">
          {sprintItems.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No items committed yet.{" "}
              {canManage && "Click “Plan” to add items from the backlog."}
            </p>
          ) : (
            sprintItems.map((it) => (
              <SprintItemRow
                key={it.id}
                item={it}
                columns={columns}
                onClick={() => onOpenItem(it.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function PlanningBoard({
  sprint,
  sprintItems,
  backlogItems,
  columns,
  members,
  onAssign,
  onOpenItem,
  onQuickAdd,
}: {
  sprint: SprintDTO;
  sprintItems: BoardItem[];
  backlogItems: BoardItem[];
  columns: BoardColumn[];
  members: BoardMember[];
  onAssign: (itemId: string, sprintId: string | null) => void;
  onOpenItem: (id: string) => void;
  onQuickAdd: (vals: {
    type: WorkItemType;
    title: string;
    assigneeId: string | null;
  }) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const itemId = String(active.id);
    const target = String(over.id); // "backlog" or sprint id
    const item = [...backlogItems, ...sprintItems].find((i) => i.id === itemId);
    if (!item) return;
    if (target === "backlog" && item.sprintId) onAssign(itemId, null);
    if (target === sprint.id && item.sprintId !== sprint.id)
      onAssign(itemId, sprint.id);
  }

  const activeItem = activeId
    ? [...backlogItems, ...sprintItems].find((i) => i.id === activeId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="grid grid-cols-1 gap-3 border-t border-border p-3 md:grid-cols-2">
        <DropPanel id="backlog" title={`Backlog (${backlogItems.length})`}>
          {backlogItems.map((it) => (
            <DraggableRow key={it.id} item={it} columns={columns} />
          ))}
          {backlogItems.length === 0 && <EmptyHint>Backlog is empty.</EmptyHint>}
        </DropPanel>

        <DropPanel
          id={sprint.id}
          title={`${sprint.name} (${sprintItems.length})`}
          highlight
        >
          {sprintItems.map((it) => (
            <DraggableRow
              key={it.id}
              item={it}
              columns={columns}
              onOpen={() => onOpenItem(it.id)}
            />
          ))}
          <QuickAddRow members={members} onAdd={onQuickAdd} />
        </DropPanel>
      </div>

      <DragOverlay>
        {activeItem ? (
          <div className="w-72 rounded border border-border bg-card shadow-lg">
            <SprintItemRow item={activeItem} columns={columns} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DropPanel({
  id,
  title,
  highlight,
  children,
}: {
  id: string;
  title: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[120px] rounded-md border ${
        isOver
          ? "border-primary bg-primary/5"
          : highlight
            ? "border-primary/30"
            : "border-border"
      }`}
    >
      <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function DraggableRow({
  item,
  columns,
  onOpen,
}: {
  item: BoardItem;
  columns: BoardColumn[];
  onOpen?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
    disabled: item.id.startsWith("temp-"),
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <SprintItemRow item={item} columns={columns} onClick={onOpen} />
    </div>
  );
}

function QuickAddRow({
  members,
  onAdd,
}: {
  members: BoardMember[];
  onAdd: (vals: {
    type: WorkItemType;
    title: string;
    assigneeId: string | null;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<WorkItemType>("STORY");
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full px-3 py-2 text-left text-xs text-primary hover:bg-muted/40"
      >
        + Quick-add to sprint
      </button>
    );

  function save() {
    if (!title.trim()) return;
    onAdd({ type, title: title.trim(), assigneeId: assigneeId || null });
    setTitle("");
  }

  return (
    <div className="flex items-center gap-1 border-t border-border px-2 py-2">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as WorkItemType)}
        className="rounded border border-input bg-background px-1 py-1 text-xs"
      >
        {WORK_ITEM_TYPES.map((t) => (
          <option key={t} value={t}>
            {TYPE_META[t].label}
          </option>
        ))}
      </select>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Title…"
        className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:border-ring"
      />
      <select
        value={assigneeId}
        onChange={(e) => setAssigneeId(e.target.value)}
        className="rounded border border-input bg-background px-1 py-1 text-xs"
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.name}
          </option>
        ))}
      </select>
      <button
        onClick={save}
        className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
      >
        Add
      </button>
    </div>
  );
}

function CapacityBar({ capacity }: { capacity: Capacity }) {
  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-3 text-xs">
      <span className="font-medium text-foreground">
        {capacity.total} items
      </span>
      <span className="text-muted-foreground">
        <span className="font-semibold text-foreground">{capacity.points}</span>{" "}
        story points committed
      </span>
      <span className="text-muted-foreground">
        <span className="font-semibold text-foreground">{capacity.hours}</span>{" "}
        est. hours committed
      </span>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-6 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}

// ---- Completed sprint history -----------------------------------------

function CompletedSprintRow({
  sprint,
  items,
  capacity,
  columns,
  onOpenItem,
}: {
  sprint: SprintDTO;
  items: BoardItem[];
  capacity: Capacity;
  columns: BoardColumn[];
  onOpenItem: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="text-xs text-muted-foreground">{open ? "▾" : "▸"}</span>
        <span className="font-medium text-foreground">{sprint.name}</span>
        <span className="text-xs text-muted-foreground">
          {fmt(sprint.startDate)} → {fmt(sprint.endDate)}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {capacity.done}/{capacity.total} done · velocity{" "}
          <span className="font-semibold text-foreground">
            {capacity.donePoints} pts
          </span>
        </span>
      </button>
      {open && (
        <div className="border-t border-border">
          {items.length === 0 ? (
            <EmptyHint>No items remained in this sprint.</EmptyHint>
          ) : (
            items.map((it) => (
              <SprintItemRow
                key={it.id}
                item={it}
                columns={columns}
                onClick={() => onOpenItem(it.id)}
                dimmed={false}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---- Modals -----------------------------------------------------------

function Modal({
  title,
  children,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-card-foreground">{title}</h3>
          <button
            onClick={onCancel}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function SprintFormModal({
  title,
  defaultName,
  defaultGoal = "",
  defaultStart = null,
  defaultEnd = null,
  onCancel,
  onSave,
}: {
  title: string;
  defaultName: string;
  defaultGoal?: string;
  defaultStart?: string | null;
  defaultEnd?: string | null;
  onCancel: () => void;
  onSave: (payload: {
    name: string;
    startDate: string | null;
    endDate: string | null;
    goal: string | null;
  }) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [goal, setGoal] = useState(defaultGoal);
  const [start, setStart] = useState(defaultStart ? defaultStart.slice(0, 10) : "");
  const [end, setEnd] = useState(defaultEnd ? defaultEnd.slice(0, 10) : "");

  const duration =
    start && end ? daysBetween(new Date(start), new Date(end)) : null;
  const dateError = duration != null && duration < 0;

  const inputCls =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring";

  return (
    <Modal title={title} onCancel={onCancel}>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Sprint name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Start date
            </label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              End date
            </label>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        {duration != null && (
          <p className={`text-xs ${dateError ? "text-danger" : "text-muted-foreground"}`}>
            {dateError ? "End date must be after start date." : `Duration: ${duration} days`}
          </p>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Sprint goal
          </label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
            placeholder="What is the focus of this sprint?"
            className={inputCls}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            disabled={!name.trim() || dateError}
            onClick={() =>
              onSave({
                name: name.trim(),
                startDate: start || null,
                endDate: end || null,
                goal: goal.trim() || null,
              })
            }
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CompleteSprintModal({
  sprint,
  items,
  isDone,
  planningSprints,
  onCancel,
  onConfirm,
}: {
  sprint: SprintDTO;
  items: BoardItem[];
  isDone: (it: BoardItem) => boolean;
  planningSprints: SprintDTO[];
  onCancel: () => void;
  onConfirm: (to: "backlog" | "next", nextSprintId: string | null) => void;
}) {
  const done = items.filter(isDone);
  const incomplete = items.filter((it) => !isDone(it));
  const [to, setTo] = useState<"backlog" | "next">("backlog");
  const [nextId, setNextId] = useState(planningSprints[0]?.id ?? "");

  return (
    <Modal title={`Complete ${sprint.name}`} onCancel={onCancel}>
      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 rounded-md border border-border p-3 text-center">
            <p className="text-2xl font-semibold text-success">{done.length}</p>
            <p className="text-xs text-muted-foreground">completed</p>
          </div>
          <div className="flex-1 rounded-md border border-border p-3 text-center">
            <p className="text-2xl font-semibold text-warning">
              {incomplete.length}
            </p>
            <p className="text-xs text-muted-foreground">not completed</p>
          </div>
        </div>

        {incomplete.length > 0 && (
          <div>
            <p className="mb-2 text-sm text-card-foreground">
              Move {incomplete.length} incomplete item
              {incomplete.length > 1 ? "s" : ""} to:
            </p>
            <label className="mb-1 flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={to === "backlog"}
                onChange={() => setTo("backlog")}
              />
              Backlog
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={to === "next"}
                disabled={planningSprints.length === 0}
                onChange={() => setTo("next")}
              />
              Next sprint
              {to === "next" && (
                <select
                  value={nextId}
                  onChange={(e) => setNextId(e.target.value)}
                  className="rounded border border-input bg-background px-1.5 py-1 text-xs"
                >
                  {planningSprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(to, to === "next" ? nextId : null)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Complete sprint
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---- optimistic helpers ----------------------------------------------

function applyPatch(
  item: BoardItem,
  patch: Record<string, unknown>,
  members: BoardMember[],
): BoardItem {
  const next = { ...item, ...patch } as BoardItem;
  if ("assigneeId" in patch) {
    const id = patch.assigneeId as string | null;
    const m = id ? members.find((mm) => mm.userId === id) : null;
    next.assignee = m
      ? { id: m.userId, name: m.name, avatarUrl: m.avatarUrl }
      : null;
  }
  return next;
}

function buildTempItem(
  tempId: string,
  vals: { type: WorkItemType; title: string; assigneeId: string | null },
  sprintId: string,
  members: BoardMember[],
  columns: BoardColumn[],
): BoardItem {
  const m = vals.assigneeId
    ? members.find((mm) => mm.userId === vals.assigneeId)
    : null;
  const firstCol = [...columns].sort((a, b) => a.displayOrder - b.displayOrder)[0];
  return {
    id: tempId,
    itemKey: "…",
    type: vals.type,
    title: vals.title,
    description: null,
    acceptanceCriteria: null,
    edgeCases: null,
    businessValue: null,
    priority: "MEDIUM",
    severity: null,
    discipline: null,
    storyPoints: null,
    estimatedHours: null,
    loggedHours: 0,
    isBlocked: false,
    blockerReason: null,
    verificationStatus: null,
    statusId: firstCol?.id ?? "",
    sprintId,
    epicId: null,
    featureId: null,
    assigneeId: vals.assigneeId,
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
