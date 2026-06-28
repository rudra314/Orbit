import { prisma } from "./prisma";
import type { FeatureStatus, Prisma } from "@prisma/client";

export const featureRepository = {
  findWithProject(id: string) {
    return prisma.feature.findUnique({
      where: { id },
      select: { id: true, projectId: true, epicId: true },
    });
  },

  create(data: { projectId: string; epicId: string; title: string }) {
    return prisma.feature.create({
      data: {
        projectId: data.projectId,
        epicId: data.epicId,
        title: data.title,
      },
    });
  },

  update(id: string, data: Prisma.FeatureUpdateInput) {
    return prisma.feature.update({ where: { id }, data });
  },

  setStatus(id: string, status: FeatureStatus) {
    return prisma.feature.update({ where: { id }, data: { status } });
  },
};
