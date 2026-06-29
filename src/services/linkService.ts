import { linkRepository, type WorkItemLinkRow } from "@/repositories/linkRepository";
import { workItemRepository } from "@/repositories/workItemRepository";
import { permissionService } from "@/services/permissionService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import type { LinkType } from "@prisma/client";

const LINK_TYPES: LinkType[] = [
  "RELATES_TO",
  "BLOCKS",
  "IS_BLOCKED_BY",
  "CAUSES",
  "IS_CAUSED_BY",
  "DUPLICATES",
  "IS_DUPLICATED_BY",
  "FOUND_IN",
  "TESTED_BY",
  "DEPENDS_ON",
];

// Inverse stored as a second row so the other item sees its side of the link.
// Types without an inverse (FOUND_IN, TESTED_BY, DEPENDS_ON) are one-directional.
const REVERSE: Partial<Record<LinkType, LinkType>> = {
  RELATES_TO: "RELATES_TO",
  BLOCKS: "IS_BLOCKED_BY",
  IS_BLOCKED_BY: "BLOCKS",
  CAUSES: "IS_CAUSED_BY",
  IS_CAUSED_BY: "CAUSES",
  DUPLICATES: "IS_DUPLICATED_BY",
  IS_DUPLICATED_BY: "DUPLICATES",
};

function toLinkDto(row: WorkItemLinkRow) {
  return {
    id: row.id,
    linkType: row.linkType,
    item: {
      id: row.targetItem.id,
      itemKey: row.targetItem.itemKey,
      type: row.targetItem.type,
      title: row.targetItem.title,
      statusName: row.targetItem.status.name,
      statusColor: row.targetItem.status.color,
      assignee: row.targetItem.assignee,
    },
  };
}

export type LinkDto = ReturnType<typeof toLinkDto>;

async function listDto(itemId: string) {
  const rows = await linkRepository.listForItem(itemId);
  const links = rows.map(toLinkDto);
  return { links, linkCount: links.length };
}

export const linkService = {
  // All source-side links for an item (any project member may view).
  async getLinks(itemId: string, actorUserId: string) {
    const item = await workItemRepository.findProjectIdById(itemId);
    if (!item) throw new NotFoundError("Work item not found.");
    await permissionService.assertProjectMember(actorUserId, item.projectId);
    return listDto(itemId);
  },

  // Create a link (PM/LEAD/CONTRIBUTOR). Auto-creates the reverse row.
  async createLink(input: {
    actorUserId: string;
    sourceItemId: string;
    targetItemId: string;
    linkType: LinkType;
  }) {
    if (!LINK_TYPES.includes(input.linkType)) {
      throw new ValidationError("Invalid link type.");
    }
    if (input.sourceItemId === input.targetItemId) {
      throw new ValidationError("An item cannot be linked to itself.");
    }

    const source = await workItemRepository.findProjectIdById(input.sourceItemId);
    if (!source) throw new NotFoundError("Work item not found.");
    await permissionService.assertCanMutateBoard(input.actorUserId, source.projectId);

    const target = await workItemRepository.findProjectIdById(input.targetItemId);
    if (!target) throw new ValidationError("The item to link was not found.");
    if (target.projectId !== source.projectId) {
      throw new ValidationError("Linked items must be in the same project.");
    }

    const existing = await linkRepository.find(
      input.sourceItemId,
      input.targetItemId,
      input.linkType,
    );
    if (existing) throw new ValidationError("That link already exists.");

    await linkRepository.create({
      sourceItemId: input.sourceItemId,
      targetItemId: input.targetItemId,
      linkType: input.linkType,
      reverseType: REVERSE[input.linkType] ?? null,
      actorUserId: input.actorUserId,
    });

    return listDto(input.sourceItemId);
  },

  // Remove a link and its reverse (PM/LEAD only).
  async removeLink(linkId: string, actorUserId: string) {
    const link = await linkRepository.findWithProject(linkId);
    if (!link) throw new NotFoundError("Link not found.");
    await permissionService.assertCanManageLinks(
      actorUserId,
      link.sourceItem.projectId,
    );

    await linkRepository.remove({
      sourceItemId: link.sourceItemId,
      targetItemId: link.targetItemId,
      linkType: link.linkType,
      reverseType: REVERSE[link.linkType] ?? null,
      actorUserId,
    });

    return listDto(link.sourceItemId);
  },

  // Typeahead for the "Add link" form — items in the same project (max 10).
  async searchItems(input: {
    actorUserId: string;
    itemId: string;
    query: string;
  }) {
    const item = await workItemRepository.findProjectIdById(input.itemId);
    if (!item) throw new NotFoundError("Work item not found.");
    await permissionService.assertProjectMember(input.actorUserId, item.projectId);

    const query = input.query.trim();
    if (!query) return { results: [] };

    const results = await linkRepository.searchInProject({
      projectId: item.projectId,
      excludeItemId: input.itemId,
      query,
      take: 10,
    });
    return { results };
  },
};
