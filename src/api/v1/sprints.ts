import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { sprintService } from "@/services/sprintService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import { PermissionError } from "@/services/permissionService";

type Ctx = { params: Promise<{ id: string }> };

function errorResponse(err: unknown) {
  if (err instanceof ValidationError)
    return NextResponse.json({ error: err.message }, { status: 400 });
  if (err instanceof PermissionError)
    return NextResponse.json({ error: err.message }, { status: 403 });
  if (err instanceof NotFoundError)
    return NextResponse.json({ error: err.message }, { status: 404 });
  console.error("sprint request failed:", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

async function requireUser() {
  const user = await getAuthedUser();
  return user;
}

export async function createSprintHandler(request: Request) {
  const user = await requireUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  try {
    const sprint = await sprintService.create({
      actorUserId: user.id,
      projectKey: body.projectKey,
      name: body.name,
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      goal: body.goal ?? null,
    });
    return NextResponse.json({ sprint }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function updateSprintHandler(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  try {
    const sprint = await sprintService.update(id, body, user.id);
    return NextResponse.json({ sprint });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function deleteSprintHandler(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await sprintService.remove(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function startSprintHandler(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const sprint = await sprintService.start(id, user.id);
    return NextResponse.json({ sprint });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function completeSprintHandler(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  try {
    const result = await sprintService.complete(
      id,
      {
        carryoverTo: body?.carryoverTo === "next" ? "next" : "backlog",
        nextSprintId: body?.nextSprintId ?? null,
      },
      user.id,
    );
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
