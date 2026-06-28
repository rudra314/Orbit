import { prisma } from "./prisma";

// Prisma queries for organizations and org membership.
export const orgRepository = {
  // The user's primary org (earliest joined). Pilot users belong to one org.
  primaryForUser(userId: string) {
    return prisma.orgMember.findFirst({
      where: { userId },
      orderBy: { joinedAt: "asc" },
      include: { org: true },
    });
  },

  countMembership(userId: string, orgId: string) {
    return prisma.orgMember.count({ where: { userId, orgId } });
  },
};
