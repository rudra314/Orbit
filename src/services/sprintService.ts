import { sprintRepository } from "@/repositories/sprintRepository";
import { projectRepository } from "@/repositories/projectRepository";
import { workItemRepository } from "@/repositories/workItemRepository";
import { workflowRepository } from "@/repositories/workflowRepository";
import { projectMemberRepository } from "@/repositories/projectMemberRepository";
import { permissionService } from "@/services/permissionService";
import { NotFoundError, toBoardItem } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import type { Sprint } from "@prisma/client";

export type SprintDTO = {
  id: string;
  name: string;
  status: Sprint["status"];
  startDate: string | null;
  endDate: string | null;
  goal: string | null;
};

function toSprintDTO(s: Sprint): SprintDTO {
  return {
    id: s.id,
    name: s.name,
    status: s.status,
    startDate: s.startDate ? s.startDate.toISOString() : null,
    endDate: s.endDate ? s.endDate.toISOString() : null,
    goal: s.goal,
  };
}

async function resolveSprint(id: string, userId: string, manage: boolean) {
  const sprint = await sprintRepository.findProjectId(id);
  if (!sprint) throw new NotFoundError("Sprint not found.");
  if (manage) {
    await permissionService.assertCanManageSprints(userId, sprint.projectId);
  } else {
    await permissionService.assertProjectMember(userId, sprint.projectId);
  }
  return sprint;
}

export const sprintService = {
  async getSprintsData(projectKey: string, userId: string) {
    const project = await projectRepository.getByKeyForUser(projectKey, userId);
    if (!project) throw new NotFoundError("Project not found.");

    const [sprints, rawItems, members, columns] = await Promise.all([
      sprintRepository.listForProjectFull(project.id),
      workItemRepository.listForProject(project.id),
      projectMemberRepository.listForProject(project.id),
      workflowRepository.listForProject(project.id),
    ]);

    const member = await projectMemberRepository.find(project.id, userId);

    return {
      project: { id: project.id, key: project.key, name: project.name },
      sprints: sprints.map(toSprintDTO),
      items: rawItems.map(toBoardItem),
      columns: columns.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        color: c.color,
        displayOrder: c.displayOrder,
      })),
      members: members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        discipline: m.discipline,
      })),
      currentUserId: userId,
      canEdit: member
        ? ["PM", "LEAD", "CONTRIBUTOR"].includes(member.role)
        : false,
      canManage: member ? ["PM", "LEAD"].includes(member.role) : false,
    };
  },

  async create(input: {
    actorUserId: string;
    projectKey: string;
    name: string;
    startDate?: string | null;
    endDate?: string | null;
    goal?: string | null;
  }) {
    const project = await projectRepository.getByKeyForUser(
      input.projectKey,
      input.actorUserId,
    );
    if (!project) throw new NotFoundError("Project not found.");
    await permissionService.assertCanManageSprints(input.actorUserId, project.id);

    const name = input.name?.trim();
    if (!name) throw new ValidationError("Sprint name is required.");

    const start = input.startDate ? new Date(input.startDate) : null;
    const end = input.endDate ? new Date(input.endDate) : null;
    if (start && end && end < start) {
      throw new ValidationError("End date must be after the start date.");
    }

    const sprint = await sprintRepository.create({
      projectId: project.id,
      name,
      startDate: start,
      endDate: end,
      goal: input.goal?.trim() || null,
      actorUserId: input.actorUserId,
    });
    return toSprintDTO(sprint);
  },

  async update(id: string, patch: Record<string, unknown>, actorUserId: string) {
    await resolveSprint(id, actorUserId, true);

    const data: Record<string, unknown> = {};
    if ("name" in patch) {
      const name = String(patch.name ?? "").trim();
      if (!name) throw new ValidationError("Sprint name cannot be empty.");
      data.name = name;
    }
    if ("goal" in patch) data.goal = patch.goal ? String(patch.goal) : null;
    if ("startDate" in patch)
      data.startDate = patch.startDate ? new Date(String(patch.startDate)) : null;
    if ("endDate" in patch)
      data.endDate = patch.endDate ? new Date(String(patch.endDate)) : null;
    if (Object.keys(data).length === 0) {
      throw new ValidationError("No editable fields provided.");
    }

    const sprint = await sprintRepository.update({
      id,
      data,
      actorUserId,
    });
    return toSprintDTO(sprint);
  },

  async remove(id: string, actorUserId: string) {
    await resolveSprint(id, actorUserId, true);
    return sprintRepository.remove({ id, actorUserId });
  },

  async start(id: string, actorUserId: string) {
    const sprint = await resolveSprint(id, actorUserId, true);
    if (sprint.status !== "PLANNING") {
      throw new ValidationError("Only a planning sprint can be started.");
    }
    // Only one ACTIVE sprint per project.
    const active = await sprintRepository.getActive(sprint.projectId);
    if (active && active.id !== id) {
      throw new ValidationError(
        `"${active.name}" is already active. Complete it first.`,
      );
    }
    const started = await sprintRepository.start({
      id,
      projectId: sprint.projectId,
      startDate: new Date(),
      actorUserId,
    });
    return toSprintDTO(started);
  },

  async complete(
    id: string,
    input: { carryoverTo: "backlog" | "next"; nextSprintId?: string | null },
    actorUserId: string,
  ) {
    const sprint = await resolveSprint(id, actorUserId, true);
    if (sprint.status !== "ACTIVE") {
      throw new ValidationError("Only an active sprint can be completed.");
    }

    // Determine carryover target.
    let carryoverTo: string | null = null;
    if (input.carryoverTo === "next") {
      if (!input.nextSprintId) {
        throw new ValidationError("Select a sprint to carry items over to.");
      }
      const next = await sprintRepository.findProjectId(input.nextSprintId);
      if (!next || next.projectId !== sprint.projectId) {
        throw new ValidationError("Invalid target sprint.");
      }
      carryoverTo = input.nextSprintId;
    }

    // Incomplete items = items in this sprint whose status is not COMPLETED.
    const [items, columns] = await Promise.all([
      workItemRepository.listForProject(sprint.projectId),
      workflowRepository.listForProject(sprint.projectId),
    ]);
    const completedStatusIds = new Set(
      columns.filter((c) => c.category === "COMPLETED").map((c) => c.id),
    );
    const carryoverIds = items
      .filter((it) => it.sprintId === id && !completedStatusIds.has(it.statusId))
      .map((it) => it.id);

    const completed = await sprintRepository.complete({
      id,
      projectId: sprint.projectId,
      endDate: new Date(),
      carryoverIds,
      carryoverTo,
      actorUserId,
    });
    return { sprint: toSprintDTO(completed), carriedOver: carryoverIds.length };
  },
};
