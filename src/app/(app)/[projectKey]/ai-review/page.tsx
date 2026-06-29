import { notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { aiService } from "@/services/aiService";
import { NotFoundError } from "@/services/boardService";
import { AiReviewClient } from "@/components/ai/AiReviewClient";
import type { GenerationSummary } from "@/components/ai/types";

export default async function AiReviewPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  const user = await getAuthedUser();
  if (!user) notFound();

  let data;
  try {
    data = await aiService.getReviewQueue(projectKey, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return (
    <AiReviewClient
      projectId={data.project.id}
      canUseAi={data.canUseAi}
      generations={data.generations as GenerationSummary[]}
    />
  );
}
