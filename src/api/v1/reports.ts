import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { reportService } from "@/services/reportService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import { PermissionError } from "@/services/permissionService";

type ProjectCtx = { params: Promise<{ projectId: string }> };
type IdCtx = { params: Promise<{ id: string }> };

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
  console.error("report request failed:", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

async function parseJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// POST /api/v1/projects/[projectId]/reports — generate a new draft report.
export async function generateReportHandler(_request: Request, ctx: ProjectCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { projectId } = await ctx.params;
  try {
    const report = await reportService.generate({
      actorUserId: user.id,
      projectId,
    });
    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

// GET /api/v1/reports/[id] — view a single report.
export async function getReportHandler(_request: Request, ctx: IdCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const report = await reportService.getReport(id, user.id);
    return NextResponse.json({ report });
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/v1/reports/[id] — save draft edits.
export async function updateReportHandler(request: Request, ctx: IdCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  const body = await parseJson(request);
  if (!body?.content) {
    return NextResponse.json({ error: "content is required." }, { status: 400 });
  }
  try {
    const report = await reportService.updateContent(id, body.content, user.id);
    return NextResponse.json({ report });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/reports/[id]/approve — persist edits and approve.
export async function approveReportHandler(request: Request, ctx: IdCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  const body = await parseJson(request);
  if (!body?.content) {
    return NextResponse.json({ error: "content is required." }, { status: 400 });
  }
  try {
    const report = await reportService.approve(id, body.content, user.id);
    return NextResponse.json({ report });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/reports/[id]/archive — archive a report.
export async function archiveReportHandler(_request: Request, ctx: IdCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const report = await reportService.archive(id, user.id);
    return NextResponse.json({ report });
  } catch (err) {
    return errorResponse(err);
  }
}
