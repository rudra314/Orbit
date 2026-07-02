import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { auditService } from "@/services/auditService";
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
  console.error("audit request failed:", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

function filtersFrom(sp: URLSearchParams) {
  return {
    action: sp.get("action") ?? undefined,
    userId: sp.get("userId") ?? undefined,
    entityType: sp.get("entityType") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  };
}

// GET /api/v1/projects/[projectId]/audit?action=&userId=&entityType=&from=&to=&cursor=
export async function listAuditHandler(request: Request, ctx: ProjectCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { projectId } = await ctx.params;
  const sp = new URL(request.url).searchParams;
  try {
    return NextResponse.json(
      await auditService.getForProject(projectId, user.id, filtersFrom(sp), {
        cursor: sp.get("cursor") ?? undefined,
      }),
    );
  } catch (err) {
    return errorResponse(err);
  }
}

// GET /api/v1/projects/[projectId]/audit/export?format=csv&...filters
export async function exportAuditHandler(request: Request, ctx: ProjectCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { projectId } = await ctx.params;
  const sp = new URL(request.url).searchParams;
  try {
    const csv = await auditService.exportCsv(projectId, user.id, filtersFrom(sp));
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-log.csv"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
