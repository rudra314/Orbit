import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { testCaseService } from "@/services/testCaseService";
import { AiGenerationError } from "@/services/aiService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import { PermissionError } from "@/services/permissionService";
import { LLMConfigError, LLMError } from "@/lib/llm/errors";
import type { TestCaseStatus } from "@prisma/client";

type ItemCtx = { params: Promise<{ id: string }> };

function errorResponse(err: unknown) {
  if (err instanceof ValidationError || err instanceof LLMConfigError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof PermissionError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof AiGenerationError || err instanceof LLMError) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
  console.error("test-case request failed:", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

async function parseJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// GET /api/v1/work-items/[id]/test-cases
export async function listTestCasesHandler(_request: Request, ctx: ItemCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await testCaseService.listForItem(id, user.id));
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/work-items/[id]/test-cases — create a manual test case.
export async function createTestCaseHandler(request: Request, ctx: ItemCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  const body = await parseJson(request);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  try {
    const result = await testCaseService.create({
      actorUserId: user.id,
      workItemId: id,
      title: body.title,
      testType: body.testType,
      priority: body.priority,
      preconditions: body.preconditions,
      steps: body.steps,
      expectedResult: body.expectedResult,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/work-items/[id]/test-cases/generate — AI-generate from AC.
export async function generateTestCasesHandler(_request: Request, ctx: ItemCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    return NextResponse.json(
      await testCaseService.generateFromAC(id, user.id),
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}

const ACTION_STATUS: Record<string, TestCaseStatus> = {
  approve: "ACTIVE",
  reject: "REJECTED",
  deprecate: "DEPRECATED",
};

// PATCH /api/v1/test-cases/[id] — edit fields, or transition status via `action`.
export async function updateTestCaseHandler(request: Request, ctx: ItemCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  const body = await parseJson(request);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  try {
    if (body.action) {
      const to = ACTION_STATUS[String(body.action)];
      if (!to) {
        return NextResponse.json({ error: "Invalid action." }, { status: 400 });
      }
      const result = await testCaseService.transition({
        testCaseId: id,
        actorUserId: user.id,
        to,
      });
      return NextResponse.json(result);
    }
    const result = await testCaseService.update(id, body, user.id);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
