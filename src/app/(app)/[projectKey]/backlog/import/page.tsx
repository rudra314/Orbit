import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { importService } from "@/services/importService";
import { NotFoundError } from "@/services/boardService";
import { ImportWizard } from "@/components/backlog/import/ImportWizard";

export default async function ImportPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  const user = await getAuthedUser();
  if (!user) notFound();

  let ctx;
  try {
    ctx = await importService.getPageContext(projectKey, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  if (!ctx.canImport) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <h2 className="text-lg font-semibold text-foreground">Import unavailable</h2>
        <p className="text-sm text-muted-foreground">
          Only the project PM or Lead can import items.
        </p>
        <Link
          href={`/${projectKey}/backlog`}
          className="mt-2 text-sm text-primary hover:underline"
        >
          ← Back to backlog
        </Link>
      </div>
    );
  }

  return (
    <ImportWizard
      projectId={ctx.project.id}
      projectKey={ctx.project.key}
      projectName={ctx.project.name}
    />
  );
}
