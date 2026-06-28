import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import {
  projectService,
  ValidationError,
  type CreateProjectInput,
} from "@/services/projectService";
import { PermissionError } from "@/services/permissionService";

// Thin HTTP adapter: authenticate → parse → call service → respond.
// No business logic and no Prisma here.
export async function createProjectHandler(request: Request) {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: Omit<CreateProjectInput, "actorUserId">;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const project = await projectService.createProject({
      ...body,
      actorUserId: user.id,
    });
    return NextResponse.json(
      { projectKey: project.key, projectId: project.id },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("createProject failed:", err);
    return NextResponse.json(
      { error: "Something went wrong creating the project." },
      { status: 500 },
    );
  }
}
