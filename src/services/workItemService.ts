import { projectRepository } from "@/repositories/projectRepository";
import { workflowRepository } from "@/repositories/workflowRepository";
import { workItemRepository } from "@/repositories/workItemRepository";
import { projectMemberRepository } from "@/repositories/projectMemberRepository";
import { epicRepository } from "@/repositories/epicRepository";
import { featureRepository } from "@/repositories/featureRepository";
import { sprintRepository } from "@/repositories/sprintRepository";
import { permissionService } from "@/services/permissionService";
import { NotFoundError, toBoardItem } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import type { Prisma, Priority, WorkItemType } from "@prisma/client";

// Verifies an epic belongs to the project; returns nothing or throws.
async function assertEpicInProject(epicId: string, projectId: string) {
  const epic = await epicRepository.findProjectId(epicId);
  if (!epic || epic.projectId !== projectId) {
    throw new ValidationError("Epic does not belong to this project.");
  }
}

// Verifies a feature belongs to the project; returns its epicId.
async function featureEpicInProject(featureId: string, projectId: string) {
  const feature = await featureRepository.findWithProject(featureId);
  if (!feature || feature.projectId !== projectId) {
    throw new ValidationError("Feature does not belong to this project.");
  }
  return feature.epicId;
}

// Verifies a sprint belongs to the project; returns nothing or throws.
export async function assertSprintInProject(sprintId: string, projectId: string) {
  const sprint = await sprintRepository.findProjectId(sprintId);
  if (!sprint || sprint.projectId !== projectId) {
    throw new ValidationError("Sprint does not belong to this project.");
  }
}

const WORK_ITEM_TYPES: WorkItemType[] = ["STORY", "BUG", "TASK", "SPIKE"];

// Fields the detail panel may edit, with how to coerce each.
const STRING_FIELDS = [
  "title",
  "description",
  "acceptanceCriteria",
  "edgeCases",
  "businessValue",
  "blockerReason",
  "stepsToReproduce",
  "expectedResult",
  "actualResult",
  "environment",
  "buildVersion",
  "researchQuestion",
  "timeBox",
  "outcomeSummary",
  "taskCategory",
] as const;

const ENUM_FIELDS = ["priority", "severity", "discipline", "verificationStatus"] as const;

