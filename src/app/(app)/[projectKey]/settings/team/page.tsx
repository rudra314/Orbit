import { notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { projectService } from "@/services/projectService";
import { teamService } from "@/services/teamService";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { TeamSettingsClient } from "@/components/settings/TeamSettingsClient";

export default async function TeamSettingsPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  const user = await getAuthedUser();
  if (!user) notFound();

  const project = await projectService.getByKey(projectKey, user.id);
  if (!project) notFound();

  const team = await teamService.getTeam(project.id, user.id);

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4">
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
      </div>
      <SettingsNav projectKey={projectKey} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <TeamSettingsClient
          projectId={project.id}
          currentUserId={user.id}
          initial={team}
        />
      </div>
    </div>
  );
}
