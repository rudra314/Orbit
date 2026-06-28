import { notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { sprintService } from "@/services/sprintService";
import { NotFoundError } from "@/services/boardService";
import { SprintsClient } from "@/components/sprints/SprintsClient";
import type { SprintsData } from "@/components/sprints/types";

export default async function SprintsPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  const user = await getAuthedUser();
  if (!user) notFound();

  let data;
  try {
    data = await sprintService.getSprintsData(projectKey, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return <SprintsClient data={data as SprintsData} />;
}
