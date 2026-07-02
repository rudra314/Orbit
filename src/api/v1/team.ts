import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { teamService } from "@/services/teamService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import { PermissionError } from "@/services/permissionService";

type ProjectCtx = { params: Promise<{ projectId: string }> };
type MemberCtx = { params: Promise<{ projectId: string; userId: string }> };
type InviteCtx = { params: Promise<{ projectId: string; inviteId: string }> };

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
  console.error("team request failed:", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

async function parseJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function unauthed() {
  return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
}

// GET /api/v1/projects/[projectId]/team
export async function getTeamHandler(_request: Request, ctx: ProjectCtx) {
  const user = await getAuthedUser();
  if (!user) return unauthed();
  const { projectId } = await ctx.params;
  try {
    return NextResponse.json(await teamService.getTeam(projectId, user.id));
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/projects/[projectId]/team/invitations
export async function inviteHandler(request: Request, ctx: ProjectCtx) {
  const user = await getAuthedUser();
  if (!user) return unauthed();
  const { projectId } = await ctx.params;
  const body = await parseJson(request);
  if (!body) return NextResponse.json({ error: "Body required." }, { status: 400 });
  try {
    const invite = await teamService.invite(user.id, projectId, {
      email: body.email,
      role: body.role,
      discipline: body.discipline,
      message: body.message ?? null,
      origin: new URL(request.url).origin,
    });
    return NextResponse.json({ invite }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/v1/projects/[projectId]/team/[userId]  { role?, discipline? }
export async function updateMemberHandler(request: Request, ctx: MemberCtx) {
  const user = await getAuthedUser();
  if (!user) return unauthed();
  const { projectId, userId } = await ctx.params;
  const body = await parseJson(request);
  if (!body) return NextResponse.json({ error: "Body required." }, { status: 400 });
  try {
    if (typeof body.role === "string") {
      return NextResponse.json(
        await teamService.changeRole(user.id, projectId, userId, body.role),
      );
    }
    if (typeof body.discipline === "string") {
      return NextResponse.json(
        await teamService.changeDiscipline(
          user.id,
          projectId,
          userId,
          body.discipline,
        ),
      );
    }
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/v1/projects/[projectId]/team/[userId]
export async function removeMemberHandler(_request: Request, ctx: MemberCtx) {
  const user = await getAuthedUser();
  if (!user) return unauthed();
  const { projectId, userId } = await ctx.params;
  try {
    return NextResponse.json(
      await teamService.removeMember(user.id, projectId, userId),
    );
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/projects/[projectId]/team/invitations/[inviteId]/resend
export async function resendInviteHandler(request: Request, ctx: InviteCtx) {
  const user = await getAuthedUser();
  if (!user) return unauthed();
  const { projectId, inviteId } = await ctx.params;
  try {
    return NextResponse.json(
      await teamService.resendInvite(
        user.id,
        projectId,
        inviteId,
        new URL(request.url).origin,
      ),
    );
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/v1/projects/[projectId]/team/invitations/[inviteId]
export async function cancelInviteHandler(_request: Request, ctx: InviteCtx) {
  const user = await getAuthedUser();
  if (!user) return unauthed();
  const { projectId, inviteId } = await ctx.params;
  try {
    return NextResponse.json(
      await teamService.cancelInvite(user.id, projectId, inviteId),
    );
  } catch (err) {
    return errorResponse(err);
  }
}
