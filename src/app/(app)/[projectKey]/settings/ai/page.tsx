import { notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { settingsService } from "@/services/settingsService";
import { NotFoundError } from "@/services/boardService";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { AiSettingsClient } from "@/components/settings/AiSettingsClient";

export default async function AiSettingsPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  const user = await getAuthedUser();
  if (!user) notFound();

  let data;
  try {
    data = await settingsService.getSettings(projectKey, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4">
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
      </div>
      <SettingsNav projectKey={projectKey} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <AiSettingsClient
          projectId={data.general.id}
          ai={data.ai}
          canEdit={data.viewerRole === "PM"}
        />
      </div>
    </div>
  );
}
