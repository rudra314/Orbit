import { projectRepository } from "@/repositories/projectRepository";
import {
  aiGenerationRepository,
  type AiGenerationListRow,
  type ApprovedEpic,
} from "@/repositories/aiGenerationRepository";
import { permissionService } from "@/services/permissionService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import { getProvider } from "@/lib/llm/providerFactory";
import { LLMError } from "@/lib/llm/errors";
import type { LLMProvider } from "@/lib/llm/provider";
import type { AiGenerationStatus, Priority } from "@prisma/client";

// Raised when the model runs or returns something we can't use, after the retry.
export class AiGenerationError extends Error {
  constructor(
    message = "Generation failed. Try again or reduce the input length.",
  ) {
    super(message);
    this.name = "AiGenerationError";
  }
}

const PROMPT_VERSION = 1;
const MIN_INPUT_CHARS = 50;
const MAX_ATTEMPTS = 2; // one generation + one automatic retry

const SYSTEM_PROMPT =
  "You are an expert product manager and BA helping structure software " +
  "requirements. Output ONLY valid JSON. No markdown. No explanation. Just " +
  "the JSON object.";

function buildUserPrompt(inputText: string): string {
  return `Analyse these requirements and generate a structured backlog.

Requirements:
${inputText}

Return a JSON object with this exact structure:
{
  "epics": [
    {
      "title": "string",
      "description": "string",
      "features": [
        {
          "title": "string",
          "description": "string",
          "stories": [
            {
              "title": "string",
              "type": "STORY",
              "description": "string",
              "acceptanceCriteria": "string",
              "edgeCases": "string",
              "priority": "HIGH | MEDIUM | LOW",
              "storyPoints": "number (1|2|3|5|8|13)",
              "testCases": [
                {
                  "title": "string",
                  "preconditions": "string",
                  "steps": [
                    { "stepNumber": "number", "action": "string", "expectedResult": "string" }
                  ],
                  "expectedResult": "string",
                  "priority": "HIGH | MEDIUM | LOW"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

Rules:
- Generate 2-4 epics
- 1-3 features per epic
- 2-5 stories per feature
- 2-4 test cases per story
- Be specific and actionable
- Acceptance criteria in Given/When/Then format`;
}

// --- JSON extraction & normalization ----------------------------------

// Pulls the JSON object out of the model's text, tolerating ```json fences.
function extractJson(text: string): unknown {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // Fall back to the outermost { … } if there's stray prose around it.
  if (!s.startsWith("{")) {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start !== -1 && end > start) s = s.slice(start, end + 1);
  }
  return JSON.parse(s);
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

const ALLOWED_POINTS = new Set([1, 2, 3, 5, 8, 13]);

