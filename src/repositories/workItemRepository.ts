import { prisma } from "./prisma";
import type { Prisma, Priority, WorkItemType } from "@prisma/client";

// Relations included for board cards and the detail panel. linksFrom is the
// item's source-side links — the same set the detail panel renders and counts.
const boardInclude = {
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  _count: { select: { linksFrom: true } },
} satisfies Prisma.WorkItemInclude;

export type BoardWorkItem = Prisma.WorkItemGetPayload<{
  include: typeof boardInclude;
}>;

export const workItemRepository = {
  listForProject(projectId: string) {
    return prisma.workItem.findMany({
      where: { projectId },
      include: boardInclude,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  },

  // Returns just enough to authorize a mutation against the item's project.
  findProjectIdById(id: string) {
    return prisma.workItem.findUnique({
      where: { id },
      select: { id: true, projectId: true, statusId: true },
    });
  },

  // Creates a work item with an atomically-generated key (project.key + number)
  // and writes the work_item_created outbox event in the same transaction.
  createWithKey(input: {
    projectId: string;
    actorUserId: string;
    statusId: string;
    type: WorkItemType;
    title: string;
    priority: Priority;
    assigneeId: string | null;
    reporterId: string;
    epicId?: string | null;
    featureId?: string | null;
    foundInStoryId?: string | null;
  }) {
    return prisma.$transaction(async (tx) => {
      // Atomic increment guarantees a unique sequential number per project.
      const project = await tx.project.update({
        where: { id: input.projectId },
        data: { nextItemNumber: { increment: 1 } },
        select: { key: true, nextItemNumber: true },
      });
      const itemNumber = project.nextItemNumber - 1;
      const itemKey = `${project.key}-${itemNumber}`;

      const item = await tx.workItem.create({
        data: {
          projectId: input.projectId,
          statusId: input.statusId,
          itemKey,
          type: input.type,
          title: input.title,
          priority: input.priority,
          assigneeId: input.assigneeId,
          reporterId: input.reporterId,
          epicId: input.epicId ?? null,
          featureId: input.featureId ?? null,
        },
        include: boardInclude,
      });

      await tx.outboxEvent.create({
        data: {
          eventType: "work_item_created",
          payload: {
            workItemId: item.id,
            itemKey: item.itemKey,
            projectId: input.projectId,
            statusId: input.statusId,
            actorUserId: input.actorUserId,
          },
        },
      });

      // "Found while testing": link the new bug back to the source story.
      if (input.foundInStoryId) {
        await tx.workItemLink.create({
          data: {
            sourceItemId: item.id,
            targetItemId: input.foundInStoryId,
            linkType: "FOUND_IN",
            createdById: input.actorUserId,
          },
        });
        await tx.outboxEvent.create({
          data: {
            eventType: "link_created",
            payload: {
              sourceItemId: item.id,
              targetItemId: input.foundInStoryId,
              linkType: "FOUND_IN",
              actorUserId: input.actorUserId,
            },
          },
        });
        // Re-read so the returned item's link count reflects the new link.
        return tx.workItem.findUniqueOrThrow({
          where: { id: item.id },
          include: boardInclude,
        });
      }

      return item;
    });
  },

  // Moves a card to a new status and emits status_changed (with from/to) atomically.
  moveStatus(input: { id: string; toStatusId: string; actorUserId: string }) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.workItem.findUnique({
        where: { id: input.id },
        select: { statusId: true, projectId: true },
      });
      if (!current) throw new Error("Work item not found");

      const item = await tx.workItem.update({
        where: { id: input.id },
        data: { statusId: input.toStatusId },
        include: boardInclude,
      });

      await tx.outboxEvent.create({
        data: {
          eventType: "status_changed",
          payload: {
            workItemId: item.id,
            projectId: current.projectId,
            fromStatusId: current.statusId,
            toStatusId: input.toStatusId,
            actorUserId: input.actorUserId,
          },
        },
      });

      return item;
    });
  },

  // Deletes a work item and emits work_item_deleted atomically.
  remove(input: { id: string; actorUserId: string }) {
    return prisma.$transaction(async (tx) => {
      const item = await tx.workItem.findUnique({
        where: { id: input.id },
        select: { id: true, projectId: true, itemKey: true },
      });
      if (!item) throw new Error("Work item not found");

      await tx.workItem.delete({ where: { id: input.id } });

      await tx.outboxEvent.create({
        data: {
          eventType: "work_item_deleted",
          payload: {
            workItemId: item.id,
            itemKey: item.itemKey,
            projectId: item.projectId,
            actorUserId: input.actorUserId,
          },
        },
      });

      return { id: item.id };
    });
  },

  // Bulk-updates a set of items in a project and emits one bulk outbox event.
  bulkUpdate(input: {
    projectId: string;
    ids: string[];
    data: Prisma.WorkItemUncheckedUpdateManyInput;
    actorUserId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      // Scope to the project so callers can't touch items elsewhere.
      const result = await tx.workItem.updateMany({
        where: { id: { in: input.ids }, projectId: input.projectId },
        data: input.data,
      });

      await tx.outboxEvent.create({
        data: {
          eventType: "work_items_bulk_updated",
          payload: {
            projectId: input.projectId,
            workItemIds: input.ids,
            fields: Object.keys(input.data),
            actorUserId: input.actorUserId,
          },
        },
      });

      return { count: result.count };
    });
  },

  bulkDelete(input: { projectId: string; ids: string[]; actorUserId: string }) {
    return prisma.$transaction(async (tx) => {
      const result = await tx.workItem.deleteMany({
        where: { id: { in: input.ids }, projectId: input.projectId },
      });
      await tx.outboxEvent.create({
        data: {
          eventType: "work_items_bulk_deleted",
          payload: {
            projectId: input.projectId,
            workItemIds: input.ids,
            actorUserId: input.actorUserId,
          },
        },
      });
      return { count: result.count };
    });
  },

  // Updates editable fields and emits work_item_updated atomically.
  updateFields(input: {
    id: string;
    actorUserId: string;
    data: Prisma.WorkItemUpdateInput;
  }) {
    return prisma.$transaction(async (tx) => {
      const item = await tx.workItem.update({
        where: { id: input.id },
        data: input.data,
        include: boardInclude,
      });

      await tx.outboxEvent.create({
        data: {
          eventType: "work_item_updated",
          payload: {
            workItemId: item.id,
            projectId: item.projectId,
            fields: Object.keys(input.data),
            actorUserId: input.actorUserId,
          },
        },
      });

      return item;
    });
  },
};
