import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { epicService } from "@/services/epicService";
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
  console.error("epic request failed:", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

export async function createEpicHandler(request: Request) {
  const user = await getAuthedUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  try {
    const epic = await epicService.create({
      actorUserId: user.id,
      projectKey: body.projectKey,
      title: body.title,
      description: body.description ?? null,
      targetDate: body.targetDate ?? null,
    });
    return NextResponse.json({ epic }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function updateEpicHandler(request: Request, ctx: Ctx) {
  const user = await getAuthedUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  try {
    const epic = await epicService.update(id, body, user.id);
    return NextResponse.json({ epic });
  } catch (err) {
    return errorResponse(err);
  }
}
