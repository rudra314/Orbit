import { epicRepository } from "@/repositories/epicRepository";
import { projectRepository } from "@/repositories/projectRepository";
import { permissionService } from "@/services/permissionService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import type { Epic, Prisma } from "@prisma/client";

export type EpicDTO = {
  id: string;
  title: string;
  description: string | null;
  status: Epic["status"];
  startDate: string | null;
  targetDate: string | null;
};

export function toEpicDTO(e: Epic): EpicDTO {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    status: e.status,
    startDate: e.startDate ? e.startDate.toISOString() : null,
    targetDate: e.targetDate ? e.targetDate.toISOString() : null,
  };
}

export const epicService = {
  async create(input: {
    actorUserId: string;
    projectKey: string;
    title: string;
    description?: string | null;
    targetDate?: string | null;
  }) {
    const project = await projectRepository.getByKeyForUser(
      input.projectKey,
      input.actorUserId,
    );
    if (!project) throw new NotFoundError("Project not found.");
    await permissionService.assertCanManageEpics(input.actorUserId, project.id);

    const title = input.title?.trim();
    if (!title) throw new ValidationError("Epic name is required.");

    const epic = await epicRepository.create({
      projectId: project.id,
      title,
      description: input.description?.trim() || null,
      targetDate: input.targetDate ? new Date(input.targetDate) : null,
    });
    return toEpicDTO(epic);
  },

  async update(
    id: string,
    patch: Record<string, unknown>,
    actorUserId: string,
  ) {
    const epic = await epicRepository.findProjectId(id);
    if (!epic) throw new NotFoundError("Epic not found.");
    await permissionService.assertCanMutateBoard(actorUserId, epic.projectId);

    const data: Prisma.EpicUpdateInput = {};
    if ("title" in patch) {
      const title = String(patch.title ?? "").trim();
      if (!title) throw new ValidationError("Epic name cannot be empty.");
      data.title = title;
    }
    if ("description" in patch) {
      data.description = patch.description ? String(patch.description) : null;
    }
    if ("startDate" in patch) {
      data.startDate = patch.startDate ? new Date(String(patch.startDate)) : null;
    }
    if ("targetDate" in patch) {
      data.targetDate = patch.targetDate
        ? new Date(String(patch.targetDate))
        : null;
    }
    if (Object.keys(data).length === 0) {
      throw new ValidationError("No editable fields provided.");
    }

    const updated = await epicRepository.update(id, data);
    return toEpicDTO(updated);
  },
};
