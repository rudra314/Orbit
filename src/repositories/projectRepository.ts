import { prisma } from "./prisma";
import type {
  AiApprovalRule,
  AiMode,
  Discipline,
  ProjectRole,
  ProjectType,
} from "@prisma/client";
import type { WorkflowStatusInput } from "@/lib/workflowDefaults";

export type CreateProjectData = {
  orgId: string;
  creatorUserId: string;
  creatorDiscipline: Discipline;
  name: string;
  key: string;
  type: ProjectType;
  description?: string | null;
  accentColor: string;
  startDate?: Date | null;
  targetDate?: Date | null;
  workflowStatuses: WorkflowStatusInput[];
  ai: {
    aiMode: AiMode;
    provider?: string | null;
    model?: string | null;
    approvalRule: AiApprovalRule;
  };
  invites: { email: string; role: ProjectRole; discipline: Discipline }[];
};

export const projectRepository = {
  listForUser(userId: string) {
    return prisma.project.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: "asc" },
    });
  },

  getByKeyForUser(key: string, userId: string) {
    return prisma.project.findFirst({
      where: { key, members: { some: { userId } } },
    });
  },

  existsByKeyInOrg(orgId: string, key: string) {
    return prisma.project.findFirst({ where: { orgId, key }, select: { id: true } });
  },

  // Creates the project and all of its initial relations in a single
  // transaction, including the transactional-outbox event.
  createWithRelations(data: CreateProjectData) {
    const inviteExpiry = new Date();
    inviteExpiry.setDate(inviteExpiry.getDate() + 7);

    return prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          orgId: data.orgId,
          name: data.name,
          key: data.key,
          type: data.type,
          description: data.description ?? null,
          accentColor: data.accentColor,
          startDate: data.startDate ?? null,
          targetDate: data.targetDate ?? null,
        },
      });

      // Creator becomes the project PM.
      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: data.creatorUserId,
          role: "PM",
          discipline: data.creatorDiscipline,
        },
      });

      await tx.workflowStatus.createMany({
        data: data.workflowStatuses.map((s, i) => ({
          projectId: project.id,
          name: s.name,
          category: s.category,
          color: s.color,
          displayOrder: i,
        })),
      });

      await tx.projectAiConfig.create({
        data: {
          projectId: project.id,
          aiMode: data.ai.aiMode,
          provider: data.ai.provider ?? null,
          model: data.ai.model ?? null,
          approvalRule: data.ai.approvalRule,
        },
      });

      if (data.invites.length > 0) {
        await tx.invitation.createMany({
          data: data.invites.map((inv) => ({
            orgId: data.orgId,
            projectId: project.id,
            email: inv.email,
            role: inv.role,
            discipline: inv.discipline,
            invitedBy: data.creatorUserId,
            expiresAt: inviteExpiry,
          })),
        });
      }

      // Transactional outbox — written in the same transaction as the mutation.
      await tx.outboxEvent.create({
        data: {
          eventType: "project_created",
          payload: {
            projectId: project.id,
            key: project.key,
            orgId: data.orgId,
            actorUserId: data.creatorUserId,
            invitedEmails: data.invites.map((i) => i.email),
          },
        },
      });

      return project;
    });
  },
};
