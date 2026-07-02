import {
  commentRepository,
  type CommentRow,
} from "@/repositories/commentRepository";
import { workItemRepository } from "@/repositories/workItemRepository";
import { projectMemberRepository } from "@/repositories/projectMemberRepository";
import { permissionService, PermissionError } from "@/services/permissionService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";

// Authors may edit their own comment only within this window of posting it.
const EDIT_WINDOW_MS = 15 * 60 * 1000;

export type CommentDto = {
  id: string;
  body: string;
  mentions: string[];
  parentId: string | null;
  author: { id: string; name: string; avatarUrl: string | null };
  createdAt: string;
  updatedAt: string;
  editableUntil: string;
  replies: CommentDto[];
};

function toDto(row: CommentRow, replies: CommentDto[] = []): CommentDto {
  return {
    id: row.id,
    body: row.body,
    mentions: Array.isArray(row.mentions) ? (row.mentions as string[]) : [],
    parentId: row.parentId,
    author: {
      id: row.author.id,
      name: row.author.name,
      avatarUrl: row.author.avatarUrl,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    editableUntil: new Date(row.createdAt.getTime() + EDIT_WINDOW_MS).toISOString(),
    replies,
  };
}

// Keeps only mention ids that are real members of the project.
async function validMentions(projectId: string, mentions: unknown): Promise<string[]> {
  if (!Array.isArray(mentions) || mentions.length === 0) return [];
  const ids = [...new Set(mentions.filter((m): m is string => typeof m === "string"))];
  if (ids.length === 0) return [];
  const members = await projectMemberRepository.listForProject(projectId);
  const memberIds = new Set(members.map((m) => m.userId));
  return ids.filter((id) => memberIds.has(id));
}

export const commentService = {
  // Threaded list for an item (top-level comments, each with its replies).
  // Any project member — VIEWER included — may read.
  async getByWorkItem(workItemId: string, actorUserId: string): Promise<CommentDto[]> {
    const item = await workItemRepository.findProjectIdById(workItemId);
    if (!item) throw new NotFoundError("Work item not found.");
    await permissionService.assertProjectMember(actorUserId, item.projectId);

    const rows = await commentRepository.listForItem(workItemId);
    const repliesByParent = new Map<string, CommentRow[]>();
    const roots: CommentRow[] = [];
    for (const row of rows) {
      if (row.parentId) {
        const list = repliesByParent.get(row.parentId) ?? [];
        list.push(row);
        repliesByParent.set(row.parentId, list);
      } else {
        roots.push(row);
      }
    }
    return roots.map((root) =>
      toDto(root, (repliesByParent.get(root.id) ?? []).map((r) => toDto(r))),
    );
  },

  // Create a comment or reply. CONTRIBUTOR and above.
  async create(input: {
    workItemId: string;
    authorId: string;
    body: string;
    parentId?: string | null;
    mentions?: string[];
  }): Promise<CommentDto> {
    const body = input.body?.trim();
    if (!body) throw new ValidationError("Comment cannot be empty.");

    const item = await workItemRepository.findCommentContext(input.workItemId);
    if (!item) throw new NotFoundError("Work item not found.");
    await permissionService.assertCanMutateBoard(input.authorId, item.projectId);

    // Resolve the parent and flatten nesting — a reply to a reply attaches to
    // the top-level comment so the thread is never deeper than one level.
    let parentId: string | null = null;
    if (input.parentId) {
      const parent = await commentRepository.findParent(input.parentId);
      if (!parent || parent.workItemId !== input.workItemId) {
        throw new ValidationError("Parent comment is not on this item.");
      }
      parentId = parent.parentId ?? parent.id;
    }

    const mentions = await validMentions(item.projectId, input.mentions);

    const created = await commentRepository.create({
      workItemId: input.workItemId,
      projectId: item.projectId,
      assigneeId: item.assigneeId,
      authorId: input.authorId,
      body,
      parentId,
      mentions,
    });
    return toDto(created);
  },

  // Edit own comment, within the 15-minute window only.
  async update(commentId: string, body: string, actorUserId: string): Promise<CommentDto> {
    const trimmed = body?.trim();
    if (!trimmed) throw new ValidationError("Comment cannot be empty.");

    const comment = await commentRepository.findContext(commentId);
    if (!comment) throw new NotFoundError("Comment not found.");
    if (comment.authorId !== actorUserId) {
      throw new PermissionError("You can only edit your own comments.");
    }
    if (Date.now() - comment.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw new ValidationError("The 15-minute edit window has passed.");
    }

    const updated = await commentRepository.update(commentId, trimmed);
    return toDto(updated);
  },

  // Delete a comment: own comment, or any comment if the actor is the PM.
  async delete(commentId: string, actorUserId: string): Promise<{ id: string }> {
    const comment = await commentRepository.findContext(commentId);
    if (!comment) throw new NotFoundError("Comment not found.");

    if (comment.authorId !== actorUserId) {
      // Not the author — only the project PM may delete others' comments.
      await permissionService.assertCanDelete(actorUserId, comment.workItem.projectId);
    } else {
      // Author still has to be a current project member.
      await permissionService.assertProjectMember(
        actorUserId,
        comment.workItem.projectId,
      );
    }

    return commentRepository.remove(commentId);
  },
};
