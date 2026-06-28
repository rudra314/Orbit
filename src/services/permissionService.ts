import { orgRepository } from "@/repositories/orgRepository";
import { projectMemberRepository } from "@/repositories/projectMemberRepository";
import type { ProjectRole } from "@prisma/client";

export class PermissionError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "PermissionError";
  }
}

// Roles allowed to edit/move/create work items. VIEWER and GUEST are read-only.
const EDITOR_ROLES: ProjectRole[] = ["PM", "LEAD", "CONTRIBUTOR"];

// Central permission checks. Every service mutation should route through here.
export const permissionService = {
  // Any member of an org may create a project in it (pilot policy).
  async assertCanCreateProject(userId: string, orgId: string) {
    const count = await orgRepository.countMembership(userId, orgId);
    if (count === 0) {
      throw new PermissionError("You are not a member of this organization.");
    }
  },

  // Read access to a project's board requires membership.
  async assertProjectMember(userId: string, projectId: string) {
    const member = await projectMemberRepository.find(projectId, userId);
    if (!member) {
      throw new PermissionError("You are not a member of this project.");
    }
    return member;
  },

  // Mutating the board (create/move/edit items) requires an editor role.
  async assertCanMutateBoard(userId: string, projectId: string) {
    const member = await projectMemberRepository.find(projectId, userId);
    if (!member || !EDITOR_ROLES.includes(member.role)) {
      throw new PermissionError("You don't have permission to edit this board.");
    }
    return member;
  },

  // Sprint lifecycle (create/start/complete/delete) is PM or LEAD.
  async assertCanManageSprints(userId: string, projectId: string) {
    const member = await projectMemberRepository.find(projectId, userId);
    if (!member || !["PM", "LEAD"].includes(member.role)) {
      throw new PermissionError("Only the PM or Lead can manage sprints.");
    }
    return member;
  },

  // Delete operations are PM-only.
  async assertCanDelete(userId: string, projectId: string) {
    const member = await projectMemberRepository.find(projectId, userId);
    if (!member || member.role !== "PM") {
      throw new PermissionError("Only the project PM can delete items.");
    }
    return member;
  },
};
