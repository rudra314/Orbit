import { notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { boardService, NotFoundError } from "@/services/boardService";
import { BoardClient } from "@/components/board/BoardClient";
import type { BoardData } from "@/components/board/types";

export default async function BoardPage({
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

  return <BoardClient data={data as BoardData} />;
}
