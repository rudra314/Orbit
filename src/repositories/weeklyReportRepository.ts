import { prisma } from "./prisma";
import type { Prisma, ReportStatus } from "@prisma/client";

export const weeklyReportRepository = {
  // Report history for the project, most recent first.
  listForProject(projectId: string) {
    return prisma.weeklyReport.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
  },

  findById(id: string) {
    return prisma.weeklyReport.findUnique({ where: { id } });
  },

  // Creates a DRAFT report with its collected data snapshot and emits the event.
  createDraft(input: {
    projectId: string;
    actorUserId: string;
    title: string;
    content: Prisma.InputJsonValue;
    sourceData: Prisma.InputJsonValue;
    aiAssisted: boolean;
  }) {
    return prisma.$transaction(async (tx) => {
      const report = await tx.weeklyReport.create({
        data: {
          projectId: input.projectId,
          title: input.title,
          content: input.content,
          sourceData: input.sourceData,
          aiAssisted: input.aiAssisted,
          status: "DRAFT",
        },
      });
      await tx.outboxEvent.create({
        data: {
          eventType: "report_generated",
          payload: {
            reportId: report.id,
            projectId: input.projectId,
            aiAssisted: input.aiAssisted,
            actorUserId: input.actorUserId,
          },
        },
      });
      return report;
    });
  },

  // Updates a report's content and/or status atomically with an outbox event.
  update(input: {
    id: string;
    projectId: string;
    actorUserId: string;
    data: Prisma.WeeklyReportUpdateInput;
    eventType: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const report = await tx.weeklyReport.update({
        where: { id: input.id },
        data: input.data,
      });
      await tx.outboxEvent.create({
        data: {
          eventType: input.eventType,
          payload: {
            reportId: report.id,
            projectId: input.projectId,
            actorUserId: input.actorUserId,
          },
        },
      });
      return report;
    });
  },
};

export type WeeklyReportRow = Awaited<
  ReturnType<typeof weeklyReportRepository.findById>
>;

export type { ReportStatus };
