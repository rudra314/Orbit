import { notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { pulseService } from "@/services/pulseService";
import { NotFoundError } from "@/services/boardService";
import { DigestClient } from "@/components/pulse/DigestClient";

export default async function PulseDigestPage({
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
    data = await pulseService.getDigestPageData(projectKey, user.id, date);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return <DigestClient initialData={data} />;
}
