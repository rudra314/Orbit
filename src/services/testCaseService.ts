import {
  testCaseRepository,
  type TestCaseRow,
  type TestStep,
} from "@/repositories/testCaseRepository";
import { aiGenerationRepository } from "@/repositories/aiGenerationRepository";
import { permissionService } from "@/services/permissionService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import { getProvider } from "@/lib/llm/providerFactory";
import { ANTHROPIC_MODEL } from "@/lib/llm/anthropicAdapter";
import { LLMError } from "@/lib/llm/errors";
import { AiGenerationError } from "@/services/aiService";
import type { Prisma, Priority, TestType, TestCaseStatus } from "@prisma/client";

const PROMPT_VERSION = 1;
const PRIORITIES: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const TEST_TYPES: TestType[] = ["MANUAL", "AUTOMATED"];
const MAX_ATTEMPTS = 2;

// --- DTO --------------------------------------------------------------

function toDto(row: TestCaseRow) {
  return {
    id: row.id,
    title: row.title,
    preconditions: row.preconditions,
    steps: (Array.isArray(row.steps) ? row.steps : []) as unknown as TestStep[],
    expectedResult: row.expectedResult,
    testType: row.testType,
    priority: row.priority,
    status: row.status,
    aiGenerationId: row.aiGenerationId,
    sortOrder: row.sortOrder,
    createdByName: row.createdBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
  };
}

export type TestCaseDto = ReturnType<typeof toDto>;

async function listDto(workItemId: string) {
  const rows = await testCaseRepository.listForItem(workItemId);
  return { testCases: rows.map(toDto) };
}

// --- Input coercion ---------------------------------------------------

function priority(v: unknown): Priority {
  const up = String(v ?? "").toUpperCase();
  return (PRIORITIES as string[]).includes(up) ? (up as Priority) : "MEDIUM";
}

function testType(v: unknown): TestType {
  const up = String(v ?? "").toUpperCase();
  return (TEST_TYPES as string[]).includes(up) ? (up as TestType) : "MANUAL";
}

// Normalizes a steps array: drops rows with no action, renumbers sequentially.
function normalizeSteps(raw: unknown): TestStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: TestStep[] = [];
  for (const s of raw) {
    const sr = (s ?? {}) as Record<string, unknown>;
    const action = String(sr.action ?? "").trim();
    if (!action) continue;
    steps.push({
      stepNumber: steps.length + 1,
      action,
      expectedResult: String(sr.expectedResult ?? "").trim(),
    });
  }
  return steps;
}

function cleanStr(v: unknown): string | null {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}

// --- AI generation ----------------------------------------------------

const SYSTEM_PROMPT =
  "You are an expert QA engineer writing test cases. Output ONLY valid JSON. " +
  "No markdown. No explanation. Just the JSON object.";

function buildPrompt(input: {
  title: string;
  description: string | null;
  acceptanceCriteria: string;
}): string {
  return `Write test cases that verify this user story.

Title: ${input.title}
${input.description ? `Description: ${input.description}\n` : ""}Acceptance criteria:
${input.acceptanceCriteria}

Return a JSON object with this exact structure:
{
  "testCases": [
    {
      "title": "string",
      "preconditions": "string",
      "steps": [
        { "stepNumber": "number", "action": "string", "expectedResult": "string" }
      ],
      "expectedResult": "string",
      "testType": "MANUAL | AUTOMATED",
      "priority": "CRITICAL | HIGH | MEDIUM | LOW"
    }
  ]
}

Rules:
- Generate 2-4 test cases
- Cover the happy path and at least one edge/negative case
- 2-5 concrete steps per test case
- Be specific and actionable`;
}

// Pulls the JSON object out of the model text, tolerating ```json fences.
function extractJson(text: string): unknown {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  if (!s.startsWith("{")) {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start !== -1 && end > start) s = s.slice(start, end + 1);
  }
  return JSON.parse(s);
}

type NormalizedTestCase = {
  title: string;
  preconditions: string | null;
  steps: TestStep[];
  expectedResult: string | null;
  testType: TestType;
  priority: Priority;
};

// Coerces the parsed object into validated test cases. Items missing a title
// are dropped. Never throws — returns [] for unusable input.
function normalizeGenerated(raw: unknown): NormalizedTestCase[] {
  if (!raw || typeof raw !== "object") return [];
  const arr = (raw as Record<string, unknown>).testCases;
  if (!Array.isArray(arr)) return [];

  const out: NormalizedTestCase[] = [];
  for (const t of arr) {
    const tr = (t ?? {}) as Record<string, unknown>;
    const title = cleanStr(tr.title);
    if (!title) continue;
    out.push({
      title,
      preconditions: cleanStr(tr.preconditions),
      steps: normalizeSteps(tr.steps),
      expectedResult: cleanStr(tr.expectedResult),
      testType: testType(tr.testType),
      priority: priority(tr.priority),
    });
  }
  return out;
}

// --- Service ----------------------------------------------------------

