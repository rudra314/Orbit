import { notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { pulseService } from "@/services/pulseService";
import { NotFoundError } from "@/services/boardService";
import { PulseClient } from "@/components/pulse/PulseClient";

export default async function PulsePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectKey: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { projectKey } = await params;
  const { date } = await searchParams;
  const user = await getAuthedUser();
  if (!user) notFound();

  let data;
  try {
    data = await pulseService.getPulsePageData(projectKey, user.id, date);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return <PulseClient data={data} currentUserName={user.name} />;
}
