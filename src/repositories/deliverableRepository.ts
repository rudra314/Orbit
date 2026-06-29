import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

export const deliverableRepository = {
  listForProject(projectId: string) {
    return prisma.deliverable.findMany({
      where: { projectId },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    });
  },

  // Just enough to authorize a mutation against the deliverable's project.
  findProjectId(id: string) {
    return prisma.deliverable.findUnique({
      where: { id },
      select: { id: true, projectId: true, name: true },
    });
  },

  create(input: {
    projectId: string;
    actorUserId: string;
    data: Prisma.DeliverableCreateInput;
  }) {
    return prisma.$transaction(async (tx) => {
      const deliverable = await tx.deliverable.create({ data: input.data });
      await tx.outboxEvent.create({
        data: {
          eventType: "deliverable_created",
          payload: {
            deliverableId: deliverable.id,
            projectId: input.projectId,
            actorUserId: input.actorUserId,
          },
        },
      });
      return deliverable;
    });
  },

  update(input: {
    id: string;
    projectId: string;
    actorUserId: string;
    data: Prisma.DeliverableUpdateInput;
    eventType?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const deliverable = await tx.deliverable.update({
        where: { id: input.id },
        data: input.data,
      });
      await tx.outboxEvent.create({
        data: {
          eventType: input.eventType ?? "deliverable_updated",
          payload: {
            deliverableId: deliverable.id,
            projectId: input.projectId,
            fields: Object.keys(input.data),
            actorUserId: input.actorUserId,
          },
        },
      });
      return deliverable;
    });
  },

  remove(input: { id: string; projectId: string; actorUserId: string }) {
    return prisma.$transaction(async (tx) => {
      await tx.deliverable.delete({ where: { id: input.id } });
      await tx.outboxEvent.create({
        data: {
          eventType: "deliverable_deleted",
          payload: {
            deliverableId: input.id,
            projectId: input.projectId,
            actorUserId: input.actorUserId,
          },
        },
      });
      return { id: input.id };
    });
  },
};
