import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { dashboardService } from "@/services/dashboardService";
import { NotFoundError } from "@/services/boardService";
import { PermissionError } from "@/services/permissionService";

type ProjectCtx = { params: Promise<{ projectId: string }> };

function errorResponse(err: unknown) {
  if (err instanceof PermissionError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  console.error("dashboard request failed:", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

// GET /api/v1/projects/[projectId]/dashboard — widget data for the auto-refresh poll.
export async function getDashboardHandler(_request: Request, ctx: ProjectCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { projectId } = await ctx.params;
  try {
    const data = await dashboardService.getDashboardData(projectId, user.id);
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}
