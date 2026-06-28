import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

export const sprintRepository = {
  // Lightweight list used by board/backlog filters and validation.
  listForProject(projectId: string) {
    return prisma.sprint.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, status: true },
    });
  },

  // Full sprint rows for the sprints page.
  listForProjectFull(projectId: string) {
    return prisma.sprint.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });
  },

  getActive(projectId: string) {
    return prisma.sprint.findFirst({
      where: { projectId, status: "ACTIVE" },
    });
  },

  findProjectId(id: string) {
    return prisma.sprint.findUnique({
      where: { id },
      select: { id: true, projectId: true, status: true, name: true },
    });
  },

  create(input: {
    projectId: string;
    name: string;
    startDate: Date | null;
    endDate: Date | null;
    goal: string | null;
    actorUserId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const sprint = await tx.sprint.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          startDate: input.startDate,
          endDate: input.endDate,
          goal: input.goal,
        },
      });
      await tx.outboxEvent.create({
        data: {
          eventType: "sprint_created",
          payload: {
            sprintId: sprint.id,
            projectId: input.projectId,
            actorUserId: input.actorUserId,
          },
        },
      });
      return sprint;
    });
  },

  update(input: {
    id: string;
    data: Prisma.SprintUpdateInput;
    actorUserId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const sprint = await tx.sprint.update({
        where: { id: input.id },
        data: input.data,
      });
      await tx.outboxEvent.create({
        data: {
          eventType: "sprint_updated",
          payload: {
            sprintId: sprint.id,
            projectId: sprint.projectId,
            fields: Object.keys(input.data),
            actorUserId: input.actorUserId,
          },
        },
      });
      return sprint;
    });
  },

  // Sets a sprint ACTIVE (and its start date) atomically, emitting sprint_started.
  start(input: {
    id: string;
    projectId: string;
    startDate: Date;
    actorUserId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const sprint = await tx.sprint.update({
        where: { id: input.id },
        data: { status: "ACTIVE", startDate: input.startDate },
      });
      await tx.outboxEvent.create({
        data: {
          eventType: "sprint_started",
          payload: {
            sprintId: sprint.id,
            projectId: input.projectId,
            actorUserId: input.actorUserId,
          },
        },
      });
      return sprint;
    });
  },

  // Completes a sprint and carries over the given incomplete items in one tx.
  complete(input: {
    id: string;
    projectId: string;
    endDate: Date;
    carryoverIds: string[];
    carryoverTo: string | null; // null = backlog, otherwise next sprint id
    actorUserId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const sprint = await tx.sprint.update({
        where: { id: input.id },
        data: { status: "COMPLETED", endDate: input.endDate },
      });

      if (input.carryoverIds.length > 0) {
        await tx.workItem.updateMany({
          where: { id: { in: input.carryoverIds }, projectId: input.projectId },
          data: { sprintId: input.carryoverTo },
        });
      }

      await tx.outboxEvent.create({
        data: {
          eventType: "sprint_completed",
          payload: {
            sprintId: sprint.id,
            projectId: input.projectId,
            carriedOver: input.carryoverIds,
            carryoverTo: input.carryoverTo,
            actorUserId: input.actorUserId,
          },
        },
      });
      return sprint;
    });
  },

  // Deletes a sprint. Work items' sprintId is set null by the FK (onDelete: SetNull).
  remove(input: { id: string; actorUserId: string }) {
    return prisma.$transaction(async (tx) => {
      const sprint = await tx.sprint.findUnique({
        where: { id: input.id },
        select: { id: true, projectId: true },
      });
      if (!sprint) throw new Error("Sprint not found");
      await tx.sprint.delete({ where: { id: input.id } });
      await tx.outboxEvent.create({
        data: {
          eventType: "sprint_deleted",
          payload: {
            sprintId: sprint.id,
            projectId: sprint.projectId,
            actorUserId: input.actorUserId,
          },
        },
      });
      return { id: sprint.id };
    });
  },
};
