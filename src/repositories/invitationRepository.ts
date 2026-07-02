import { prisma } from "./prisma";
import type { Discipline, ProjectRole } from "@prisma/client";

export const invitationRepository = {
  // Pending invitations for a project (newest first).
  listPending(projectId: string) {
    return prisma.invitation.findMany({
      where: { projectId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
  },

  findById(id: string) {
    return prisma.invitation.findUnique({ where: { id } });
  },

  // Pending, unexpired invitations for an email (used at sign-in to auto-join
  // the invited projects).
  listPendingForEmail(email: string) {
    return prisma.invitation.findMany({
      where: {
        email: email.toLowerCase(),
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });
  },

  create(input: {
    orgId: string;
    projectId: string;
    email: string;
    role: ProjectRole;
    discipline: Discipline;
    message: string | null;
    invitedBy: string;
    expiresAt: Date;
  }) {
    return prisma.invitation.create({
      data: {
        orgId: input.orgId,
        projectId: input.projectId,
        email: input.email.toLowerCase(),
        role: input.role,
        discipline: input.discipline,
        message: input.message,
        invitedBy: input.invitedBy,
        expiresAt: input.expiresAt,
      },
    });
  },

  updateExpiry(id: string, expiresAt: Date) {
    return prisma.invitation.update({ where: { id }, data: { expiresAt } });
  },

  setStatus(id: string, status: "ACCEPTED" | "EXPIRED" | "REVOKED") {
    return prisma.invitation.update({ where: { id }, data: { status } });
  },
};
