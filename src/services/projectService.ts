import {
  projectRepository,
  type CreateProjectData,
} from "@/repositories/projectRepository";
import { orgRepository } from "@/repositories/orgRepository";
import { workflowRepository } from "@/repositories/workflowRepository";
import { permissionService } from "@/services/permissionService";
import {
  DEFAULT_WORKFLOW_STATUSES,
  type WorkflowStatusInput,
} from "@/lib/workflowDefaults";
import type {
  AiApprovalRule,
  AiMode,
  Discipline,
  ProjectRole,
  ProjectType,
} from "@prisma/client";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export type CreateProjectInput = {
  actorUserId: string;
  name: string;
  key: string;
  type: ProjectType;
  description?: string | null;
  accentColor: string;
  startDate?: string | null;
  targetDate?: string | null;
  creatorDiscipline?: Discipline;
  workflowStatuses?: WorkflowStatusInput[];
  ai: {
    aiMode: AiMode;
    provider?: string | null;
    model?: string | null;
    approvalRule: AiApprovalRule;
  };
  invites?: { email: string; role: ProjectRole; discipline: Discipline }[];
};

const KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;

export const projectService = {
  listForUser(userId: string) {
    return projectRepository.listForUser(userId);
  },

  getByKey(key: string, userId: string) {
    return projectRepository.getByKeyForUser(key, userId);
  },

  listColumns(projectId: string) {
    return workflowRepository.listForProject(projectId);
  },

  async createProject(input: CreateProjectInput) {
    const membership = await orgRepository.primaryForUser(input.actorUserId);
    if (!membership) {
      throw new ValidationError("You do not belong to any organization.");
    }
    const orgId = membership.orgId;

    await permissionService.assertCanCreateProject(input.actorUserId, orgId);

    const name = input.name?.trim();
    if (!name) throw new ValidationError("Project name is required.");

    const key = input.key?.trim().toUpperCase();
    if (!key || !KEY_PATTERN.test(key)) {
      throw new ValidationError(
        "Project key must be 2–10 characters, start with a letter, and contain only A–Z and 0–9.",
      );
    }

    const taken = await projectRepository.existsByKeyInOrg(orgId, key);
    if (taken) {
      throw new ValidationError(`Project key "${key}" is already in use.`);
    }

    // Use provided (renamed) columns, otherwise the defaults. Never empty.
    const workflowStatuses =
      input.workflowStatuses && input.workflowStatuses.length > 0
        ? input.workflowStatuses
        : DEFAULT_WORKFLOW_STATUSES;

    // Don't invite the creator; de-dupe by email.
    const seen = new Set<string>();
    const invites = (input.invites ?? [])
      .map((i) => ({ ...i, email: i.email.trim().toLowerCase() }))
      .filter((i) => {
        if (!i.email || seen.has(i.email)) return false;
        seen.add(i.email);
        return true;
      });

    const data: CreateProjectData = {
      orgId,
      creatorUserId: input.actorUserId,
      creatorDiscipline: input.creatorDiscipline ?? "DELIVERY",
      name,
      key,
      type: input.type,
      description: input.description?.trim() || null,
      accentColor: input.accentColor,
      startDate: input.startDate ? new Date(input.startDate) : null,
      targetDate: input.targetDate ? new Date(input.targetDate) : null,
      workflowStatuses,
      ai: input.ai,
      invites,
    };

    return projectRepository.createWithRelations(data);
  },
};
