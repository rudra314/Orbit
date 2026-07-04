"use client";

import { useDraggable } from "@dnd-kit/core";
import type { BoardItem } from "./types";
import { WorkItemCard } from "./WorkItemCard";

// dnd-kit generates its aria-describedby id (DndDescribedBy-N) from a
// module-level counter, not React's useId() — the count the server and the
// client each start from isn't guaranteed to match, which is a hydration
// mismatch on this attribute. This component is loaded via next/dynamic with
// ssr: false (see BoardClient.tsx) so it only ever renders client-side and
// there's nothing for hydration to reconcile against.
export function DraggableCard({
  item,
  canEdit,
  shaking,
  onClick,
  onLinkClick,
}: {
  item: BoardItem;
  canEdit: boolean;
  shaking: boolean;
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
      className={shaking ? "shake" : undefined}
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <WorkItemCard item={item} onClick={onClick} onLinkClick={onLinkClick} />
    </div>
  );
}
