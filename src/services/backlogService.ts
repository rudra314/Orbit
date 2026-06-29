import { projectRepository } from "@/repositories/projectRepository";
import { epicRepository } from "@/repositories/epicRepository";
import { workflowRepository } from "@/repositories/workflowRepository";
import { workItemRepository } from "@/repositories/workItemRepository";
import { projectMemberRepository } from "@/repositories/projectMemberRepository";
import { sprintRepository } from "@/repositories/sprintRepository";
import { aiGenerationRepository } from "@/repositories/aiGenerationRepository";
import { NotFoundError, toBoardItem, type BoardItem } from "@/services/boardService";
import { ANTHROPIC_MODEL_LABEL } from "@/lib/llm/anthropicAdapter";
import type { StatusCategory } from "@prisma/client";

type DerivedStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

// Derived rollup status from child item status categories.
function deriveStatus(
  total: number,
  done: number,
  anyInProgress: boolean,
): DerivedStatus {
  if (total === 0) return "NOT_STARTED";
  if (done === total) return "COMPLETED";
  if (done > 0 || anyInProgress) return "IN_PROGRESS";
  return "NOT_STARTED";
}

function statsFor(items: BoardItem[], categoryOf: Map<string, StatusCategory>) {
  let done = 0;
  let inProgress = 0;
  for (const it of items) {
    const cat = categoryOf.get(it.statusId);
    if (cat === "COMPLETED") done++;
    else if (cat === "IN_PROGRESS") inProgress++;
  }
  const total = items.length;
  return {
    total,
    done,
    completionPct: total === 0 ? 0 : Math.round((done / total) * 100),
    status: deriveStatus(total, done, inProgress > 0),
  };
}

export const backlogService = {
  async getBacklogData(projectKey: string, userId: string) {
    const project = await projectRepository.getByKeyForUser(projectKey, userId);
    if (!project) throw new NotFoundError("Project not found.");

    const [epics, rawItems, members, sprints, columns] = await Promise.all([
      epicRepository.listForProject(project.id),
      workItemRepository.listForProject(project.id),
      projectMemberRepository.listForProject(project.id),
      sprintRepository.listForProject(project.id),
      workflowRepository.listForProject(project.id),
    ]);

    const [member, aiConfig] = await Promise.all([
      projectMemberRepository.find(project.id, userId),
      aiGenerationRepository.getConfig(project.id),
    ]);
    const categoryOf = new Map(columns.map((c) => [c.id, c.category]));
    const items = rawItems.map(toBoardItem);

    const epicDTOs = epics.map((epic) => {
      const epicItems = items.filter((it) => it.epicId === epic.id);
      const epicStats = statsFor(epicItems, categoryOf);
      return {
        id: epic.id,
        title: epic.title,
        description: epic.description,
        startDate: epic.startDate ? epic.startDate.toISOString() : null,
        targetDate: epic.targetDate ? epic.targetDate.toISOString() : null,
        ...epicStats,
        features: epic.features.map((f) => {
          const featItems = epicItems.filter((it) => it.featureId === f.id);
          const featStats = statsFor(featItems, categoryOf);
          return {
            id: f.id,
            title: f.title,
            total: featStats.total,
            done: featStats.done,
            status: featStats.status,
          };
        }),
      };
    });

    return {
      project: { id: project.id, key: project.key, name: project.name },
      epics: epicDTOs,
      items,
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
      sprints,
      currentUserId: userId,
      canEdit: member ? ["PM", "LEAD", "CONTRIBUTOR"].includes(member.role) : false,
      canDelete: member?.role === "PM",
      canImport: member ? ["PM", "LEAD"].includes(member.role) : false,
      aiEnabled: !!aiConfig && aiConfig.aiMode !== "DISABLED",
      canUseAi: member ? ["PM", "LEAD"].includes(member.role) : false,
      aiModelLabel: ANTHROPIC_MODEL_LABEL,
    };
  },
};
