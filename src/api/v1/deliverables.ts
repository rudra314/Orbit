import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { deliverableService } from "@/services/deliverableService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import { PermissionError } from "@/services/permissionService";

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
  console.error("deliverable request failed:", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

async function parseJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// POST /api/v1/deliverables
export async function createDeliverableHandler(request: Request) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const body = await parseJson(request);
  if (!body?.projectKey || !body?.name) {
    return NextResponse.json(
      { error: "projectKey and name are required." },
      { status: 400 },
    );
  }
  try {
    const deliverable = await deliverableService.create({
      actorUserId: user.id,
      projectKey: body.projectKey,
      name: body.name,
      owner: body.owner,
      description: body.description,
      status: body.status,
      dueDate: body.dueDate,
      artifactUrl: body.artifactUrl,
      notes: body.notes,
    });
    return NextResponse.json({ deliverable }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/v1/deliverables/[id]
export async function updateDeliverableHandler(request: Request, ctx: IdCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  const body = await parseJson(request);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  try {
    const deliverable = await deliverableService.update(id, body, user.id);
    return NextResponse.json({ deliverable });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/v1/deliverables/[id]
export async function deleteDeliverableHandler(_request: Request, ctx: IdCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await deliverableService.remove(id, user.id));
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/deliverables/[id]/deliver
export async function deliverDeliverableHandler(_request: Request, ctx: IdCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const deliverable = await deliverableService.markDelivered(id, user.id);
    return NextResponse.json({ deliverable });
  } catch (err) {
    return errorResponse(err);
  }
}
