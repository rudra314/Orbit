// Placeholder for project sections not yet implemented (backlog, sprints,
// deliverables, documents, reports, dashboard, activity, settings).
export default async function SectionPlaceholder({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const title = section.charAt(0).toUpperCase() + section.slice(1);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">
        This section isn&apos;t built yet — coming in a future session.
      </p>
    </div>
  );
}
