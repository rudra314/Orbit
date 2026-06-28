import { prisma } from "./prisma";
import type { EpicStatus, Prisma } from "@prisma/client";

export const epicRepository = {
  // Epics for a project, each with its features (for the backlog sidebar).
  // Stats/derived status are computed in the service from the items list.
  listForProject(projectId: string) {
    return prisma.epic.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        features: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, title: true, status: true, sortOrder: true },
        },
      },
    });
  },

  findProjectId(id: string) {
    return prisma.epic.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    });
  },

  create(data: { projectId: string; title: string }) {
    return prisma.epic.create({
      data: { projectId: data.projectId, title: data.title },
      include: { features: true },
    });
  },

  update(id: string, data: Prisma.EpicUpdateInput) {
    return prisma.epic.update({
      where: { id },
      data,
      include: { features: true },
    });
  },

  // Persist a recomputed derived status only when it changed.
  setStatus(id: string, status: EpicStatus) {
    return prisma.epic.update({ where: { id }, data: { status } });
  },
};
