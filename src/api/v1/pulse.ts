import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { pulseService } from "@/services/pulseService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import { PermissionError } from "@/services/permissionService";

type ProjectCtx = { params: Promise<{ projectId: string }> };
type PulseItemCtx = { params: Promise<{ pulseItemId: string }> };

function errorResponse(err: unknown) {
  if (err instanceof ValidationError)
    return NextResponse.json({ error: err.message }, { status: 400 });
  if (err instanceof PermissionError)
    return NextResponse.json({ error: err.message }, { status: 403 });
  if (err instanceof NotFoundError)
    return NextResponse.json({ error: err.message }, { status: 404 });
  console.error("pulse request failed:", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

async function requireUser() {
  return getAuthedUser();
}

// GET /api/v1/projects/[projectId]/pulse/today?date=
export async function getPulseTodayHandler(request: Request, ctx: ProjectCtx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { projectId } = await ctx.params;
  const date = new URL(request.url).searchParams.get("date") ?? undefined;
  try {
    const data = await pulseService.getOrBuildPulseForm(projectId, user.id, date);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

// GET /api/v1/projects/[projectId]/pulse/search?q=
export async function searchPulseItemsHandler(request: Request, ctx: ProjectCtx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { projectId } = await ctx.params;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    const data = await pulseService.searchProjectItems(projectId, user.id, q);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/projects/[projectId]/pulse
export async function submitPulseHandler(request: Request, ctx: ProjectCtx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { projectId } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  try {
    const pulse = await pulseService.submitPulse({
      actorUserId: user.id,
      projectId,
      date: body.date,
      generalNote: body.generalNote ?? null,
      items: Array.isArray(body.items) ? body.items : [],
    });
    return NextResponse.json({ pulse }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

// GET /api/v1/projects/[projectId]/pulse/digest?date=&regenerate=
export async function getPulseDigestHandler(request: Request, ctx: ProjectCtx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { projectId } = await ctx.params;
  const sp = new URL(request.url).searchParams;
  try {
    const digest = await pulseService.getTeamDigest(
      projectId,
      user.id,
      sp.get("date") ?? undefined,
      { regenerate: sp.get("regenerate") === "true" },
    );
    return NextResponse.json({ digest });
  } catch (err) {
    return errorResponse(err);
  }
}

// GET /api/v1/projects/[projectId]/pulse/export?date=
export async function exportPulseDigestHandler(request: Request, ctx: ProjectCtx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { projectId } = await ctx.params;
  const sp = new URL(request.url).searchParams;
  try {
    const data = await pulseService.exportDigest(projectId, user.id, sp.get("date") ?? undefined);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/projects/[projectId]/pulse/remind — body: { userId }
export async function sendPulseReminderHandler(request: Request, ctx: ProjectCtx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { projectId } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!body?.userId)
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  try {
    const result = await pulseService.sendReminder(projectId, body.userId, user.id);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

// GET /api/v1/projects/[projectId]/pulse/history
export async function getPulseHistoryHandler(_request: Request, ctx: ProjectCtx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { projectId } = await ctx.params;
  try {
    const data = await pulseService.getPulseHistory(projectId, user.id);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/projects/[projectId]/pulse/[pulseItemId]/respond — body: { response }
export async function respondToPulseBlockerHandler(request: Request, ctx: PulseItemCtx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { pulseItemId } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  try {
    const item = await pulseService.respondToBlocker(pulseItemId, body.response, user.id);
    return NextResponse.json({ item });
  } catch (err) {
    return errorResponse(err);
  }
}
