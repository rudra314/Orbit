import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { linkService } from "@/services/linkService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import { PermissionError } from "@/services/permissionService";
import type { LinkType } from "@prisma/client";

type ItemCtx = { params: Promise<{ id: string }> };
type LinkCtx = { params: Promise<{ id: string; linkId: string }> };

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
  console.error("link request failed:", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

async function parseJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// GET /api/v1/work-items/[id]/links
export async function listLinksHandler(_request: Request, ctx: ItemCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await linkService.getLinks(id, user.id));
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/work-items/[id]/links
export async function createLinkHandler(request: Request, ctx: ItemCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  const body = await parseJson(request);
  if (!body?.targetItemId || !body?.linkType) {
    return NextResponse.json(
      { error: "targetItemId and linkType are required." },
      { status: 400 },
    );
  }
  try {
    const result = await linkService.createLink({
      actorUserId: user.id,
      sourceItemId: id,
      targetItemId: body.targetItemId,
      linkType: body.linkType as LinkType,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/v1/work-items/[id]/links/[linkId]
export async function removeLinkHandler(_request: Request, ctx: LinkCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { linkId } = await ctx.params;
  try {
    return NextResponse.json(await linkService.removeLink(linkId, user.id));
  } catch (err) {
    return errorResponse(err);
  }
}

// GET /api/v1/work-items/[id]/link-search?q=...
export async function searchLinkTargetsHandler(request: Request, ctx: ItemCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await ctx.params;
  const query = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json(
      await linkService.searchItems({ actorUserId: user.id, itemId: id, query }),
    );
  } catch (err) {
    return errorResponse(err);
  }
}
