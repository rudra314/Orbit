import { notFound, redirect } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { projectService } from "@/services/projectService";
import { auditService } from "@/services/auditService";
import { PermissionError } from "@/services/permissionService";
import { AuditClient } from "@/components/audit/AuditClient";

export default async function AuditPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  const user = await getAuthedUser();
  if (!user) notFound();

  const project = await projectService.getByKey(projectKey, user.id);
  if (!project) notFound();

  // PM/LEAD only — redirect everyone else back to the board.
  let initial;
  try {
    initial = await auditService.getForProject(project.id, user.id);
  } catch (err) {
    if (err instanceof PermissionError) redirect(`/${projectKey}/board`);
    throw err;
  }

  return (
    <AuditClient
      projectId={project.id}
      projectKey={projectKey}
      canExport={initial.canExport}
      actors={initial.actors}
      initialEntries={initial.entries}
      initialCursor={initial.nextCursor}
    />
  );
}
