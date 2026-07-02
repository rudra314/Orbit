import { prisma } from "./prisma";

// Prisma queries for the User model. No business logic here.
export const userRepository = {
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  create(data: { email: string; name: string; avatarUrl?: string | null }) {
    return prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        avatarUrl: data.avatarUrl ?? null,
        provider: "magic_link",
        lastLogin: new Date(),
      },
    });
  },

  updateLastLogin(id: string) {
    return prisma.user.update({
      where: { id },
      data: { lastLogin: new Date() },
    });
  },
};
