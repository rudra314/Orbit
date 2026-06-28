import { featureRepository } from "@/repositories/featureRepository";
import { epicRepository } from "@/repositories/epicRepository";
import { permissionService } from "@/services/permissionService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import type { Feature, Prisma } from "@prisma/client";

export type FeatureDTO = {
  id: string;
  epicId: string;
  title: string;
  status: Feature["status"];
};

export function toFeatureDTO(f: Feature): FeatureDTO {
  return { id: f.id, epicId: f.epicId, title: f.title, status: f.status };
}

export const featureService = {
  async create(input: { actorUserId: string; epicId: string; title: string }) {
    const epic = await epicRepository.findProjectId(input.epicId);
    if (!epic) throw new NotFoundError("Epic not found.");
    await permissionService.assertCanMutateBoard(input.actorUserId, epic.projectId);

    const title = input.title?.trim();
    if (!title) throw new ValidationError("Feature name is required.");

    const feature = await featureRepository.create({
      projectId: epic.projectId,
      epicId: input.epicId,
      title,
    });
    return toFeatureDTO(feature);
  },

  async update(
    id: string,
    patch: Record<string, unknown>,
    actorUserId: string,
  ) {
    const feature = await featureRepository.findWithProject(id);
    if (!feature) throw new NotFoundError("Feature not found.");
    await permissionService.assertCanMutateBoard(actorUserId, feature.projectId);

    const data: Prisma.FeatureUpdateInput = {};
    if ("title" in patch) {
      const title = String(patch.title ?? "").trim();
      if (!title) throw new ValidationError("Feature name cannot be empty.");
      data.title = title;
    }
    if ("description" in patch) {
      data.description = patch.description ? String(patch.description) : null;
    }
    if (Object.keys(data).length === 0) {
      throw new ValidationError("No editable fields provided.");
    }

    const updated = await featureRepository.update(id, data);
    return toFeatureDTO(updated);
  },
};
