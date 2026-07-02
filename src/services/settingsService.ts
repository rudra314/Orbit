import { projectRepository } from "@/repositories/projectRepository";
import { aiConfigRepository } from "@/repositories/aiConfigRepository";
import { auditRepository } from "@/repositories/auditRepository";
import { permissionService } from "@/services/permissionService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import type {
  AiApprovalRule,
  AiMode,
  EstimationMode,
  ProjectType,
} from "@prisma/client";

const PROJECT_TYPES: ProjectType[] = ["INTERNAL", "FIXED_BID"];
const ESTIMATION_MODES: EstimationMode[] = ["STORY_POINTS", "HOURS", "BOTH", "NONE"];
const AI_MODES: AiMode[] = [
  "DISABLED",
  "LOCAL_MODEL",
  "CLOUD_API",
  "OPENAI_COMPATIBLE",
];
const APPROVAL_RULES: AiApprovalRule[] = [
  "PM_APPROVAL",
  "PM_OR_LEAD_APPROVAL",
  "ANY_REVIEWER",
];
const AI_FEATURES = ["backlog_gen", "test_case_gen", "report_draft"];

export type GeneralSettingsDto = {
  id: string;
  name: string;
  key: string;
  description: string | null;
  type: ProjectType;
  accentColor: string;
  estimationMode: EstimationMode;
  startDate: string | null;
  targetDate: string | null;
  status: string;
};

export type AiSettingsDto = {
  aiMode: AiMode;
  provider: string | null;
  model: string | null;
  approvalRule: AiApprovalRule;
  enabledFeatures: string[];
};

