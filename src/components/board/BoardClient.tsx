"use client";

import { useMemo, useState } from "react";
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
  BoardData,
  BoardItem,
  BoardMember,
  WorkItemType,
} from "./types";
import { WorkItemCard } from "./WorkItemCard";
import { QuickAdd } from "./QuickAdd";
import { FilterBar, DEFAULT_FILTERS, matchesFilters, type Filters } from "./FilterBar";
import { WorkItemDetail } from "./WorkItemDetail";

export function BoardClient({ data }: { data: BoardData }) {
  const { project, columns, members, sprints, currentUserId, canEdit } = data;

  const [items, setItems] = useState<BoardItem[]>(data.items);
  // Default the board to the active sprint, if there is one.
  const [filters, setFilters] = useState<Filters>(() => {
    const active = data.sprints.find((s) => s.status === "ACTIVE");
    return active ? { ...DEFAULT_FILTERS, sprintId: active.id } : DEFAULT_FILTERS;
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"details" | "links">("details");
  const [quickAddCol, setQuickAddCol] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function flash(message: string) {
    setError(message);
    setTimeout(() => setError(null), 3500);
  }

  const visibleItems = useMemo(
    () => items.filter((it) => matchesFilters(it, filters, currentUserId)),
    [items, filters, currentUserId],
  );

  // Stories available as the "Found while testing" source when adding a bug.
  const stories = useMemo(
    () =>
      items
        .filter((it) => it.type === "STORY" && !it.id.startsWith("temp-"))
        .map((it) => ({ id: it.id, itemKey: it.itemKey, title: it.title })),
    [items],
  );

  const itemsByColumn = useMemo(() => {
    const map: Record<string, BoardItem[]> = {};
    for (const col of columns) map[col.id] = [];
    for (const it of visibleItems) (map[it.statusId] ??= []).push(it);
    return map;
  }, [visibleItems, columns]);

  const selected = selectedId
    ? (items.find((i) => i.id === selectedId) ?? null)
    : null;
  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;

  function openDetail(id: string, tab: "details" | "links" = "details") {
    setDetailTab(tab);
    setSelectedId(id);
  }

  function setLinkCount(itemId: string, count: number) {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, linkCount: count } : it)),
    );
  }

  // --- Mutations (optimistic) ------------------------------------------

  async function handleMove(itemId: string, toStatusId: string) {
    const snapshot = items;
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, statusId: toStatusId } : it)),
    );
    try {
      const res = await fetch(`/api/v1/work-items/${itemId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId: toStatusId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Move failed");
      const { item } = await res.json();
      setItems((prev) => prev.map((it) => (it.id === itemId ? item : it)));
    } catch (e) {
      setItems(snapshot);
      flash(e instanceof Error ? e.message : "Could not move the card.");
    }
  }

  async function handlePatch(itemId: string, patch: Record<string, unknown>) {
    const snapshot = items;
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? applyPatch(it, patch, members) : it)),
    );
    try {
      const res = await fetch(`/api/v1/work-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Update failed");
      const { item } = await res.json();
      setItems((prev) => prev.map((it) => (it.id === itemId ? item : it)));
    } catch (e) {
      setItems(snapshot);
      flash(e instanceof Error ? e.message : "Could not save the change.");
    }
  }

  async function handleCreate(
    statusId: string,
    input: {
      type: WorkItemType;
      title: string;
      assigneeId: string | null;
      foundInStoryId?: string | null;
    },
  ) {
    const tempId = `temp-${Date.now()}`;
    const temp = buildTempItem(tempId, statusId, input, members);
    setItems((prev) => [...prev, temp]);
    try {
      const res = await fetch("/api/v1/work-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectKey: project.key,
          statusId,
          type: input.type,
          title: input.title,
          assigneeId: input.assigneeId,
          foundInStoryId: input.foundInStoryId ?? null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Create failed");
      const { item } = await res.json();
      setItems((prev) => prev.map((it) => (it.id === tempId ? item : it)));
    } catch (e) {
      setItems((prev) => prev.filter((it) => it.id !== tempId));
      flash(e instanceof Error ? e.message : "Could not create the item.");
    }
  }

  // --- Drag ------------------------------------------------------------

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const itemId = String(active.id);
    const toStatusId = String(over.id);
    const item = items.find((i) => i.id === itemId);
    if (!item || item.statusId === toStatusId) return;
    handleMove(itemId, toStatusId);
  }

  return (
    <div className="flex h-full flex-col">
      <FilterBar
        members={members}
        sprints={sprints}
        filters={filters}
        setFilters={setFilters}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex flex-1 gap-3 overflow-x-auto p-4">
          {columns.map((col) => (
            <Column
              key={col.id}
              column={col}
              items={itemsByColumn[col.id] ?? []}
              canEdit={canEdit}
              isQuickAdding={quickAddCol === col.id}
              onAdd={() => setQuickAddCol(col.id)}
              onCancelAdd={() => setQuickAddCol(null)}
              onCreate={(input) => handleCreate(col.id, input)}
              members={members}
              stories={stories}
              onCardClick={(id) => openDetail(id, "details")}
              onLinkClick={(id) => openDetail(id, "links")}
            />
          ))}
        </div>

        <DragOverlay>
          {activeItem ? <WorkItemCard item={activeItem} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {selected && (
        <WorkItemDetail
          key={selected.id}
          item={selected}
          columns={columns}
          members={members}
          sprints={sprints}
          canEdit={canEdit}
          currentUserId={currentUserId}
          initialTab={detailTab}
          onClose={() => setSelectedId(null)}
          onPatch={(patch) => handlePatch(selected.id, patch)}
          onMove={(statusId) => handleMove(selected.id, statusId)}
          onNavigate={(id) => openDetail(id, "details")}
          onLinkCountChange={setLinkCount}
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

function Column({
  column,
  items,
  canEdit,
  isQuickAdding,
  onAdd,
  onCancelAdd,
  onCreate,
  members,
  stories,
  onCardClick,
  onLinkClick,
}: {
  column: BoardColumn;
  items: BoardItem[];
  canEdit: boolean;
  isQuickAdding: boolean;
  onAdd: () => void;
  onCancelAdd: () => void;
  onCreate: (input: {
    type: WorkItemType;
    title: string;
    assigneeId: string | null;
    foundInStoryId?: string | null;
  }) => Promise<void>;
  members: BoardMember[];
  stories: { id: string; itemKey: string; title: string }[];
  onCardClick: (id: string) => void;
  onLinkClick: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/40">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: column.color }}
        />
        <span className="text-sm font-medium text-foreground">{column.name}</span>
        <span className="text-xs text-muted-foreground">{items.length}</span>
        {canEdit && (
          <button
            onClick={onAdd}
            title="Add item"
            className="ml-auto rounded px-1.5 text-lg leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            +
          </button>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 overflow-y-auto px-2 pb-3 ${
          isOver ? "rounded-md bg-primary/5 ring-1 ring-inset ring-primary/30" : ""
        }`}
      >
        {canEdit && isQuickAdding && (
          <QuickAdd
            members={members}
            stories={stories}
            onCreate={onCreate}
            onCancel={onCancelAdd}
          />
        )}
        {items.map((item) => (
          <DraggableCard
            key={item.id}
            item={item}
            canEdit={canEdit}
            onClick={() => onCardClick(item.id)}
            onLinkClick={() => onLinkClick(item.id)}
          />
        ))}
        {items.length === 0 && !isQuickAdding && (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            No items
          </p>
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  item,
  canEdit,
  onClick,
  onLinkClick,
}: {
  item: BoardItem;
  canEdit: boolean;
  onClick: () => void;
  onLinkClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
    disabled: !canEdit || item.id.startsWith("temp-"),
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <WorkItemCard item={item} onClick={onClick} onLinkClick={onLinkClick} />
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
  statusId: string,
  input: { type: WorkItemType; title: string; assigneeId: string | null },
  members: BoardMember[],
): BoardItem {
  const m = input.assigneeId
    ? members.find((mm) => mm.userId === input.assigneeId)
    : null;
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
    storyPoints: null,
    estimatedHours: null,
    loggedHours: 0,
    isBlocked: false,
    blockerReason: null,
    verificationStatus: null,
    statusId,
    sprintId: null,
    epicId: null,
    featureId: null,
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
