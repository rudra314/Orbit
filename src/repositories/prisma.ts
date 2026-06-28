import { PrismaClient } from "@prisma/client";

// Prisma client singleton.
// In dev, Next.js hot-reload re-evaluates modules and would otherwise create a
// new PrismaClient (and a new connection pool) on every change, exhausting the
// database's connection limit. Caching the instance on globalThis prevents that.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
