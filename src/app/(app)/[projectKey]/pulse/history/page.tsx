import { notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { pulseService } from "@/services/pulseService";
import { NotFoundError } from "@/services/boardService";
import { HistoryClient } from "@/components/pulse/HistoryClient";

export default async function PulseHistoryPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  const user = await getAuthedUser();
  if (!user) notFound();

  let data;
  try {
    data = await pulseService.getHistoryPageData(projectKey, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return <HistoryClient data={data} />;
}
