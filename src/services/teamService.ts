import { projectMemberRepository } from "@/repositories/projectMemberRepository";
import { invitationRepository } from "@/repositories/invitationRepository";
import { projectRepository } from "@/repositories/projectRepository";
import { orgRepository } from "@/repositories/orgRepository";
import { userRepository } from "@/repositories/userRepository";
import { auditRepository } from "@/repositories/auditRepository";
import { permissionService, PermissionError } from "@/services/permissionService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import { sendInviteEmail } from "@/lib/supabase/admin";
import type { Discipline, ProjectRole } from "@prisma/client";

const ROLES: ProjectRole[] = ["PM", "LEAD", "CONTRIBUTOR", "VIEWER"];
const DISCIPLINES: Discipline[] = [
  "PRODUCT",
  "UX",
  "DEVELOPMENT",
  "QE",
  "DEVOPS",
  "ARCHITECTURE",
  "DELIVERY",
  "OTHER",
];
const LEAD_ASSIGNABLE: ProjectRole[] = ["CONTRIBUTOR", "VIEWER"];
const INVITE_TTL_DAYS = 7;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type TeamMemberDto = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: ProjectRole;
  discipline: Discipline;
  joinedAt: string;
};

export type PendingInviteDto = {
  id: string;
  email: string;
  role: ProjectRole;
  discipline: Discipline | null;
  invitedByName: string;
  createdAt: string;
  expiresAt: string;
};

export type TeamData = {
  viewerRole: ProjectRole;
  members: TeamMemberDto[];
  invitations: PendingInviteDto[];
};

function expiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + INVITE_TTL_DAYS);
  return d;
}

