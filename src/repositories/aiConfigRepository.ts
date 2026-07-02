import { prisma } from "./prisma";
import type { AiApprovalRule, AiMode, Prisma } from "@prisma/client";

export type AiConfigUpdate = {
  aiMode?: AiMode;
  provider?: string | null;
  model?: string | null;
  approvalRule?: AiApprovalRule;
  enabledFeatures?: Prisma.InputJsonValue;
};

export const aiConfigRepository = {
  get(projectId: string) {
    return prisma.projectAiConfig.findUnique({ where: { projectId } });
  },

  // Upsert so a project without a config row (shouldn't happen post-creation)
  // still gets settings.
  upsert(projectId: string, data: AiConfigUpdate) {
    return prisma.projectAiConfig.upsert({
      where: { projectId },
      create: { projectId, ...data },
      update: data,
    });
  },
};