function priority(v: unknown): Priority {
  const up = String(v ?? "").toUpperCase();
  return (["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(up)
    ? up
    : "MEDIUM") as Priority;
}

function points(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && ALLOWED_POINTS.has(n) ? n : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

// Coerces an arbitrary parsed object into the strict, validated tree. Items
// missing a title are dropped. Never throws — returns [] for unusable input.
function normalizeTree(raw: unknown): ApprovedEpic[] {
  if (!raw || typeof raw !== "object") return [];
  const epics: ApprovedEpic[] = [];

  for (const e of asArray((raw as Record<string, unknown>).epics)) {
    const er = e as Record<string, unknown>;
    const title = str(er.title);
    if (!title) continue;

    const features: ApprovedEpic["features"] = [];
    for (const f of asArray(er.features)) {
      const fr = f as Record<string, unknown>;
      const ftitle = str(fr.title);
      if (!ftitle) continue;

      const stories: ApprovedEpic["features"][number]["stories"] = [];
      for (const s of asArray(fr.stories)) {
        const sr = s as Record<string, unknown>;
        const stitle = str(sr.title);
        if (!stitle) continue;

        const testCases = asArray(sr.testCases).flatMap((t) => {
          const tr = t as Record<string, unknown>;
          const ttitle = str(tr.title);
          if (!ttitle) return [];
          const steps = asArray(tr.steps).flatMap((st, i) => {
            const str_ = st as Record<string, unknown>;
            const action = str(str_.action);
            if (!action) return [];
            return [
              {
                stepNumber: Number(str_.stepNumber) || i + 1,
                action,
                expectedResult: str(str_.expectedResult) ?? "",
              },
            ];
          });
          return [
            {
              title: ttitle,
              preconditions: str(tr.preconditions),
              steps,
              expectedResult: str(tr.expectedResult),
              priority: priority(tr.priority),
            },
          ];
        });

        stories.push({
          title: stitle,
          description: str(sr.description),
          acceptanceCriteria: str(sr.acceptanceCriteria),
          edgeCases: str(sr.edgeCases),
          priority: priority(sr.priority),
          storyPoints: points(sr.storyPoints),
          testCases,
        });
      }

      features.push({ title: ftitle, description: str(fr.description), stories });
    }

    epics.push({ title, description: str(er.description), features });
  }

  return epics;
}

function summarize(epics: ApprovedEpic[]) {
  let features = 0;
  let stories = 0;
  let testCases = 0;
  for (const e of epics) {
    features += e.features.length;
    for (const f of e.features) {
      stories += f.stories.length;
      for (const s of f.stories) testCases += s.testCases.length;
    }
  }
  return { epics: epics.length, features, stories, testCases };
}

// Runs the provider with one automatic retry, parsing + normalizing each time.
async function runGeneration(provider: LLMProvider, inputText: string) {
  const prompt = buildUserPrompt(inputText);
  let tokenTotal = 0;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let result;
    try {
      result = await provider.generate(prompt, SYSTEM_PROMPT);
    } catch (err) {
      // Config problems (bad/missing key) aren't worth retrying — surface them.
      if (err instanceof LLMError) {
        lastError = err;
        continue;
      }
      throw err;
    }
    tokenTotal += result.inputTokens + result.outputTokens;

    try {
      const epics = normalizeTree(extractJson(result.text));
      if (epics.length > 0) return { epics, tokenTotal };
      lastError = new AiGenerationError();
    } catch (err) {
      lastError = err; // invalid JSON — retry once
    }
  }

  throw lastError instanceof AiGenerationError
    ? lastError
    : new AiGenerationError();
}

// --- DTO mapping ------------------------------------------------------

function toSummaryRow(row: AiGenerationListRow) {
  const epics = Array.isArray((row.generatedJson as { epics?: unknown })?.epics)
    ? ((row.generatedJson as { epics: ApprovedEpic[] }).epics)
    : [];
  return {
    id: row.id,
    status: row.status,
    provider: row.provider,
    model: row.model,
    tokenCount: row.tokenCount,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt.toISOString(),
    generatedByName: row.generatedBy?.name ?? null,
    createdEntityCount: row._count.createdEntities,
    summary: summarize(epics),
    output: { epics },
  };
}

export type AiGenerationSummary = ReturnType<typeof toSummaryRow>;

// --- Service ----------------------------------------------------------

export const aiService = {
  // Generate a backlog draft from pasted requirements (PM/LEAD only).
  async generateBacklog(input: {
    actorUserId: string;
    projectId: string;
    inputText: string;
  }) {
    const project = await projectRepository.getByIdForUser(
      input.projectId,
      input.actorUserId,
    );
    if (!project) throw new NotFoundError("Project not found.");
    await permissionService.assertCanUseAi(input.actorUserId, project.id);

    const config = await aiGenerationRepository.getConfig(project.id);
    if (!config || config.aiMode === "DISABLED") {
      throw new ValidationError("AI generation is disabled for this project.");
    }

    const inputText = (input.inputText ?? "").trim();
    if (inputText.length < MIN_INPUT_CHARS) {
      throw new ValidationError(
        `Provide at least ${MIN_INPUT_CHARS} characters of requirements.`,
      );
    }

    const provider = getProvider(); // throws LLMConfigError if unconfigured
    const { epics, tokenTotal } = await runGeneration(provider, inputText);

    const generation = await aiGenerationRepository.createDraft({
      projectId: project.id,
      generatedById: input.actorUserId,
      provider: provider.name,
      model: provider.model,
      promptVersion: PROMPT_VERSION,
      inputText,
      generatedJson: { epics },
      tokenCount: tokenTotal,
    });

    return {
      generationId: generation.id,
      output: { epics },
      summary: summarize(epics),
    };
  },

  // Approve selected items: create the real entities and mark APPROVED.
  // `approvedItems` is the (possibly edited/filtered) tree from the reviewer.
  async approveGeneration(input: {
    actorUserId: string;
    projectId: string;
    generationId: string;
    approvedItems: unknown;
  }) {
    const gen = await aiGenerationRepository.findById(input.generationId);
    if (!gen || gen.projectId !== input.projectId) {
      throw new NotFoundError("Generation not found.");
    }
    await permissionService.assertCanUseAi(input.actorUserId, input.projectId);
    if (gen.status !== "DRAFT") {
      throw new ValidationError("This generation has already been reviewed.");
    }

    const epics = normalizeTree(input.approvedItems);
    if (epics.length === 0) {
      throw new ValidationError("Select at least one item to approve.");
    }

    return aiGenerationRepository.approveAndCreate({
      generationId: input.generationId,
      projectId: input.projectId,
      actorUserId: input.actorUserId,
      epics,
    });
  },

  // Reject a draft with an optional review note (PM/LEAD only).
  async rejectGeneration(input: {
    actorUserId: string;
    projectId: string;
    generationId: string;
    note?: string | null;
  }) {
    const gen = await aiGenerationRepository.findById(input.generationId);
    if (!gen || gen.projectId !== input.projectId) {
      throw new NotFoundError("Generation not found.");
    }
    await permissionService.assertCanUseAi(input.actorUserId, input.projectId);
    if (gen.status !== "DRAFT") {
      throw new ValidationError("This generation has already been reviewed.");
    }

    await aiGenerationRepository.setRejected({
      id: input.generationId,
      reviewerId: input.actorUserId,
      note: input.note?.trim() || null,
    });
    return { ok: true };
  },

  // List generations for a project (any member may view the queue).
  async listGenerations(input: {
    actorUserId: string;
    projectId: string;
    status?: AiGenerationStatus;
  }) {
    await permissionService.assertProjectMember(input.actorUserId, input.projectId);
    const rows = await aiGenerationRepository.listForProject(
      input.projectId,
      input.status,
    );
    return rows.map(toSummaryRow);
  },

  // Review-queue data for the page (resolves the project by key).
  async getReviewQueue(projectKey: string, userId: string) {
    const project = await projectRepository.getByKeyForUser(projectKey, userId);
    if (!project) throw new NotFoundError("Project not found.");
    const member = await permissionService.assertProjectMember(userId, project.id);
    const rows = await aiGenerationRepository.listForProject(project.id);
    return {
      project: { id: project.id, key: project.key, name: project.name },
      canUseAi: ["PM", "LEAD"].includes(member.role),
      generations: rows.map(toSummaryRow),
    };
  },
};
