import { prisma } from "./prisma";
import type { Prisma, Priority, TestType, TestCaseStatus } from "@prisma/client";

export type TestStep = {
  stepNumber: number;
  action: string;
  expectedResult: string;
};

const withCreatedBy = {
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.TestCaseInclude;

export type TestCaseRow = Prisma.TestCaseGetPayload<{
  include: typeof withCreatedBy;
}>;

export const testCaseRepository = {
  listForItem(workItemId: string) {
    return prisma.testCase.findMany({
      where: { workItemId },
      include: withCreatedBy,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  },

  // Project + story context used to authorize and to prompt the generator.
  workItemContext(workItemId: string) {
    return prisma.workItem.findUnique({
      where: { id: workItemId },
      select: {
        id: true,
        projectId: true,
        title: true,
        description: true,
        acceptanceCriteria: true,
      },
    });
  },

  // Resolves a test case to its work item + project (for authorization).
  findWithProject(id: string) {
    return prisma.testCase.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        workItemId: true,
        workItem: { select: { projectId: true } },
      },
    });
  },

  // Manual create: one DRAFT test case appended after the existing ones.
  createManual(input: {
    workItemId: string;
    createdById: string;
    title: string;
    preconditions: string | null;
    steps: TestStep[];
    expectedResult: string | null;
    testType: TestType;
    priority: Priority;
  }) {
    return prisma.$transaction(async (tx) => {
      const count = await tx.testCase.count({
        where: { workItemId: input.workItemId },
      });
      const created = await tx.testCase.create({
        data: {
          workItemId: input.workItemId,
          createdById: input.createdById,
          title: input.title,
          preconditions: input.preconditions,
          steps: input.steps,
          expectedResult: input.expectedResult,
          testType: input.testType,
          priority: input.priority,
          status: "DRAFT",
          sortOrder: count,
        },
        select: { id: true },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: "test_case_created",
          payload: {
            testCaseId: created.id,
            workItemId: input.workItemId,
            actorUserId: input.createdById,
          },
        },
      });

      return created;
    });
  },

  // AI create: records an AiGeneration, creates DRAFT test cases linked to it,
  // links them via AiGeneratedEntity, and emits an outbox event — atomically.
  createAiGenerated(input: {
    projectId: string;
    workItemId: string;
    actorUserId: string;
    provider: string;
    model: string;
    promptVersion: number;
    inputText: string;
    generatedJson: Prisma.InputJsonValue;
    tokenCount: number;
    testCases: {
      title: string;
      preconditions: string | null;
      steps: TestStep[];
      expectedResult: string | null;
      testType: TestType;
      priority: Priority;
    }[];
  }) {
    return prisma.$transaction(async (tx) => {
      const generation = await tx.aiGeneration.create({
        data: {
          projectId: input.projectId,
          generatedById: input.actorUserId,
          provider: input.provider,
          model: input.model,
          promptVersion: input.promptVersion,
          inputSource: "acceptance_criteria",
          inputText: input.inputText,
          generatedJson: input.generatedJson,
          tokenCount: input.tokenCount,
          status: "DRAFT",
        },
        select: { id: true },
      });

      const base = await tx.testCase.count({
        where: { workItemId: input.workItemId },
      });

      const entityLinks: { entityType: string; entityId: string }[] = [];
      for (let i = 0; i < input.testCases.length; i++) {
        const tc = input.testCases[i];
        const created = await tx.testCase.create({
          data: {
            workItemId: input.workItemId,
            createdById: input.actorUserId,
            title: tc.title,
            preconditions: tc.preconditions,
            steps: tc.steps,
            expectedResult: tc.expectedResult,
            testType: tc.testType,
            priority: tc.priority,
            status: "DRAFT",
            aiGenerationId: generation.id,
            sortOrder: base + i,
          },
          select: { id: true },
        });
        entityLinks.push({ entityType: "TestCase", entityId: created.id });
      }

      await tx.aiGeneratedEntity.createMany({
        data: entityLinks.map((l) => ({
          generationId: generation.id,
          entityType: l.entityType,
          entityId: l.entityId,
        })),
      });

      await tx.outboxEvent.create({
        data: {
          eventType: "test_cases_generated",
          payload: {
            generationId: generation.id,
            workItemId: input.workItemId,
            projectId: input.projectId,
            actorUserId: input.actorUserId,
            count: entityLinks.length,
          },
        },
      });

      return { generationId: generation.id, count: entityLinks.length };
    });
  },

  updateFields(id: string, data: Prisma.TestCaseUpdateInput) {
    return prisma.testCase.update({ where: { id }, data });
  },

  // Status transition (approve/reject/deprecate). Approve also stamps approver.
  setStatus(input: {
    id: string;
    status: TestCaseStatus;
    approvedById: string | null;
  }) {
    return prisma.$transaction(async (tx) => {
      const tc = await tx.testCase.update({
        where: { id: input.id },
        data: {
          status: input.status,
          approvedById: input.approvedById,
          approvedAt: input.status === "ACTIVE" ? new Date() : null,
        },
        select: { id: true, workItemId: true },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: "test_case_status_changed",
          payload: {
            testCaseId: tc.id,
            workItemId: tc.workItemId,
            status: input.status,
            actorUserId: input.approvedById,
          },
        },
      });

      return tc;
    });
  },
};
