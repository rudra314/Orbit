import { notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { reportService } from "@/services/reportService";
import { NotFoundError } from "@/services/boardService";
import { ReportsClient } from "@/components/reports/ReportsClient";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  const user = await getAuthedUser();
  if (!user) notFound();

  let data;
  try {
    data = await reportService.getPageData(projectKey, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return (
    <ReportsClient
      projectId={data.project.id}
      initialReports={data.reports}
      canManage={data.canManage}
    />
  );
}
