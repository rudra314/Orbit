import { notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { backlogService } from "@/services/backlogService";
import { NotFoundError } from "@/services/boardService";
import { BacklogClient } from "@/components/backlog/BacklogClient";
import type { BacklogData } from "@/components/backlog/types";

export default async function BacklogPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  const user = await getAuthedUser();
  if (!user) notFound();

  let data;
  try {
    data = await backlogService.getBacklogData(projectKey, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return <BacklogClient data={data as BacklogData} />;
}
