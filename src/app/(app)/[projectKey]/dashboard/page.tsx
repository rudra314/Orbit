import { notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { dashboardService } from "@/services/dashboardService";
import { NotFoundError } from "@/services/boardService";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  const user = await getAuthedUser();
  if (!user) notFound();

  let data;
  try {
    data = await dashboardService.getPageData(projectKey, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return (
    <DashboardClient projectId={data.project.id} initialData={data.data} />
  );
}