export const settingsService = {
  // General + AI settings for a project, plus the caller's role (PM gates the
  // forms). Any member may read; the page hides controls for non-PMs.
  async getSettings(projectKey: string, actorUserId: string) {
    const project = await projectRepository.getByKeyForUser(projectKey, actorUserId);
    if (!project) throw new NotFoundError("Project not found.");
    const member = await permissionService.assertProjectMember(
      actorUserId,
      project.id,
    );
    const ai = await aiConfigRepository.get(project.id);

    const general: GeneralSettingsDto = {
      id: project.id,
      name: project.name,
      key: project.key,
      description: project.description,
      type: project.type,
      accentColor: project.accentColor,
      estimationMode: project.estimationMode,
      startDate: project.startDate ? project.startDate.toISOString() : null,
      targetDate: project.targetDate ? project.targetDate.toISOString() : null,
      status: project.status,
    };

    const aiDto: AiSettingsDto = {
      aiMode: ai?.aiMode ?? "DISABLED",
      provider: ai?.provider ?? null,
      model: ai?.model ?? null,
      approvalRule: ai?.approvalRule ?? "PM_APPROVAL",
      enabledFeatures: Array.isArray(ai?.enabledFeatures)
        ? (ai.enabledFeatures as string[])
        : [],
    };

    return { viewerRole: member.role, general, ai: aiDto };
  },

  // PM-only. Updates general project fields and writes an audit row.
  async updateGeneral(
    actorUserId: string,
    projectId: string,
    input: {
      name?: string;
      description?: string | null;
      type?: ProjectType;
      accentColor?: string;
      estimationMode?: EstimationMode;
      startDate?: string | null;
      targetDate?: string | null;
    },
  ) {
    await permissionService.assertCanDelete(actorUserId, projectId); // PM only
    const meta = await projectRepository.meta(projectId);
    if (!meta) throw new NotFoundError("Project not found.");

    const data: Parameters<typeof projectRepository.update>[1] = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new ValidationError("Project name is required.");
      data.name = name;
    }
    if (input.description !== undefined) {
      data.description = input.description?.trim() || null;
    }
    if (input.type !== undefined) {
      if (!PROJECT_TYPES.includes(input.type)) {
        throw new ValidationError("Invalid project type.");
      }
      data.type = input.type;
    }
    if (input.accentColor !== undefined) data.accentColor = input.accentColor;
    if (input.estimationMode !== undefined) {
      if (!ESTIMATION_MODES.includes(input.estimationMode)) {
        throw new ValidationError("Invalid estimation mode.");
      }
      data.estimationMode = input.estimationMode;
    }
    if (input.startDate !== undefined) {
      data.startDate = input.startDate ? new Date(input.startDate) : null;
    }
    if (input.targetDate !== undefined) {
      data.targetDate = input.targetDate ? new Date(input.targetDate) : null;
    }

    const updated = await projectRepository.update(projectId, data);
    await auditRepository.write({
      orgId: meta.orgId,
      userId: actorUserId,
      entityType: "Project",
      entityId: projectId,
      action: "updated",
      newValue: JSON.parse(JSON.stringify(data)),
    });
    return updated;
  },

  // PM-only. Updates the per-project AI configuration.
  async updateAi(
    actorUserId: string,
    projectId: string,
    input: {
      aiMode?: AiMode;
      provider?: string | null;
      model?: string | null;
      approvalRule?: AiApprovalRule;
      enabledFeatures?: string[];
    },
  ): Promise<AiSettingsDto> {
    await permissionService.assertCanDelete(actorUserId, projectId); // PM only
    const meta = await projectRepository.meta(projectId);
    if (!meta) throw new NotFoundError("Project not found.");

    const data: Parameters<typeof aiConfigRepository.upsert>[1] = {};
    if (input.aiMode !== undefined) {
      if (!AI_MODES.includes(input.aiMode)) {
        throw new ValidationError("Invalid AI mode.");
      }
      data.aiMode = input.aiMode;
    }
    if (input.provider !== undefined) data.provider = input.provider?.trim() || null;
    if (input.model !== undefined) data.model = input.model?.trim() || null;
    if (input.approvalRule !== undefined) {
      if (!APPROVAL_RULES.includes(input.approvalRule)) {
        throw new ValidationError("Invalid approval rule.");
      }
      data.approvalRule = input.approvalRule;
    }
    if (input.enabledFeatures !== undefined) {
      data.enabledFeatures = input.enabledFeatures.filter((f) =>
        AI_FEATURES.includes(f),
      );
    }

    const config = await aiConfigRepository.upsert(projectId, data);
    await auditRepository.write({
      orgId: meta.orgId,
      userId: actorUserId,
      entityType: "ProjectAiConfig",
      entityId: config.id,
      action: "updated",
      newValue: JSON.parse(JSON.stringify(data)),
    });
    return {
      aiMode: config.aiMode,
      provider: config.provider,
      model: config.model,
      approvalRule: config.approvalRule,
      enabledFeatures: Array.isArray(config.enabledFeatures)
        ? (config.enabledFeatures as string[])
        : [],
    };
  },

  // PM-only. Archives the project (soft) — keeps data, hides from active lists.
  async archiveProject(actorUserId: string, projectId: string) {
    await permissionService.assertCanDelete(actorUserId, projectId);
    const meta = await projectRepository.meta(projectId);
    if (!meta) throw new NotFoundError("Project not found.");
    await projectRepository.update(projectId, { status: "ARCHIVED" });
    await auditRepository.write({
      orgId: meta.orgId,
      userId: actorUserId,
      entityType: "Project",
      entityId: projectId,
      action: "updated",
      newValue: { status: "ARCHIVED" },
    });
    return { id: projectId, status: "ARCHIVED" };
  },

  // PM-only. Hard-deletes the project (cascades members/work items/etc.). The
  // audit row is written against the org, which outlives the project.
  async deleteProject(actorUserId: string, projectId: string) {
    await permissionService.assertCanDelete(actorUserId, projectId);
    const meta = await projectRepository.meta(projectId);
    if (!meta) throw new NotFoundError("Project not found.");
    await auditRepository.write({
      orgId: meta.orgId,
      userId: actorUserId,
      entityType: "Project",
      entityId: projectId,
      action: "deleted",
      oldValue: { name: meta.name, key: meta.key },
    });
    await projectRepository.remove(projectId);
    return { id: projectId };
  },
};
