import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { workItemService } from "@/services/workItemService";
import { boardService, NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import { PermissionError } from "@/services/permissionService";

type Ctx = { params: Promise<{ id: string }> };

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
  console.error("work-item request failed:", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

async function parseJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// POST /api/v1/work-items — create a work item.
export async function createWorkItemHandler(request: Request) {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const body = await parseJson(request);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  try {
    const item = await workItemService.create({
      actorUserId: user.id,
      projectKey: body.projectKey,
      statusId: body.statusId,
      type: body.type,
      title: body.title,
      assigneeId: body.assigneeId ?? null,
      epicId: body.epicId ?? null,
      featureId: body.featureId ?? null,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/v1/work-items/[id] — inline-edit fields.
export async function updateWorkItemHandler(request: Request, ctx: Ctx) {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await parseJson(request);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  try {
    const item = await workItemService.update(id, body, user.id);
    return NextResponse.json({ item });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/v1/work-items/[id] — delete an item (PM only).
export async function deleteWorkItemHandler(request: Request, ctx: Ctx) {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    await workItemService.remove(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/work-items/bulk — bulk action over selected items.
export async function bulkWorkItemsHandler(request: Request) {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const body = await parseJson(request);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  try {
    const result = await workItemService.bulkUpdate({
      actorUserId: user.id,
      projectKey: body.projectKey,
      ids: body.ids ?? [],
      action: body.action,
      value: body.value ?? null,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/v1/work-items/[id]/status — move a card to another column.
export async function moveWorkItemHandler(request: Request, ctx: Ctx) {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await parseJson(request);
  if (!body?.statusId) {
    return NextResponse.json({ error: "statusId is required." }, { status: 400 });
  }

  try {
    const item = await boardService.moveCard(id, body.statusId, user.id);
    return NextResponse.json({ item });
  } catch (err) {
    return errorResponse(err);
  }
}
