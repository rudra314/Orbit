import { deliverableRepository } from "@/repositories/deliverableRepository";
import { projectRepository } from "@/repositories/projectRepository";
import { projectMemberRepository } from "@/repositories/projectMemberRepository";
import { permissionService } from "@/services/permissionService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import type { Deliverable, DeliverableStatus, Prisma } from "@prisma/client";

const STATUSES: DeliverableStatus[] = [
  "PLANNED",
  "IN_PROGRESS",
  "READY_FOR_REVIEW",
  "DELIVERED",
  "ACCEPTED",
  "DEFERRED",
];

function toDto(d: Deliverable) {
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    owner: d.owner,
    status: d.status,
    artifactUrl: d.artifactUrl,
    notes: d.notes,
    dueDate: d.dueDate ? d.dueDate.toISOString() : null,
    deliveredAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
  };
}

export type DeliverableDto = ReturnType<typeof toDto>;

function status(v: unknown): DeliverableStatus {
  const up = String(v ?? "").toUpperCase();
  if (!(STATUSES as string[]).includes(up)) {
    throw new ValidationError("Invalid deliverable status.");
  }
  return up as DeliverableStatus;
}

function cleanStr(v: unknown): string | null {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}

function parseDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new ValidationError("Invalid date.");
  return d;
}

export const deliverableService = {
  // Page data: list + members for the owner picker + permissions.
  async getPageData(projectKey: string, userId: string) {
    const project = await projectRepository.getByKeyForUser(projectKey, userId);
    if (!project) throw new NotFoundError("Project not found.");
    const member = await permissionService.assertProjectMember(userId, project.id);

    const [deliverables, members] = await Promise.all([
      deliverableRepository.listForProject(project.id),
      projectMemberRepository.listForProject(project.id),
    ]);

    return {
      project: { id: project.id, key: project.key, name: project.name },
      deliverables: deliverables.map(toDto),
      members: members.map((m) => ({ userId: m.userId, name: m.user.name })),
      canManage: member.role === "PM",
      canMarkDelivered: ["PM", "LEAD"].includes(member.role),
    };
  },

  // Create a deliverable (PM only).
  async create(input: {
    actorUserId: string;
    projectKey: string;
    name: string;
    owner?: unknown;
    description?: unknown;
    status?: unknown;
    dueDate?: unknown;
    artifactUrl?: unknown;
    notes?: unknown;
  }) {
    const project = await projectRepository.getByKeyForUser(
      input.projectKey,
      input.actorUserId,
    );
    if (!project) throw new NotFoundError("Project not found.");
    await permissionService.assertCanManageDeliverables(input.actorUserId, project.id);

    const name = String(input.name ?? "").trim();
    if (!name) throw new ValidationError("Name is required.");

    const data: Prisma.DeliverableCreateInput = {
      project: { connect: { id: project.id } },
      name,
      owner: cleanStr(input.owner),
      description: cleanStr(input.description),
      status: input.status ? status(input.status) : "PLANNED",
      dueDate: parseDate(input.dueDate),
      artifactUrl: cleanStr(input.artifactUrl),
      notes: cleanStr(input.notes),
    };

    const created = await deliverableRepository.create({
      projectId: project.id,
      actorUserId: input.actorUserId,
      data,
    });
    return toDto(created);
  },

  // Edit a deliverable's fields (PM only).
  async update(id: string, patch: Record<string, unknown>, actorUserId: string) {
    const existing = await deliverableRepository.findProjectId(id);
    if (!existing) throw new NotFoundError("Deliverable not found.");
    await permissionService.assertCanManageDeliverables(actorUserId, existing.projectId);

    const data: Prisma.DeliverableUpdateInput = {};
    if ("name" in patch) {
      const name = String(patch.name ?? "").trim();
      if (!name) throw new ValidationError("Name cannot be empty.");
      data.name = name;
    }
    if ("owner" in patch) data.owner = cleanStr(patch.owner);
    if ("description" in patch) data.description = cleanStr(patch.description);
    if ("artifactUrl" in patch) data.artifactUrl = cleanStr(patch.artifactUrl);
    if ("notes" in patch) data.notes = cleanStr(patch.notes);
    if ("dueDate" in patch) data.dueDate = parseDate(patch.dueDate);
    if ("status" in patch) {
      const next = status(patch.status);
      data.status = next;
      // Keep deliveredAt consistent with the chosen status.
      if (next === "DELIVERED" || next === "ACCEPTED") {
        data.deliveredAt = patch.deliveredAt
          ? parseDate(patch.deliveredAt)
          : new Date();
      } else {
        data.deliveredAt = null;
      }
    }

    if (Object.keys(data).length === 0) {
      throw new ValidationError("No editable fields provided.");
    }

    const updated = await deliverableRepository.update({
      id,
      projectId: existing.projectId,
      actorUserId,
      data,
    });
    return toDto(updated);
  },

  // Quick action: mark as delivered today (PM or LEAD).
  async markDelivered(id: string, actorUserId: string) {
    const existing = await deliverableRepository.findProjectId(id);
    if (!existing) throw new NotFoundError("Deliverable not found.");
    await permissionService.assertCanMarkDelivered(actorUserId, existing.projectId);

    const updated = await deliverableRepository.update({
      id,
      projectId: existing.projectId,
      actorUserId,
      data: { status: "DELIVERED", deliveredAt: new Date() },
      eventType: "deliverable_delivered",
    });
    return toDto(updated);
  },

  // Delete a deliverable (PM only).
  async remove(id: string, actorUserId: string) {
    const existing = await deliverableRepository.findProjectId(id);
    if (!existing) throw new NotFoundError("Deliverable not found.");
    await permissionService.assertCanManageDeliverables(actorUserId, existing.projectId);
    return deliverableRepository.remove({
      id,
      projectId: existing.projectId,
      actorUserId,
    });
  },
};
