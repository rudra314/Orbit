import { notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { pulseService } from "@/services/pulseService";
import { NotFoundError } from "@/services/boardService";
import { PulseClient } from "@/components/pulse/PulseClient";

export default async function PulsePage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  const user = await getAuthedUser();
  if (!user) notFound();

  let data;
  try {
    data = await pulseService.getPulsePageData(projectKey, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return <PulseClient data={data} currentUserName={user.name} />;
}
