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

// Role hierarchy (higher number = more authority). Used by assertProjectRole.
const ROLE_RANK: Record<ProjectRole, number> = {
  PM: 4,
  LEAD: 3,
  CONTRIBUTOR: 2,
  VIEWER: 1,
  GUEST: 0,
};

// Central permission checks. Every service mutation should route through here.
export const permissionService = {
  // Generic floor check: throws 403 unless the user's role in the project is at
  // least `minimumRole`. The catch-all guard for any mutation — call it at the
  // top of a service method when no more specific assertion fits.
  async assertProjectRole(
    userId: string,
    projectId: string,
    minimumRole: ProjectRole,
  ) {
    const member = await projectMemberRepository.find(projectId, userId);
    if (!member || ROLE_RANK[member.role] < ROLE_RANK[minimumRole]) {
      throw new PermissionError(
        `This action requires the ${minimumRole} role or higher.`,
      );
    }
    return member;
  },

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

  // Creating an epic is PM or LEAD (feature/story creation stays open to
  // contributors via assertCanMutateBoard).
  async assertCanManageEpics(userId: string, projectId: string) {
    const member = await projectMemberRepository.find(projectId, userId);
    if (!member || !["PM", "LEAD"].includes(member.role)) {
      throw new PermissionError("Only the PM or Lead can create epics.");
    }
    return member;
  },

  // AI generation and approval (generate/approve/reject) is PM or LEAD.
  async assertCanUseAi(userId: string, projectId: string) {
    const member = await projectMemberRepository.find(projectId, userId);
    if (!member || !["PM", "LEAD"].includes(member.role)) {
      throw new PermissionError(
        "Only the PM or Lead can generate and approve AI output.",
      );
    }
    return member;
  },

  // Removing a work item link is PM or LEAD (contributors may only create).
  async assertCanManageLinks(userId: string, projectId: string) {
    const member = await projectMemberRepository.find(projectId, userId);
    if (!member || !["PM", "LEAD"].includes(member.role)) {
      throw new PermissionError("Only the PM or Lead can remove links.");
    }
    return member;
  },

  // Approving/rejecting/deprecating a test case is PM, LEAD, or the QE discipline.
  async assertCanReviewTestCase(userId: string, projectId: string) {
    const member = await projectMemberRepository.find(projectId, userId);
    const allowed =
      member &&
      (["PM", "LEAD"].includes(member.role) || member.discipline === "QE");
    if (!allowed) {
      throw new PermissionError(
        "Only the PM, Lead, or a QE can review test cases.",
      );
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

  // Importing a backlog from Excel/CSV is PM or LEAD only.
  async assertCanImport(userId: string, projectId: string) {
    const member = await projectMemberRepository.find(projectId, userId);
    if (!member || !["PM", "LEAD"].includes(member.role)) {
      throw new PermissionError("Only the PM or Lead can import items.");
    }
    return member;
  },

  // Creating/editing/deleting deliverables is PM only.
  async assertCanManageDeliverables(userId: string, projectId: string) {
    const member = await projectMemberRepository.find(projectId, userId);
    if (!member || member.role !== "PM") {
      throw new PermissionError("Only the project PM can manage deliverables.");
    }
    return member;
  },

  // Marking a deliverable as delivered is PM or LEAD.
  async assertCanMarkDelivered(userId: string, projectId: string) {
    const member = await projectMemberRepository.find(projectId, userId);
    if (!member || !["PM", "LEAD"].includes(member.role)) {
      throw new PermissionError(
        "Only the PM or Lead can mark deliverables as delivered.",
      );
    }
    return member;
  },

  // Generating, editing, approving, and archiving weekly reports is PM or LEAD.
  async assertCanManageReports(userId: string, projectId: string) {
    const member = await projectMemberRepository.find(projectId, userId);
    if (!member || !["PM", "LEAD"].includes(member.role)) {
      throw new PermissionError(
        "Only the PM or Lead can generate and approve reports.",
      );
    }
    return member;
  },

  // Submitting a daily pulse is CONTRIBUTOR and above. VIEWER/GUEST are read-only.
  async assertCanSubmitPulse(userId: string, projectId: string) {
    const member = await projectMemberRepository.find(projectId, userId);
    if (!member || !EDITOR_ROLES.includes(member.role)) {
      throw new PermissionError("Only contributors and above can submit a pulse.");
    }
    return member;
  },

  // Replying to a flagged blocker is PM or LEAD.
  async assertCanRespondToPulseBlocker(userId: string, projectId: string) {
    const member = await projectMemberRepository.find(projectId, userId);
    if (!member || !["PM", "LEAD"].includes(member.role)) {
      throw new PermissionError("Only the PM or Lead can respond to blockers.");
    }
    return member;
  },

  // Regenerating the AI digest summary and sending reminders is PM only.
  async assertCanManagePulseDigest(userId: string, projectId: string) {
    const member = await projectMemberRepository.find(projectId, userId);
    if (!member || member.role !== "PM") {
      throw new PermissionError(
        "Only the project PM can regenerate the summary or send reminders.",
      );
    }
    return member;
  },

  // Exporting the digest for a sprint call is PM or LEAD.
  async assertCanExportPulseDigest(userId: string, projectId: string) {
    const member = await projectMemberRepository.find(projectId, userId);
    if (!member || !["PM", "LEAD"].includes(member.role)) {
      throw new PermissionError("Only the PM or Lead can export the digest.");
    }
    return member;
  },
};
