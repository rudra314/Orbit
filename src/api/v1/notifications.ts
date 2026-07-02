import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { notificationService } from "@/services/notificationService";

function unauthenticated() {
  return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
}

function errorResponse(err: unknown) {
  console.error("notification request failed:", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

// GET /api/v1/notifications/unread-count
export async function unreadCountHandler() {
  const user = await getAuthedUser();
  if (!user) return unauthenticated();
  try {
    return NextResponse.json({ count: await notificationService.getUnread(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}

// GET /api/v1/notifications?projectId=&cursor=&limit=
export async function listNotificationsHandler(request: Request) {
  const user = await getAuthedUser();
  if (!user) return unauthenticated();
  const sp = new URL(request.url).searchParams;
  const limit = Number(sp.get("limit"));
  try {
    return NextResponse.json(
      await notificationService.getForUser(user.id, {
        projectId: sp.get("projectId") ?? undefined,
        cursor: sp.get("cursor") ?? undefined,
        limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      }),
    );
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/notifications/[id]/read
export async function markReadHandler(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getAuthedUser();
  if (!user) return unauthenticated();
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await notificationService.markRead(id, user.id));
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/notifications/read-all  { projectId? }
export async function markAllReadHandler(request: Request) {
  const user = await getAuthedUser();
  if (!user) return unauthenticated();
  let projectId: string | undefined;
  try {
    const body = await request.json();
    if (body && typeof body.projectId === "string") projectId = body.projectId;
  } catch {
    // no body — mark all of the user's notifications read
  }
  try {
    return NextResponse.json(
      await notificationService.markAllRead(user.id, projectId),
    );
  } catch (err) {
    return errorResponse(err);
  }
}
