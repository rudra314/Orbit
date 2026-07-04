import { prisma } from "./prisma";
import { logActivity } from "./activityRepository";
import type { LinkType, Prisma } from "@prisma/client";

// Fields shown for the item on the far end of a link (row + status badge + avatar).
const linkedItemSelect = {
  id: true,
  itemKey: true,
  type: true,
  title: true,
  status: { select: { name: true, color: true } },
  assignee: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.WorkItemSelect;

const withSourceAndTarget = {
  sourceItem: { select: linkedItemSelect },
  targetItem: { select: linkedItemSelect },
} satisfies Prisma.WorkItemLinkInclude;

// Types that don't get a materialized reverse row (see linkService's REVERSE
// map) — the target side has to be queried separately to see its side of it.
const ONE_DIRECTIONAL_TYPES: LinkType[] = ["FOUND_IN", "TESTED_BY", "DEPENDS_ON"];

export type WorkItemLinkRowWithDirection = Prisma.WorkItemLinkGetPayload<{
  include: typeof withSourceAndTarget;
}> & { direction: "out" | "in" };

export const linkRepository = {
  // Every link touching an item: its own outgoing relationships (reverse rows
  // are stored so the other item sees its side for two-way types), plus the
  // incoming side of one-directional types (e.g. a story sees the bug that
  // was "found in" it, even though only the bug->story row is stored).
  async listForItem(itemId: string): Promise<WorkItemLinkRowWithDirection[]> {
    const [outgoing, incoming] = await Promise.all([
      prisma.workItemLink.findMany({
        where: { sourceItemId: itemId },
        include: withSourceAndTarget,
        orderBy: { createdAt: "asc" },
      }),
      prisma.workItemLink.findMany({
        where: { targetItemId: itemId, linkType: { in: ONE_DIRECTIONAL_TYPES } },
        include: withSourceAndTarget,
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return [
      ...outgoing.map((r) => ({ ...r, direction: "out" as const })),
      ...incoming.map((r) => ({ ...r, direction: "in" as const })),
    ];
  },

  // Number of source-side links — matches what the detail panel renders and
  // what the board card badge shows.
  countForItem(itemId: string) {
    return prisma.workItemLink.count({ where: { sourceItemId: itemId } });
  },

  find(sourceItemId: string, targetItemId: string, linkType: LinkType) {
    return prisma.workItemLink.findUnique({
      where: {
        sourceItemId_targetItemId_linkType: {
          sourceItemId,
          targetItemId,
          linkType,
        },
      },
    });
  },

  // Resolves a link to the project of its source item (for authorization).
  findWithProject(id: string) {
    return prisma.workItemLink.findUnique({
      where: { id },
      select: {
        id: true,
        sourceItemId: true,
        targetItemId: true,
        linkType: true,
        sourceItem: { select: { projectId: true } },
      },
    });
  },

  // Creates the forward link plus its reverse (when the type has an inverse),
  // and emits link_created — all atomically.
  create(input: {
    sourceItemId: string;
    targetItemId: string;
    linkType: LinkType;
    reverseType: LinkType | null;
    actorUserId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const rows: Prisma.WorkItemLinkCreateManyInput[] = [
        {
          sourceItemId: input.sourceItemId,
          targetItemId: input.targetItemId,
          linkType: input.linkType,
          createdById: input.actorUserId,
        },
      ];
      if (input.reverseType) {
        rows.push({
          sourceItemId: input.targetItemId,
          targetItemId: input.sourceItemId,
          linkType: input.reverseType,
          createdById: input.actorUserId,
        });
      }
      // skipDuplicates guards the reverse row if it somehow already exists; the
      // forward row is checked for duplicates in the service before we get here.
      await tx.workItemLink.createMany({ data: rows, skipDuplicates: true });

      await tx.outboxEvent.create({
        data: {
          eventType: "link_created",
          payload: {
            sourceItemId: input.sourceItemId,
            targetItemId: input.targetItemId,
            linkType: input.linkType,
            actorUserId: input.actorUserId,
          },
        },
      });

      const [source, target] = await Promise.all([
        tx.workItem.findUnique({
          where: { id: input.sourceItemId },
          select: { projectId: true },
        }),
        tx.workItem.findUnique({
          where: { id: input.targetItemId },
          select: { itemKey: true, title: true },
        }),
      ]);
      if (source) {
        await logActivity(tx, {
          projectId: source.projectId,
          userId: input.actorUserId,
          workItemId: input.sourceItemId,
          eventType: "link_created",
          metadata: {
            linkType: input.linkType,
            targetId: input.targetItemId,
            targetKey: target?.itemKey ?? "",
            targetTitle: target?.title ?? "",
          },
        });
      }
    });
  },

  // Removes a link and its reverse (if any), emitting link_removed atomically.
  remove(input: {
    sourceItemId: string;
    targetItemId: string;
    linkType: LinkType;
    reverseType: LinkType | null;
    actorUserId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      await tx.workItemLink.deleteMany({
        where: {
          sourceItemId: input.sourceItemId,
          targetItemId: input.targetItemId,
          linkType: input.linkType,
        },
      });
      if (input.reverseType) {
        await tx.workItemLink.deleteMany({
          where: {
            sourceItemId: input.targetItemId,
            targetItemId: input.sourceItemId,
            linkType: input.reverseType,
          },
        });
      }

      await tx.outboxEvent.create({
        data: {
          eventType: "link_removed",
          payload: {
            sourceItemId: input.sourceItemId,
            targetItemId: input.targetItemId,
            linkType: input.linkType,
            actorUserId: input.actorUserId,
          },
        },
      });
    });
  },

  // Search candidates within a project (by key or title), excluding the item
  // itself. Capped by the caller.
  searchInProject(input: {
    projectId: string;
    excludeItemId: string;
    query: string;
    take: number;
  }) {
    return prisma.workItem.findMany({
      where: {
        projectId: input.projectId,
        id: { not: input.excludeItemId },
        OR: [
          { itemKey: { contains: input.query, mode: "insensitive" } },
          { title: { contains: input.query, mode: "insensitive" } },
        ],
      },
      select: { id: true, itemKey: true, type: true, title: true },
      orderBy: { createdAt: "desc" },
      take: input.take,
    });
  },
};
