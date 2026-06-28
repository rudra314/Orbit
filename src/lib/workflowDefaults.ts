import type { StatusCategory } from "@prisma/client";

// Default board columns for a new project. Shared by the seed, the setup
// wizard (Step 3), and the project service. Type-only import — no runtime
// Prisma dependency, safe to import in client components.
export type WorkflowStatusInput = {
  name: string;
  category: StatusCategory;
  color: string;
};

export const DEFAULT_WORKFLOW_STATUSES: WorkflowStatusInput[] = [
  { name: "Backlog", category: "NOT_STARTED", color: "#6B778C" },
  { name: "To Do", category: "NOT_STARTED", color: "#6B778C" },
  { name: "In Progress", category: "IN_PROGRESS", color: "#0052CC" },
  { name: "In Review", category: "IN_PROGRESS", color: "#FF8B00" },
  { name: "Done", category: "COMPLETED", color: "#0F6E56" },
];
