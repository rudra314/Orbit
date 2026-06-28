import { notFound, redirect } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { projectService } from "@/services/projectService";
import { Sidebar } from "@/components/app/Sidebar";
import { Topbar } from "@/components/app/Topbar";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;

  const user = await getAuthedUser();
  if (!user) redirect("/login");

  // Membership is enforced in the query — non-members get a 404.
  const project = await projectService.getByKey(projectKey, user.id);
  if (!project) notFound();

  const projects = await projectService.listForUser(user.id);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        currentKey={projectKey}
        projects={projects.map((p) => ({
          key: p.key,
          name: p.name,
          accentColor: p.accentColor,
        }))}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar user={{ name: user.name, email: user.email }} />
        <main className="flex-1 overflow-auto bg-background">{children}</main>
      </div>
    </div>
  );
}
