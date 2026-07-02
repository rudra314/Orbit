import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { commentService } from "@/services/commentService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import { PermissionError } from "@/services/permissionService";

type ItemCtx = { params: Promise<{ id: string }> };
type CommentCtx = { params: Promise<{ id: string }> };

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
  console.error("comment request failed:", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

async function parseJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// GET /api/v1/work-items/[id]/comments
export async function listCommentsHandler(_request: Request, ctx: ItemCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const comments = await commentService.getByWorkItem(id, user.id);
    return NextResponse.json({ comments });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/work-items/[id]/comments
export async function createCommentHandler(request: Request, ctx: ItemCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  const body = await parseJson(request);
  if (!body || typeof body.body !== "string") {
    return NextResponse.json({ error: "A comment body is required." }, { status: 400 });
  }
  try {
    const comment = await commentService.create({
      workItemId: id,
      authorId: user.id,
      body: body.body,
      parentId: body.parentId ?? null,
      mentions: Array.isArray(body.mentions) ? body.mentions : [],
    });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/v1/comments/[id]
export async function updateCommentHandler(request: Request, ctx: CommentCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  const body = await parseJson(request);
  if (!body || typeof body.body !== "string") {
    return NextResponse.json({ error: "A comment body is required." }, { status: 400 });
  }
  try {
    const comment = await commentService.update(id, body.body, user.id);
    return NextResponse.json({ comment });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/v1/comments/[id]
export async function deleteCommentHandler(_request: Request, ctx: CommentCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await commentService.delete(id, user.id));
  } catch (err) {
    return errorResponse(err);
  }
}
