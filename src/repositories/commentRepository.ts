import { prisma } from "./prisma";
import { logActivity } from "./activityRepository";
import type { Prisma } from "@prisma/client";

const withAuthor = {
  author: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.CommentInclude;

export type CommentRow = Prisma.CommentGetPayload<{ include: typeof withAuthor }>;

export const commentRepository = {
  // All comments on an item, oldest first. The service nests replies under their
  // parents (the feed only goes one level deep).
  listForItem(workItemId: string) {
    return prisma.comment.findMany({
      where: { workItemId },
      include: withAuthor,
      orderBy: { createdAt: "asc" },
    });
  },

  // Resolves a comment to the context needed to authorize edit/delete.
  findContext(id: string) {
    return prisma.comment.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
        parentId: true,
        createdAt: true,
        workItemId: true,
        workItem: { select: { projectId: true } },
      },
    });
  },

  // Parent lookup used to flatten nesting (a reply to a reply attaches to the
  // top-level parent instead).
  findParent(id: string) {
    return prisma.comment.findUnique({
      where: { id },
      select: { id: true, parentId: true, workItemId: true },
    });
  },

  // Creates the comment and, in the same transaction, queues the comment_added
  // outbox event (with notification recipients) and writes the activity row.
  create(input: {
    workItemId: string;
    projectId: string;
    assigneeId: string | null;
    authorId: string;
    body: string;
    parentId: string | null;
    mentions: string[];
  }) {
    return prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          workItemId: input.workItemId,
          authorId: input.authorId,
          parentId: input.parentId,
          body: input.body,
          mentions: input.mentions.length > 0 ? input.mentions : undefined,
        },
        include: withAuthor,
      });

      // Notification recipients (delivery lands in Session 11): the item's
      // assignee, everyone @mentioned, and anyone who already commented here.
      const priorAuthors = await tx.comment.findMany({
        where: { workItemId: input.workItemId, NOT: { authorId: input.authorId } },
        select: { authorId: true },
        distinct: ["authorId"],
      });
      const recipients = new Set<string>();
      if (input.assigneeId) recipients.add(input.assigneeId);
      for (const m of input.mentions) recipients.add(m);
      for (const p of priorAuthors) recipients.add(p.authorId);
      recipients.delete(input.authorId);

      await tx.outboxEvent.create({
        data: {
          eventType: "comment_added",
          payload: {
            commentId: created.id,
            workItemId: input.workItemId,
            projectId: input.projectId,
            actorUserId: input.authorId,
            mentions: input.mentions,
            notifyUserIds: [...recipients],
          },
        },
      });

      await logActivity(tx, {
        projectId: input.projectId,
        userId: input.authorId,
        workItemId: input.workItemId,
        eventType: "comment_added",
        metadata: { commentId: created.id, snippet: input.body.slice(0, 100) },
      });

      return created;
    });
  },

  update(id: string, body: string) {
    return prisma.comment.update({
      where: { id },
      data: { body },
      include: withAuthor,
    });
  },

  // Deletes a comment. Any replies are re-parented to the top level (parentId
  // null) so the thread doesn't lose them.
  remove(id: string) {
    return prisma.$transaction(async (tx) => {
      await tx.comment.updateMany({
        where: { parentId: id },
        data: { parentId: null },
      });
      await tx.comment.delete({ where: { id } });
      return { id };
    });
  },
};
