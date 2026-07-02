import { prisma } from "./prisma";
import type { Discipline, ProjectRole } from "@prisma/client";

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

  // Full member rows for the team settings table (includes email).
  listForTeam(projectId: string) {
    return prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    });
  },

  countByRole(projectId: string, role: ProjectRole) {
    return prisma.projectMember.count({ where: { projectId, role } });
  },

  updateRole(projectId: string, userId: string, role: ProjectRole) {
    return prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId } },
      data: { role },
    });
  },

  updateDiscipline(projectId: string, userId: string, discipline: Discipline) {
    return prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId } },
      data: { discipline },
    });
  },

  remove(projectId: string, userId: string) {
    return prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });
  },

  // Idempotent join used when accepting an invitation.
  upsert(input: {
    projectId: string;
    userId: string;
    role: ProjectRole;
    discipline: Discipline;
  }) {
    return prisma.projectMember.upsert({
      where: {
        projectId_userId: { projectId: input.projectId, userId: input.userId },
      },
      create: {
        projectId: input.projectId,
        userId: input.userId,
        role: input.role,
        discipline: input.discipline,
      },
      update: {},
    });
  },
};
