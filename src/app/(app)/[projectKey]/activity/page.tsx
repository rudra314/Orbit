import { notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { boardService, NotFoundError } from "@/services/boardService";
import { ActivityClient } from "@/components/activity/ActivityClient";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  const user = await getAuthedUser();
  if (!user) notFound();

  let data;
  try {
    data = await boardService.getBoardData(projectKey, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return (
    <ActivityClient
      projectId={data.project.id}
      projectKey={data.project.key}
      columns={data.columns.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
      members={data.members.map((m) => ({ userId: m.userId, name: m.name }))}
      sprints={data.sprints.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
