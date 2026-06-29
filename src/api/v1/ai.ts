import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { aiService, AiGenerationError } from "@/services/aiService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import { PermissionError } from "@/services/permissionService";
import { LLMConfigError, LLMError } from "@/lib/llm/errors";
import type { AiGenerationStatus } from "@prisma/client";

type Ctx = { params: Promise<{ projectId: string }> };

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
  console.error("ai request failed:", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

async function parseJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function requireUser() {
  const user = await getAuthedUser();
  return user ?? null;
}

const STATUSES: AiGenerationStatus[] = [
  "DRAFT",
  "EDITED",
  "APPROVED",
  "REJECTED",
  "ARCHIVED",
];

// POST /api/v1/projects/[projectId]/ai/generate
export async function generateHandler(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { projectId } = await ctx.params;
  const body = await parseJson(request);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  try {
    const result = await aiService.generateBacklog({
      actorUserId: user.id,
      projectId,
      inputText: body.inputText ?? "",
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/projects/[projectId]/ai/approve
export async function approveHandler(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { projectId } = await ctx.params;
  const body = await parseJson(request);
  if (!body?.generationId) {
    return NextResponse.json(
      { error: "generationId is required." },
      { status: 400 },
    );
  }

  try {
    const counts = await aiService.approveGeneration({
      actorUserId: user.id,
      projectId,
      generationId: body.generationId,
      approvedItems: body.approvedItems,
    });
    return NextResponse.json({ counts });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/projects/[projectId]/ai/reject
export async function rejectHandler(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { projectId } = await ctx.params;
  const body = await parseJson(request);
  if (!body?.generationId) {
    return NextResponse.json(
      { error: "generationId is required." },
      { status: 400 },
    );
  }

  try {
    const result = await aiService.rejectGeneration({
      actorUserId: user.id,
      projectId,
      generationId: body.generationId,
      note: body.note ?? null,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

// GET /api/v1/projects/[projectId]/ai/generations?status=DRAFT
export async function listGenerationsHandler(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { projectId } = await ctx.params;
  const statusParam = new URL(request.url).searchParams.get("status");
  const status =
    statusParam && STATUSES.includes(statusParam as AiGenerationStatus)
      ? (statusParam as AiGenerationStatus)
      : undefined;

  try {
    const generations = await aiService.listGenerations({
      actorUserId: user.id,
      projectId,
      status,
    });
    return NextResponse.json({ generations });
  } catch (err) {
    return errorResponse(err);
  }
}
