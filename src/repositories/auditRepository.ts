import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

const withUser = {
  user: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.AuditLogInclude;

export type AuditRow = Prisma.AuditLogGetPayload<{ include: typeof withUser }>;

export type AuditFilters = {
  action?: string;
  userId?: string;
  entityType?: string;
  from?: Date;
  to?: Date;
};

export type AuditWriteInput = {
  orgId: string;
  userId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
};

function buildWhere(orgId: string, f: AuditFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = { orgId };
  if (f.action) where.action = f.action;
  if (f.userId) where.userId = f.userId;
  if (f.entityType) where.entityType = f.entityType;
  if (f.from || f.to) {
    where.createdAt = {
      ...(f.from ? { gte: f.from } : {}),
      ...(f.to ? { lte: f.to } : {}),
    };
  }
  return where;
}

export const auditRepository = {
  // Writes one audit row. Accepts an optional transaction client so the audit
  // can be committed atomically with the mutation it records.
  write(input: AuditWriteInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.auditLog.create({
      data: {
        orgId: input.orgId,
        userId: input.userId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        oldValue: input.oldValue,
        newValue: input.newValue,
      },
    });
  },

  // Filtered page (newest first) with cursor pagination (over-fetch limit + 1).
  list(
    orgId: string,
    filters: AuditFilters,
    opts: { limit: number; cursor?: string },
  ) {
    return prisma.auditLog.findMany({
      where: buildWhere(orgId, filters),
      include: withUser,
      orderBy: { createdAt: "desc" },
      take: opts.limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
  },

  // Full filtered set (no pagination) for CSV export. Capped to avoid runaway
  // exports.
  listAll(orgId: string, filters: AuditFilters, cap = 5000) {
    return prisma.auditLog.findMany({
      where: buildWhere(orgId, filters),
      include: withUser,
      orderBy: { createdAt: "desc" },
      take: cap,
    });
  },

  // Distinct actors that appear in a project's audit trail, for the filter
  // dropdown.
  async actorsForOrg(orgId: string) {
    const rows = await prisma.auditLog.findMany({
      where: { orgId, userId: { not: null } },
      select: { user: { select: { id: true, name: true } } },
      distinct: ["userId"],
    });
    return rows
      .map((r) => r.user)
      .filter((u): u is { id: string; name: string } => u !== null);
  },
};