export const teamService = {
  // Members + pending invitations + the caller's own role (drives UI gating).
  async getTeam(projectId: string, actorUserId: string): Promise<TeamData> {
    const viewer = await permissionService.assertProjectMember(actorUserId, projectId);

    const [members, invites] = await Promise.all([
      projectMemberRepository.listForTeam(projectId),
      invitationRepository.listPending(projectId),
    ]);

    // Resolve inviter names from the member list (fallback to "—").
    const nameById = new Map(members.map((m) => [m.userId, m.user.name]));

    return {
      viewerRole: viewer.role,
      members: members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        discipline: m.discipline,
        joinedAt: m.joinedAt.toISOString(),
      })),
      invitations: invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        discipline: i.discipline,
        invitedByName: nameById.get(i.invitedBy) ?? "—",
        createdAt: i.createdAt.toISOString(),
        expiresAt: i.expiresAt.toISOString(),
      })),
    };
  },

  // PM may change any role; LEAD may only set CONTRIBUTOR/VIEWER targets to
  // CONTRIBUTOR/VIEWER. The last PM cannot be demoted.
  async changeRole(
    actorUserId: string,
    projectId: string,
    memberUserId: string,
    newRole: ProjectRole,
  ) {
    if (!ROLES.includes(newRole)) throw new ValidationError("Invalid role.");

    const actor = await permissionService.assertProjectMember(actorUserId, projectId);
    const target = await projectMemberRepository.find(projectId, memberUserId);
    if (!target) throw new NotFoundError("Member not found.");

    if (actor.role === "PM") {
      // allowed
    } else if (actor.role === "LEAD") {
      if (
        !LEAD_ASSIGNABLE.includes(target.role) ||
        !LEAD_ASSIGNABLE.includes(newRole)
      ) {
        throw new PermissionError(
          "Leads can only reassign Contributor and Viewer roles.",
        );
      }
    } else {
      throw new PermissionError("Only the PM or Lead can change roles.");
    }

    if (target.role === newRole) return { userId: memberUserId, role: newRole };

    // Never leave a project without a PM.
    if (target.role === "PM" && newRole !== "PM") {
      const pmCount = await projectMemberRepository.countByRole(projectId, "PM");
      if (pmCount <= 1) {
        throw new ValidationError("A project must keep at least one PM.");
      }
    }

    await projectMemberRepository.updateRole(projectId, memberUserId, newRole);

    const meta = await projectRepository.meta(projectId);
    if (meta) {
      await auditRepository.write({
        orgId: meta.orgId,
        userId: actorUserId,
        entityType: "ProjectMember",
        entityId: target.id,
        action: "role_changed",
        oldValue: { role: target.role },
        newValue: { role: newRole },
      });
    }
    return { userId: memberUserId, role: newRole };
  },

  // A member may change their own discipline; the PM may change anyone's.
  async changeDiscipline(
    actorUserId: string,
    projectId: string,
    memberUserId: string,
    newDiscipline: Discipline,
  ) {
    if (!DISCIPLINES.includes(newDiscipline)) {
      throw new ValidationError("Invalid discipline.");
    }
    const actor = await permissionService.assertProjectMember(actorUserId, projectId);
    if (actorUserId !== memberUserId && actor.role !== "PM") {
      throw new PermissionError("You can only change your own discipline.");
    }
    const target = await projectMemberRepository.find(projectId, memberUserId);
    if (!target) throw new NotFoundError("Member not found.");

    await projectMemberRepository.updateDiscipline(
      projectId,
      memberUserId,
      newDiscipline,
    );
    return { userId: memberUserId, discipline: newDiscipline };
  },

  // PM-only. Cannot remove the last PM.
  async removeMember(actorUserId: string, projectId: string, memberUserId: string) {
    await permissionService.assertCanDelete(actorUserId, projectId);
    const target = await projectMemberRepository.find(projectId, memberUserId);
    if (!target) throw new NotFoundError("Member not found.");

    if (target.role === "PM") {
      const pmCount = await projectMemberRepository.countByRole(projectId, "PM");
      if (pmCount <= 1) {
        throw new ValidationError("A project must keep at least one PM.");
      }
    }

    await projectMemberRepository.remove(projectId, memberUserId);

    const meta = await projectRepository.meta(projectId);
    if (meta) {
      await auditRepository.write({
        orgId: meta.orgId,
        userId: actorUserId,
        entityType: "ProjectMember",
        entityId: target.id,
        action: "permission_changed",
        oldValue: { role: target.role },
        newValue: { removed: true },
      });
    }
    return { userId: memberUserId };
  },

  // PM-only. Creates the Invitation row and best-effort sends the magic-link.
  async invite(
    actorUserId: string,
    projectId: string,
    input: {
      email: string;
      role: ProjectRole;
      discipline: Discipline;
      message?: string | null;
      origin: string;
    },
  ): Promise<PendingInviteDto> {
    await permissionService.assertCanDelete(actorUserId, projectId); // PM only

    const email = input.email?.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      throw new ValidationError("A valid email address is required.");
    }
    if (!ROLES.includes(input.role)) throw new ValidationError("Invalid role.");
    if (!DISCIPLINES.includes(input.discipline)) {
      throw new ValidationError("Invalid discipline.");
    }

    const meta = await projectRepository.meta(projectId);
    if (!meta) throw new NotFoundError("Project not found.");

    // Already a member?
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      const member = await projectMemberRepository.find(projectId, existing.id);
      if (member) {
        throw new ValidationError("That person is already on the team.");
      }
    }

    const created = await invitationRepository.create({
      orgId: meta.orgId,
      projectId,
      email,
      role: input.role,
      discipline: input.discipline,
      message: input.message?.trim() || null,
      invitedBy: actorUserId,
      expiresAt: expiry(),
    });

    await auditRepository.write({
      orgId: meta.orgId,
      userId: actorUserId,
      entityType: "Invitation",
      entityId: created.id,
      action: "created",
      newValue: { email, role: input.role },
    });

    await sendInviteEmail(email, `${input.origin}/auth/callback?next=/${meta.key}/board`);

    const inviter = await userRepository.findById(actorUserId);
    return {
      id: created.id,
      email: created.email,
      role: created.role,
      discipline: created.discipline,
      invitedByName: inviter?.name ?? "—",
      createdAt: created.createdAt.toISOString(),
      expiresAt: created.expiresAt.toISOString(),
    };
  },

  // Resending is allowed for PM or LEAD; refreshes the expiry window.
  async resendInvite(
    actorUserId: string,
    projectId: string,
    invitationId: string,
    origin: string,
  ) {
    await permissionService.assertProjectRole(actorUserId, projectId, "LEAD");
    const invite = await invitationRepository.findById(invitationId);
    if (!invite || invite.projectId !== projectId || invite.status !== "PENDING") {
      throw new NotFoundError("Invitation not found.");
    }
    const meta = await projectRepository.meta(projectId);
    const updated = await invitationRepository.updateExpiry(invitationId, expiry());
    await sendInviteEmail(
      invite.email,
      `${origin}/auth/callback?next=/${meta?.key ?? ""}/board`,
    );
    return { id: updated.id, expiresAt: updated.expiresAt.toISOString() };
  },

  // PM-only.
  async cancelInvite(actorUserId: string, projectId: string, invitationId: string) {
    await permissionService.assertCanDelete(actorUserId, projectId);
    const invite = await invitationRepository.findById(invitationId);
    if (!invite || invite.projectId !== projectId || invite.status !== "PENDING") {
      throw new NotFoundError("Invitation not found.");
    }
    await invitationRepository.setStatus(invitationId, "REVOKED");
    return { id: invitationId };
  },

  // Bootstrap path (runs at sign-in for the user themselves — no permission
  // check). Joins every project the user was invited to and marks the
  // invitations accepted.
  async acceptInvitationsForUser(userId: string, email: string) {
    const invites = await invitationRepository.listPendingForEmail(email);
    for (const inv of invites) {
      if (!inv.projectId) continue;
      await orgRepository.ensureMember(inv.orgId, userId);
      await projectMemberRepository.upsert({
        projectId: inv.projectId,
        userId,
        role: inv.role,
        discipline: inv.discipline ?? "DEVELOPMENT",
      });
      await invitationRepository.setStatus(inv.id, "ACCEPTED");
    }
    return { accepted: invites.length };
  },
};
