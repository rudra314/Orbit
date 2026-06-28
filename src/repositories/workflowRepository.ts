import { prisma } from "./prisma";

// Prisma queries for workflow statuses (board columns).
export const workflowRepository = {
  listForProject(projectId: string) {
    return prisma.workflowStatus.findMany({
      where: { projectId },
      orderBy: { displayOrder: "asc" },
    });
  },
};