export const workItemService = {
  async create(input: {
    actorUserId: string;
    projectKey: string;
    statusId?: string;
    type: WorkItemType;
    title: string;
    assigneeId?: string | null;
    epicId?: string | null;
    featureId?: string | null;
    foundInStoryId?: string | null;
  }) {
    const project = await projectRepository.getByKeyForUser(
      input.projectKey,
      input.actorUserId,
    );
    if (!project) throw new NotFoundError("Project not found.");
    await permissionService.assertCanMutateBoard(input.actorUserId, project.id);

    const title = input.title?.trim();
    if (!title) throw new ValidationError("Title is required.");
    if (!WORK_ITEM_TYPES.includes(input.type)) {
      throw new ValidationError("Invalid work item type.");
    }

    // "Found while testing" is only meaningful for bugs; the source must be a
    // work item in this project.
    let foundInStoryId: string | null = null;
    if (input.foundInStoryId) {
      if (input.type !== "BUG") {
        throw new ValidationError("Only bugs can record a source story.");
      }
      const story = await workItemRepository.findProjectIdById(input.foundInStoryId);
      if (!story || story.projectId !== project.id) {
        throw new ValidationError("The source story is not in this project.");
      }
      foundInStoryId = input.foundInStoryId;
    }

    const columns = await workflowRepository.listForProject(project.id);
    if (columns.length === 0) {
      throw new ValidationError("Project has no workflow statuses.");
    }
    // Backlog creates may omit a status — default to the first column.
    const statusId =
      input.statusId ??
      [...columns].sort((a, b) => a.displayOrder - b.displayOrder)[0].id;
    if (!columns.some((c) => c.id === statusId)) {
      throw new ValidationError("Invalid status.");
    }

    let assigneeId: string | null = null;
    if (input.assigneeId) {
      const member = await projectMemberRepository.find(project.id, input.assigneeId);
      if (!member) throw new ValidationError("Assignee is not a project member.");
      assigneeId = input.assigneeId;
    }

    // Resolve epic/feature. A feature implies (and overrides) its epic.
    let epicId = input.epicId ?? null;
    let featureId = input.featureId ?? null;
    if (featureId) {
      epicId = await featureEpicInProject(featureId, project.id);
    } else if (epicId) {
      await assertEpicInProject(epicId, project.id);
    }

    const item = await workItemRepository.createWithKey({
      projectId: project.id,
      actorUserId: input.actorUserId,
      statusId,
      type: input.type,
      title,
      priority: "MEDIUM" as Priority,
      assigneeId,
      reporterId: input.actorUserId,
      epicId,
      featureId,
      foundInStoryId,
    });
    return toBoardItem(item);
  },

  async update(
    itemId: string,
    patch: Record<string, unknown>,
    actorUserId: string,
  ) {
    const existing = await workItemRepository.findProjectIdById(itemId);
    if (!existing) throw new NotFoundError("Work item not found.");
    await permissionService.assertCanMutateBoard(actorUserId, existing.projectId);

    const data: Prisma.WorkItemUpdateInput = {};

    for (const field of STRING_FIELDS) {
      if (field in patch) {
        const raw = patch[field];
        if (field === "title") {
          const title = String(raw ?? "").trim();
          if (!title) throw new ValidationError("Title cannot be empty.");
          data.title = title;
        } else {
          (data as Record<string, unknown>)[field] =
            raw == null || raw === "" ? null : String(raw);
        }
      }
    }

    for (const field of ENUM_FIELDS) {
      if (field in patch) {
        const raw = patch[field];
        // priority is required (non-null); others may be cleared.
        if (field === "priority") {
          if (!raw) throw new ValidationError("Priority is required.");
          data.priority = raw as Priority;
        } else {
          (data as Record<string, unknown>)[field] = raw ? raw : null;
        }
      }
    }

    if ("storyPoints" in patch) {
      const v = patch.storyPoints;
      data.storyPoints = v == null || v === "" ? null : Number(v);
    }
    if ("estimatedHours" in patch) {
      const v = patch.estimatedHours;
      data.estimatedHours = v == null || v === "" ? null : Number(v);
    }
    if ("isBlocked" in patch) {
      data.isBlocked = Boolean(patch.isBlocked);
    }
    if ("dueDate" in patch) {
      const v = patch.dueDate;
      data.dueDate = v ? new Date(String(v)) : null;
    }

    if ("assigneeId" in patch) {
      const assigneeId = patch.assigneeId as string | null;
      if (assigneeId) {
        const member = await projectMemberRepository.find(
          existing.projectId,
          assigneeId,
        );
        if (!member) throw new ValidationError("Assignee is not a project member.");
        data.assignee = { connect: { id: assigneeId } };
      } else {
        data.assignee = { disconnect: true };
      }
    }

    if ("sprintId" in patch) {
      const sprintId = patch.sprintId as string | null;
      if (sprintId) {
        await assertSprintInProject(sprintId, existing.projectId);
        data.sprint = { connect: { id: sprintId } };
      } else {
        data.sprint = { disconnect: true };
      }
    }

    if ("epicId" in patch) {
      const epicId = patch.epicId as string | null;
      if (epicId) {
        await assertEpicInProject(epicId, existing.projectId);
        data.epic = { connect: { id: epicId } };
      } else {
        data.epic = { disconnect: true };
      }
    }

    if ("featureId" in patch) {
      const featureId = patch.featureId as string | null;
      if (featureId) {
        const epicId = await featureEpicInProject(featureId, existing.projectId);
        data.feature = { connect: { id: featureId } };
        data.epic = { connect: { id: epicId } }; // keep epic consistent
      } else {
        data.feature = { disconnect: true };
      }
    }

    if (Object.keys(data).length === 0) {
      throw new ValidationError("No editable fields provided.");
    }

    const item = await workItemRepository.updateFields({
      id: itemId,
      actorUserId,
      data,
    });
    return toBoardItem(item);
  },

  // Delete a single item (PM only).
  async remove(itemId: string, actorUserId: string) {
    const existing = await workItemRepository.findProjectIdById(itemId);
    if (!existing) throw new NotFoundError("Work item not found.");
    await permissionService.assertCanDelete(actorUserId, existing.projectId);
    return workItemRepository.remove({ id: itemId, actorUserId });
  },

  // Bulk action over a set of items in one project.
  async bulkUpdate(input: {
    actorUserId: string;
    projectKey: string;
    ids: string[];
    action: "sprint" | "priority" | "assignee" | "delete";
    value?: string | null;
  }) {
    const project = await projectRepository.getByKeyForUser(
      input.projectKey,
      input.actorUserId,
    );
    if (!project) throw new NotFoundError("Project not found.");

    const ids = [...new Set(input.ids)].filter(Boolean);
    if (ids.length === 0) throw new ValidationError("No items selected.");

    if (input.action === "delete") {
      await permissionService.assertCanDelete(input.actorUserId, project.id);
      return workItemRepository.bulkDelete({
        projectId: project.id,
        ids,
        actorUserId: input.actorUserId,
      });
    }

    await permissionService.assertCanMutateBoard(input.actorUserId, project.id);
    const data: Prisma.WorkItemUncheckedUpdateManyInput = {};

    if (input.action === "sprint") {
      if (input.value) {
        const sprints = await sprintRepository.listForProject(project.id);
        if (!sprints.some((s) => s.id === input.value)) {
          throw new ValidationError("Sprint does not belong to this project.");
        }
      }
      data.sprintId = input.value ?? null;
    } else if (input.action === "priority") {
      if (!input.value) throw new ValidationError("Priority is required.");
      data.priority = input.value as Priority;
    } else if (input.action === "assignee") {
      if (input.value) {
        const member = await projectMemberRepository.find(project.id, input.value);
        if (!member) throw new ValidationError("Assignee is not a project member.");
      }
      data.assigneeId = input.value ?? null;
    }

    return workItemRepository.bulkUpdate({
      projectId: project.id,
      ids,
      data,
      actorUserId: input.actorUserId,
    });
  },
};
