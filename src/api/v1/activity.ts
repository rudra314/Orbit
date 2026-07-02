import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { activityService } from "@/services/activityService";
import { NotFoundError } from "@/services/boardService";
import { PermissionError } from "@/services/permissionService";

type ItemCtx = { params: Promise<{ id: string }> };
type ProjectCtx = { params: Promise<{ projectId: string }> };

function errorResponse(err: unknown) {
  if (err instanceof PermissionError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  console.error("activity request failed:", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

// GET /api/v1/work-items/[id]/activity?cursor=...
export async function workItemActivityHandler(request: Request, ctx: ItemCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  try {
    return NextResponse.json(
      await activityService.getForWorkItem(id, user.id, { cursor }),
    );
  } catch (err) {
    return errorResponse(err);
  }
}

// GET /api/v1/projects/[projectId]/activity?category=&userId=&workItemType=&from=&to=&cursor=
export async function projectActivityHandler(request: Request, ctx: ProjectCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { projectId } = await ctx.params;
  const sp = new URL(request.url).searchParams;
  try {
    return NextResponse.json(
      await activityService.getForProject(
        projectId,
        user.id,
        {
          category: sp.get("category") ?? undefined,
          userId: sp.get("userId") ?? undefined,
          workItemType: sp.get("workItemType") ?? undefined,
          from: sp.get("from") ?? undefined,
          to: sp.get("to") ?? undefined,
        },
        { cursor: sp.get("cursor") ?? undefined },
      ),
    );
  } catch (err) {
    return errorResponse(err);
  }
}