export const testCaseService = {
  // List test cases for a work item (any project member).
  async listForItem(workItemId: string, actorUserId: string) {
    const ctx = await testCaseRepository.workItemContext(workItemId);
    if (!ctx) throw new NotFoundError("Work item not found.");
    await permissionService.assertProjectMember(actorUserId, ctx.projectId);
    return listDto(workItemId);
  },

  // Create a manual test case (PM/LEAD/CONTRIBUTOR), status DRAFT.
  async create(input: {
    actorUserId: string;
    workItemId: string;
    title: string;
    testType?: unknown;
    priority?: unknown;
    preconditions?: unknown;
    steps?: unknown;
    expectedResult?: unknown;
  }) {
    const ctx = await testCaseRepository.workItemContext(input.workItemId);
    if (!ctx) throw new NotFoundError("Work item not found.");
    await permissionService.assertCanMutateBoard(input.actorUserId, ctx.projectId);

    const title = String(input.title ?? "").trim();
    if (!title) throw new ValidationError("Title is required.");

    await testCaseRepository.createManual({
      workItemId: input.workItemId,
      createdById: input.actorUserId,
      title,
      preconditions: cleanStr(input.preconditions),
      steps: normalizeSteps(input.steps),
      expectedResult: cleanStr(input.expectedResult),
      testType: testType(input.testType),
      priority: priority(input.priority),
    });

    return listDto(input.workItemId);
  },

  // Edit a test case's fields (PM/LEAD/CONTRIBUTOR).
  async update(
    testCaseId: string,
    patch: Record<string, unknown>,
    actorUserId: string,
  ) {
    const tc = await testCaseRepository.findWithProject(testCaseId);
    if (!tc) throw new NotFoundError("Test case not found.");
    await permissionService.assertCanMutateBoard(
      actorUserId,
      tc.workItem.projectId,
    );

    const data: Prisma.TestCaseUpdateInput = {};
    if ("title" in patch) {
      const title = String(patch.title ?? "").trim();
      if (!title) throw new ValidationError("Title cannot be empty.");
      data.title = title;
    }
    if ("preconditions" in patch) data.preconditions = cleanStr(patch.preconditions);
    if ("expectedResult" in patch) data.expectedResult = cleanStr(patch.expectedResult);
    if ("testType" in patch) data.testType = testType(patch.testType);
    if ("priority" in patch) data.priority = priority(patch.priority);
    if ("steps" in patch) {
      data.steps = normalizeSteps(patch.steps) as unknown as Prisma.InputJsonValue;
    }

    if (Object.keys(data).length === 0) {
      throw new ValidationError("No editable fields provided.");
    }

    await testCaseRepository.updateFields(testCaseId, data);
    return listDto(tc.workItemId);
  },

  // Status transitions (PM/LEAD/QE).
  async transition(input: {
    testCaseId: string;
    actorUserId: string;
    to: TestCaseStatus;
  }) {
    const tc = await testCaseRepository.findWithProject(input.testCaseId);
    if (!tc) throw new NotFoundError("Test case not found.");
    await permissionService.assertCanReviewTestCase(
      input.actorUserId,
      tc.workItem.projectId,
    );

    // Guard the allowed transitions to keep the lifecycle sane.
    const allowed: Record<TestCaseStatus, TestCaseStatus[]> = {
      DRAFT: ["ACTIVE", "REJECTED"],
      ACTIVE: ["DEPRECATED"],
      REJECTED: [],
      DEPRECATED: [],
    };
    if (!allowed[tc.status].includes(input.to)) {
      throw new ValidationError("That status change isn't allowed.");
    }

    await testCaseRepository.setStatus({
      id: input.testCaseId,
      status: input.to,
      approvedById: input.to === "ACTIVE" ? input.actorUserId : null,
    });
    return listDto(tc.workItemId);
  },

  // Generate test cases from the story's acceptance criteria (PM/LEAD/CONTRIBUTOR).
  async generateFromAC(workItemId: string, actorUserId: string) {
    const ctx = await testCaseRepository.workItemContext(workItemId);
    if (!ctx) throw new NotFoundError("Work item not found.");
    await permissionService.assertCanMutateBoard(actorUserId, ctx.projectId);

    const config = await aiGenerationRepository.getConfig(ctx.projectId);
    if (!config || config.aiMode === "DISABLED") {
      throw new ValidationError("AI generation is disabled for this project.");
    }

    const acceptanceCriteria = (ctx.acceptanceCriteria ?? "").trim();
    if (!acceptanceCriteria) {
      throw new ValidationError(
        "Add acceptance criteria to this story before generating test cases.",
      );
    }

    const prompt = buildPrompt({
      title: ctx.title,
      description: ctx.description,
      acceptanceCriteria,
    });
    const provider = getProvider(); // throws LLMConfigError if unconfigured

    let testCases: NormalizedTestCase[] = [];
    let tokenTotal = 0;
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let result;
      try {
        result = await provider.generate(prompt, SYSTEM_PROMPT);
      } catch (err) {
        if (err instanceof LLMError) {
          lastError = err;
          continue;
        }
        throw err;
      }
      tokenTotal += result.inputTokens + result.outputTokens;
      try {
        const parsed = normalizeGenerated(extractJson(result.text));
        if (parsed.length > 0) {
          testCases = parsed;
          break;
        }
        lastError = new AiGenerationError();
      } catch (err) {
        lastError = err;
      }
    }

    if (testCases.length === 0) {
      throw lastError instanceof AiGenerationError
        ? lastError
        : new AiGenerationError();
    }

    await testCaseRepository.createAiGenerated({
      projectId: ctx.projectId,
      workItemId,
      actorUserId,
      provider: provider.name,
      model: ANTHROPIC_MODEL,
      promptVersion: PROMPT_VERSION,
      inputText: acceptanceCriteria,
      generatedJson: { testCases } as unknown as Prisma.InputJsonValue,
      tokenCount: tokenTotal,
      testCases,
    });

    return listDto(workItemId);
  },
};
