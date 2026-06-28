import { prisma } from "./prisma";

// Prisma queries for project membership.
export const projectMemberRepository = {
  // Membership row for a single user (used for permission checks).
  find(projectId: string, userId: string) {
    return prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
  },

  // All members of a project, with user details (assignee pickers, filters).
  listForProject(projectId: string) {
    return prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { joinedAt: "asc" },
    });
  },
};
