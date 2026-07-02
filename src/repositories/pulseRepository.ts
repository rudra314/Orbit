import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

// Roles expected to submit a daily pulse. VIEWER/GUEST are read-only.
const SUBMITTING_ROLES: Prisma.ProjectMemberWhereInput["role"] = {
  in: ["PM", "LEAD", "CONTRIBUTOR"],
};

const activeItemInclude = {
  status: { select: { id: true, name: true, category: true, color: true } },
} satisfies Prisma.WorkItemInclude;

const pulseInclude = {
  items: {
    include: {
      workItem: {
        select: {
          id: true,
          itemKey: true,
          type: true,
          title: true,
          statusId: true,
          status: { select: { name: true, category: true, color: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.DailyPulseInclude;

export type PulseWithItems = Prisma.DailyPulseGetPayload<{
  include: typeof pulseInclude;
}>;

const teamPulseInclude = {
  ...pulseInclude,
  user: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.DailyPulseInclude;

export type TeamPulseRow = Prisma.DailyPulseGetPayload<{
  include: typeof teamPulseInclude;
}>;

export type PulseItemInput = {
  workItemId: string;
  progressNote: string;
  isBlocker: boolean;
  blockerDetail: string | null;
  hoursLogged: number | null;
};

export const pulseRepository = {
  getTodayPulse(projectId: string, userId: string, date: Date) {
    return prisma.dailyPulse.findUnique({
      where: { projectId_userId_date: { projectId, userId, date } },
      include: pulseInclude,
    });
  },

  // The member's own In Progress / In Review items — both are StatusCategory
  // IN_PROGRESS (see workflowDefaults), so filtering by category covers both.
  getActiveWorkItems(projectId: string, userId: string) {
    return prisma.workItem.findMany({
      where: { projectId, assigneeId: userId, status: { category: "IN_PROGRESS" } },
      include: activeItemInclude,
      orderBy: { updatedAt: "desc" },
    });
  },

  // Create-or-replace: upserts the DailyPulse row, then replaces its items and
  // syncs isBlocked/blockerReason onto the referenced work items. Also flips
  // isBlocked back off for items un-flagged in this submission. All in one
  // transaction alongside the pulse_submitted / blocker_flagged outbox events.
  submitPulse(input: {
    projectId: string;
    userId: string;
    date: Date;
    generalNote: string | null;
    items: PulseItemInput[];
    previousBlockerWorkItemIds: string[];
    actorUserId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const pulse = await tx.dailyPulse.upsert({
        where: {
          projectId_userId_date: {
            projectId: input.projectId,
            userId: input.userId,
            date: input.date,
          },
        },
        create: {
          projectId: input.projectId,
          userId: input.userId,
          date: input.date,
          generalNote: input.generalNote,
        },
        update: {
          generalNote: input.generalNote,
          submittedAt: new Date(),
        },
      });

      await tx.dailyPulseItem.deleteMany({ where: { pulseId: pulse.id } });
      if (input.items.length > 0) {
        await tx.dailyPulseItem.createMany({
          data: input.items.map((it) => ({
            pulseId: pulse.id,
            workItemId: it.workItemId,
            progressNote: it.progressNote,
            isBlocker: it.isBlocker,
            blockerDetail: it.blockerDetail,
            hoursLogged: it.hoursLogged,
          })),
        });
      }

      const newBlockerIds = input.items.filter((it) => it.isBlocker).map((it) => it.workItemId);
      for (const it of input.items.filter((i) => i.isBlocker)) {
        await tx.workItem.update({
          where: { id: it.workItemId },
          data: { isBlocked: true, blockerReason: it.blockerDetail },
        });
      }
      // Items that were flagged before but aren't in this submission anymore.
      const clearedIds = input.previousBlockerWorkItemIds.filter(
        (id) => !newBlockerIds.includes(id),
      );
      if (clearedIds.length > 0) {
        await tx.workItem.updateMany({
          where: { id: { in: clearedIds } },
          data: { isBlocked: false, blockerReason: null },
        });
      }

      await tx.outboxEvent.create({
        data: {
          eventType: "pulse_submitted",
          payload: {
            pulseId: pulse.id,
            projectId: input.projectId,
            actorUserId: input.actorUserId,
          },
        },
      });
      for (const it of input.items.filter((i) => i.isBlocker)) {
        await tx.outboxEvent.create({
          data: {
            eventType: "blocker_flagged",
            payload: {
              projectId: input.projectId,
              workItemId: it.workItemId,
              blockerDetail: it.blockerDetail,
              actorUserId: input.actorUserId,
            },
          },
        });
      }

      return tx.dailyPulse.findUniqueOrThrow({
        where: { id: pulse.id },
        include: pulseInclude,
      });
    });
  },

  getTeamPulses(projectId: string, date: Date) {
    return prisma.dailyPulse.findMany({
      where: { projectId, date },
      include: teamPulseInclude,
      orderBy: { submittedAt: "asc" },
    });
  },

  getDigest(projectId: string, date: Date) {
    return prisma.teamDigest.findUnique({
      where: { projectId_date: { projectId, date } },
    });
  },

  upsertDigest(input: {
    projectId: string;
    date: Date;
    aiSummary: string | null;
    blockerCount: number;
    submissionCount: number;
    totalMembers: number;
  }) {
    return prisma.teamDigest.upsert({
      where: { projectId_date: { projectId: input.projectId, date: input.date } },
      create: {
        projectId: input.projectId,
        date: input.date,
        aiSummary: input.aiSummary,
        blockerCount: input.blockerCount,
        submissionCount: input.submissionCount,
        totalMembers: input.totalMembers,
      },
      update: {
        aiSummary: input.aiSummary,
        blockerCount: input.blockerCount,
        submissionCount: input.submissionCount,
        totalMembers: input.totalMembers,
        generatedAt: new Date(),
      },
    });
  },

  // Past `limit` days of a member's own pulses (for the history calendar / stats).
  getPulseHistory(projectId: string, userId: string, since: Date) {
    return prisma.dailyPulse.findMany({
      where: { projectId, userId, date: { gte: since } },
      select: { date: true, submittedAt: true },
      orderBy: { date: "desc" },
    });
  },

  // All submitted pulses project-wide since a date (for the team submission-rate view).
  getAllPulsesSince(projectId: string, since: Date) {
    return prisma.dailyPulse.findMany({
      where: { projectId, date: { gte: since } },
      select: { userId: true, date: true },
    });
  },

  getProjectMemberCount(projectId: string) {
    return prisma.projectMember.count({
      where: { projectId, role: SUBMITTING_ROLES },
    });
  },

  respondToBlocker(input: { pulseItemId: string; response: string; actorUserId: string }) {
    return prisma.$transaction(async (tx) => {
      const item = await tx.dailyPulseItem.update({
        where: { id: input.pulseItemId },
        data: { dmResponse: input.response, dmRespondedAt: new Date() },
        include: {
          pulse: { select: { userId: true, projectId: true } },
          workItem: { select: { itemKey: true } },
        },
      });
      await tx.outboxEvent.create({
        data: {
          eventType: "dm_responded",
          payload: {
            pulseItemId: item.id,
            projectId: item.pulse.projectId,
            recipientUserId: item.pulse.userId,
            response: input.response,
            actorUserId: input.actorUserId,
          },
        },
      });
      return item;
    });
  },

  findPulseItemContext(pulseItemId: string) {
    return prisma.dailyPulseItem.findUnique({
      where: { id: pulseItemId },
      select: {
        id: true,
        isBlocker: true,
        pulse: { select: { projectId: true, userId: true } },
      },
    });
  },

  // Typeahead for "Add another item" — any item in the project, by key or title.
  searchProjectItems(projectId: string, query: string, take: number) {
    return prisma.workItem.findMany({
      where: {
        projectId,
        OR: [
          { itemKey: { contains: query, mode: "insensitive" } },
          { title: { contains: query, mode: "insensitive" } },
        ],
      },
      select: { id: true, itemKey: true, type: true, title: true },
      orderBy: { createdAt: "desc" },
      take,
    });
  },

  // Confirms a set of ids are real work items belonging to this project.
  validWorkItemIds(projectId: string, ids: string[]) {
    return prisma.workItem
      .findMany({ where: { projectId, id: { in: ids } }, select: { id: true } })
      .then((rows) => new Set(rows.map((r) => r.id)));
  },

  // Submitting members (PM/LEAD/CONTRIBUTOR) who have no DailyPulse row on the date.
  async getUnsubmittedMembers(projectId: string, date: Date) {
    const [members, submitted] = await Promise.all([
      prisma.projectMember.findMany({
        where: { projectId, role: SUBMITTING_ROLES },
        select: {
          userId: true,
          discipline: true,
          user: { select: { name: true, avatarUrl: true } },
        },
      }),
      prisma.dailyPulse.findMany({
        where: { projectId, date },
        select: { userId: true },
      }),
    ]);
    const submittedIds = new Set(submitted.map((s) => s.userId));
    return members.filter((m) => !submittedIds.has(m.userId));
  },

  // Distinct dates (within range) that had at least one flagged blocker —
  // used by the 30-day history calendar's "days with blockers" stat.
  async getBlockerDatesSince(projectId: string, since: Date) {
    const rows = await prisma.dailyPulseItem.findMany({
      where: { isBlocker: true, pulse: { projectId, date: { gte: since } } },
      select: { pulse: { select: { date: true } } },
      distinct: ["pulseId"],
    });
    return new Set(rows.map((r) => r.pulse.date.toISOString().slice(0, 10)));
  },
};
