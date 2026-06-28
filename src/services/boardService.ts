import { projectRepository } from "@/repositories/projectRepository";
import { workflowRepository } from "@/repositories/workflowRepository";
import { workItemRepository } from "@/repositories/workItemRepository";
import { projectMemberRepository } from "@/repositories/projectMemberRepository";
import { sprintRepository } from "@/repositories/sprintRepository";
import { permissionService } from "@/services/permissionService";
import type { BoardWorkItem } from "@/repositories/workItemRepository";

export class NotFoundError extends Error {
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

// Maps a Prisma work item (with board relations) to the plain, serializable
// shape the client board consumes. Shared by getBoardData and the mutations.
export function toBoardItem(it: BoardWorkItem) {
  return {
    id: it.id,
    itemKey: it.itemKey,
    type: it.type,
    title: it.title,
    description: it.description,
    acceptanceCriteria: it.acceptanceCriteria,
    edgeCases: it.edgeCases,
    businessValue: it.businessValue,
    priority: it.priority,
    severity: it.severity,
    discipline: it.discipline,
    storyPoints: it.storyPoints,
    estimatedHours: it.estimatedHours,
    loggedHours: it.loggedHours,
    isBlocked: it.isBlocked,
    blockerReason: it.blockerReason,
    verificationStatus: it.verificationStatus,
    statusId: it.statusId,
    sprintId: it.sprintId,
    epicId: it.epicId,
    featureId: it.featureId,
    assigneeId: it.assigneeId,
    reporterId: it.reporterId,
    assignee: it.assignee,
    stepsToReproduce: it.stepsToReproduce,
    expectedResult: it.expectedResult,
    actualResult: it.actualResult,
    environment: it.environment,
    buildVersion: it.buildVersion,
    researchQuestion: it.researchQuestion,
    timeBox: it.timeBox,
    outcomeSummary: it.outcomeSummary,
    taskCategory: it.taskCategory,
    dueDate: it.dueDate ? it.dueDate.toISOString() : null,
    createdAt: it.createdAt.toISOString(),
    linkCount: it._count.linksFrom + it._count.linksTo,
  };
}

export type BoardItem = ReturnType<typeof toBoardItem>;

export const boardService = {
  // Everything the board needs in one call. Membership is enforced.
  async getBoardData(projectKey: string, userId: string) {
    const project = await projectRepository.getByKeyForUser(projectKey, userId);
    if (!project) throw new NotFoundError("Project not found.");

    const [columns, items, members, sprints] = await Promise.all([
      workflowRepository.listForProject(project.id),
      workItemRepository.listForProject(project.id),
      projectMemberRepository.listForProject(project.id),
      sprintRepository.listForProject(project.id),
    ]);

    const member = await projectMemberRepository.find(project.id, userId);

    return {
      project: { id: project.id, key: project.key, name: project.name },
      columns: columns.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        color: c.color,
        displayOrder: c.displayOrder,
      })),
      items: items.map(toBoardItem),
      members: members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        discipline: m.discipline,
      })),
      sprints,
      currentUserId: userId,
      canEdit: member ? ["PM", "LEAD", "CONTRIBUTOR"].includes(member.role) : false,
    };
  },

  // Drag-and-drop / status-picker move. Updates statusId + emits status_changed.
  async moveCard(itemId: string, toStatusId: string, userId: string) {
    const item = await workItemRepository.findProjectIdById(itemId);
    if (!item) throw new NotFoundError("Work item not found.");
    await permissionService.assertCanMutateBoard(userId, item.projectId);

    // Validate the target status belongs to the same project.
    const columns = await workflowRepository.listForProject(item.projectId);
    if (!columns.some((c) => c.id === toStatusId)) {
      throw new NotFoundError("Invalid target column.");
    }

    const moved = await workItemRepository.moveStatus({
      id: itemId,
      toStatusId,
      actorUserId: userId,
    });
    return toBoardItem(moved);
  },
};
