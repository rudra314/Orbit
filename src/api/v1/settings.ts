import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { settingsService } from "@/services/settingsService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import { PermissionError } from "@/services/permissionService";

type ProjectCtx = { params: Promise<{ projectId: string }> };

function errorResponse(err: unknown) {
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof PermissionError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  console.error("settings request failed:", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

async function parseJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function unauthed() {
  return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
}

// PATCH /api/v1/projects/[projectId]/settings/general
export async function updateGeneralHandler(request: Request, ctx: ProjectCtx) {
  const user = await getAuthedUser();
  if (!user) return unauthed();
  const { projectId } = await ctx.params;
  const body = await parseJson(request);
  if (!body) return NextResponse.json({ error: "Body required." }, { status: 400 });
  try {
    return NextResponse.json(
      await settingsService.updateGeneral(user.id, projectId, body),
    );
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/v1/projects/[projectId]/settings/ai
export async function updateAiHandler(request: Request, ctx: ProjectCtx) {
  const user = await getAuthedUser();
  if (!user) return unauthed();
  const { projectId } = await ctx.params;
  const body = await parseJson(request);
  if (!body) return NextResponse.json({ error: "Body required." }, { status: 400 });
  try {
    return NextResponse.json(
      await settingsService.updateAi(user.id, projectId, body),
    );
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/projects/[projectId]/settings/archive
export async function archiveHandler(_request: Request, ctx: ProjectCtx) {
  const user = await getAuthedUser();
  if (!user) return unauthed();
  const { projectId } = await ctx.params;
  try {
    return NextResponse.json(
      await settingsService.archiveProject(user.id, projectId),
    );
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/v1/projects/[projectId]/settings
export async function deleteProjectHandler(_request: Request, ctx: ProjectCtx) {
  const user = await getAuthedUser();
  if (!user) return unauthed();
  const { projectId } = await ctx.params;
  try {
    return NextResponse.json(
      await settingsService.deleteProject(user.id, projectId),
    );
  } catch (err) {
    return errorResponse(err);
  }
}
