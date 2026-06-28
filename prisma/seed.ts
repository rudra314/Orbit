import { PrismaClient, StatusCategory } from "@prisma/client";

const prisma = new PrismaClient();

// The default board columns applied to a new project's first workflow.
// The setup wizard (Step 3) uses the same set — keep them in sync.
const DEFAULT_WORKFLOW_STATUSES: {
  name: string;
  category: StatusCategory;
  color: string;
}[] = [
  { name: "Backlog", category: "NOT_STARTED", color: "#6B778C" },
  { name: "To Do", category: "NOT_STARTED", color: "#6B778C" },
  { name: "In Progress", category: "IN_PROGRESS", color: "#0052CC" },
  { name: "In Review", category: "IN_PROGRESS", color: "#FF8B00" },
  { name: "Done", category: "COMPLETED", color: "#0F6E56" },
];

async function main() {
  // 1. Default organization (Innominds)
  const org = await prisma.organization.upsert({
    where: { slug: "innominds" },
    update: {},
    create: {
      name: "Innominds",
      slug: "innominds",
      plan: "pilot",
    },
  });

  // 2. Admin user
  const admin = await prisma.user.upsert({
    where: { email: "raghuram@innominds.com" },
    update: {},
    create: {
      email: "raghuram@innominds.com",
      name: "Raghuram",
      provider: "magic_link",
    },
  });

  // Org membership — admin is the org owner
  await prisma.orgMember.upsert({
    where: { orgId_userId: { orgId: org.id, userId: admin.id } },
    update: { role: "OWNER" },
    create: { orgId: org.id, userId: admin.id, role: "OWNER" },
  });

  // 3. First project (the pilot) — gives the default workflow statuses a home,
  // since WorkflowStatus rows are per-project.
  const project = await prisma.project.upsert({
    where: { orgId_key: { orgId: org.id, key: "ORB" } },
    update: {},
    create: {
      orgId: org.id,
      name: "Orbit Pilot",
      key: "ORB",
      type: "INTERNAL",
      description: "Internal pilot project for the Orbit delivery team.",
    },
  });

  // Admin is the project PM
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: admin.id } },
    update: { role: "PM", discipline: "DELIVERY" },
    create: {
      projectId: project.id,
      userId: admin.id,
      role: "PM",
      discipline: "DELIVERY",
    },
  });

  // Default (disabled) AI config for the project
  await prisma.projectAiConfig.upsert({
    where: { projectId: project.id },
    update: {},
    create: {
      projectId: project.id,
      aiMode: "DISABLED",
      approvalRule: "PM_APPROVAL",
    },
  });

  // Default workflow statuses (board columns)
  for (const [index, status] of DEFAULT_WORKFLOW_STATUSES.entries()) {
    await prisma.workflowStatus.upsert({
      where: { projectId_name: { projectId: project.id, name: status.name } },
      update: { category: status.category, color: status.color, displayOrder: index },
      create: {
        projectId: project.id,
        name: status.name,
        category: status.category,
        color: status.color,
        displayOrder: index,
      },
    });
  }

  console.log(
    `Seeded: org "${org.name}", admin "${admin.email}", project "${project.name}" (${project.key}) with ${DEFAULT_WORKFLOW_STATUSES.length} workflow statuses.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
