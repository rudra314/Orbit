import { notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { deliverableService } from "@/services/deliverableService";
import { NotFoundError } from "@/services/boardService";
import { DeliverablesClient } from "@/components/deliverables/DeliverablesClient";

export default async function DeliverablesPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  const user = await getAuthedUser();
  if (!user) notFound();

  let data;
  try {
    data = await deliverableService.getPageData(projectKey, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return (
    <DeliverablesClient
      projectKey={data.project.key}
      initialDeliverables={data.deliverables}
      members={data.members}
      canManage={data.canManage}
      canMarkDelivered={data.canMarkDelivered}
    />
  );
}
