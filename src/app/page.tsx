import { redirect } from "next/navigation";
import { getAuthedUser } from "@/lib/auth";
import { projectService } from "@/services/projectService";

// Entry point: send the user to their first project's board, or to the
// setup wizard if they have no projects yet.
export default async function Home() {
  const user = await getAuthedUser();
  if (!user) redirect("/login");

  const projects = await projectService.listForUser(user.id);
  if (projects.length === 0) redirect("/setup/new");

  redirect(`/${projects[0].key}/board`);
}
