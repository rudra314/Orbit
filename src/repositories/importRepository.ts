import { prisma } from "./prisma";
import type { Priority, WorkItemType } from "@prisma/client";

// A single row resolved by importService, ready to persist. Epic/sprint/label
// names are passed through and resolved (created if missing) inside the batch
// transaction; everything else is already coerced to ids/enums.
export type ResolvedImportItem = {
  action: "create" | "update";
  existingId: string | null; // set when action === "update"
  title: string;
  description: string | null;
  type: WorkItemType;
  statusId: string;
  priority: Priority;
  assigneeId: string | null;
  storyPoints: number | null;
  estimatedHours: number | null;
  acceptanceCriteria: string | null;
  epicTitle: string | null;
  sprintName: string | null;
  labelNames: string[];
};

export type ImportContext = {
  statuses: { id: string; name: string; displayOrder: number }[];
  members: { userId: string; name: string; email: string }[];
  sprints: { id: string; name: string }[];
  epics: { id: string; title: string }[];
  // Existing item titles (lowercased) → item id, for duplicate handling.
  titles: { title: string; id: string }[];
};

export const importRepository = {
  // Everything the importer needs to resolve a file against the project.
  async loadContext(projectId: string): Promise<ImportContext> {
    const [statuses, members, sprints, epics, items] = await Promise.all([
      prisma.workflowStatus.findMany({
        where: { projectId },
        select: { id: true, name: true, displayOrder: true },
      }),
      prisma.projectMember.findMany({
        where: { projectId },
        select: { userId: true, user: { select: { name: true, email: true } } },
      }),
      prisma.sprint.findMany({
        where: { projectId },
        select: { id: true, name: true },
      }),
      prisma.epic.findMany({
        where: { projectId },
        select: { id: true, title: true },
      }),
      prisma.workItem.findMany({
        where: { projectId },
        select: { id: true, title: true },
      }),
    ]);

    return {
      statuses,
      members: members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
      })),
      sprints,
      epics,
      titles: items,
    };
  },

  // Imports one batch atomically: ensures referenced epics/sprints/labels exist,
  // creates items with sequential keys (or updates duplicates), writes one
  // import outbox event for the whole batch.
  async importBatch(input: {
    projectId: string;
    actorUserId: string;
    batchId: string;
    items: ResolvedImportItem[];
  }) {
    return prisma.$transaction(async (tx) => {
      const norm = (s: string) => s.trim().toLowerCase();

      // --- Ensure epics by title -------------------------------------
      const epicMap = new Map<string, string>();
      {
        const existing = await tx.epic.findMany({
          where: { projectId: input.projectId },
          select: { id: true, title: true },
        });
        for (const e of existing) epicMap.set(norm(e.title), e.id);
        const wanted = new Set(
          input.items
            .map((i) => i.epicTitle)
            .filter((t): t is string => !!t)
            .map((t) => t.trim()),
        );
        for (const title of wanted) {
          if (epicMap.has(norm(title))) continue;
          const created = await tx.epic.create({
            data: { projectId: input.projectId, title },
            select: { id: true },
          });
          epicMap.set(norm(title), created.id);
        }
      }

      // --- Ensure sprints by name ------------------------------------
      const sprintMap = new Map<string, string>();
      {
        const existing = await tx.sprint.findMany({
          where: { projectId: input.projectId },
          select: { id: true, name: true },
        });
        for (const s of existing) sprintMap.set(norm(s.name), s.id);
        const wanted = new Set(
          input.items
            .map((i) => i.sprintName)
            .filter((n): n is string => !!n)
            .map((n) => n.trim()),
        );
        for (const name of wanted) {
          if (sprintMap.has(norm(name))) continue;
          const created = await tx.sprint.create({
            data: { projectId: input.projectId, name },
            select: { id: true },
          });
          sprintMap.set(norm(name), created.id);
        }
      }

      // --- Ensure labels by name -------------------------------------
      const labelMap = new Map<string, string>();
      {
        const wanted = new Set(
          input.items.flatMap((i) => i.labelNames).map((n) => n.trim()).filter(Boolean),
        );
        if (wanted.size > 0) {
          const existing = await tx.label.findMany({
            where: { projectId: input.projectId, name: { in: [...wanted] } },
            select: { id: true, name: true },
          });
          for (const l of existing) labelMap.set(norm(l.name), l.id);
          for (const name of wanted) {
            if (labelMap.has(norm(name))) continue;
            const created = await tx.label.create({
              data: { projectId: input.projectId, name },
              select: { id: true },
            });
            labelMap.set(norm(name), created.id);
          }
        }
      }

      // --- Reserve sequential keys for the creates -------------------
      const createCount = input.items.filter((i) => i.action === "create").length;
      let nextNumber = 0;
      let projectKey = "";
      if (createCount > 0) {
        const project = await tx.project.update({
          where: { id: input.projectId },
          data: { nextItemNumber: { increment: createCount } },
          select: { key: true, nextItemNumber: true },
        });
        projectKey = project.key;
        nextNumber = project.nextItemNumber - createCount;
      }

      let created = 0;
      let updated = 0;

      for (const item of input.items) {
        const epicId = item.epicTitle ? epicMap.get(norm(item.epicTitle)) ?? null : null;
        const sprintId = item.sprintName
          ? sprintMap.get(norm(item.sprintName)) ?? null
          : null;
        const labelIds = item.labelNames
          .map((n) => labelMap.get(norm(n)))
          .filter((id): id is string => !!id);

        if (item.action === "update" && item.existingId) {
          await tx.workItem.update({
            where: { id: item.existingId },
            data: {
              description: item.description,
              type: item.type,
              statusId: item.statusId,
              priority: item.priority,
              assigneeId: item.assigneeId,
              storyPoints: item.storyPoints,
              estimatedHours: item.estimatedHours,
              acceptanceCriteria: item.acceptanceCriteria,
              epicId,
              sprintId,
            },
          });
          updated++;
          continue;
        }

        const itemKey = `${projectKey}-${nextNumber}`;
        nextNumber++;
        const wi = await tx.workItem.create({
          data: {
            projectId: input.projectId,
            statusId: item.statusId,
            itemKey,
            type: item.type,
            title: item.title,
            description: item.description,
            acceptanceCriteria: item.acceptanceCriteria,
            priority: item.priority,
            assigneeId: item.assigneeId,
            reporterId: input.actorUserId,
            storyPoints: item.storyPoints,
            estimatedHours: item.estimatedHours,
            epicId,
            sprintId,
            importBatchId: input.batchId,
          },
          select: { id: true },
        });
        if (labelIds.length > 0) {
          await tx.workItemLabel.createMany({
            data: labelIds.map((labelId) => ({ workItemId: wi.id, labelId })),
            skipDuplicates: true,
          });
        }
        created++;
      }

      await tx.outboxEvent.create({
        data: {
          eventType: "work_items_imported",
          payload: {
            projectId: input.projectId,
            batchId: input.batchId,
            created,
            updated,
            actorUserId: input.actorUserId,
          },
        },
      });

      return { created, updated };
    });
  },
};
