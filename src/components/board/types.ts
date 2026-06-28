// Plain, serializable types shared across the board client components.
// Mirror the DTOs returned by boardService (kept decoupled from server code).

export type WorkItemType = "STORY" | "BUG" | "TASK" | "SPIKE";
export type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type Severity = "BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "TRIVIAL";
export type Discipline =
  | "PRODUCT"
  | "UX"
  | "DEVELOPMENT"
  | "QE"
  | "DEVOPS"
  | "ARCHITECTURE"
  | "DELIVERY"
  | "OTHER";
export type VerificationStatus = "NOT_VERIFIED" | "VERIFIED" | "REOPENED";
export type StatusCategory =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type BoardColumn = {
  id: string;
  name: string;
  category: StatusCategory;
  color: string;
  displayOrder: number;
};

export type BoardMember = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  discipline: Discipline;
};

export type BoardSprint = {
  id: string;
  name: string;
  status: string;
};

export type BoardItem = {
  id: string;
  itemKey: string;
  type: WorkItemType;
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  edgeCases: string | null;
  businessValue: string | null;
  priority: Priority;
  severity: Severity | null;
  discipline: Discipline | null;
  storyPoints: number | null;
  estimatedHours: number | null;
  loggedHours: number;
  isBlocked: boolean;
  blockerReason: string | null;
  verificationStatus: VerificationStatus | null;
  statusId: string;
  sprintId: string | null;
  epicId: string | null;
  featureId: string | null;
  assigneeId: string | null;
  reporterId: string | null;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  stepsToReproduce: string | null;
  expectedResult: string | null;
  actualResult: string | null;
  environment: string | null;
  buildVersion: string | null;
  researchQuestion: string | null;
  timeBox: string | null;
  outcomeSummary: string | null;
  taskCategory: string | null;
  dueDate: string | null;
  createdAt: string;
  linkCount: number;
};

export type BoardData = {
  project: { id: string; key: string; name: string };
  columns: BoardColumn[];
  items: BoardItem[];
  members: BoardMember[];
  sprints: BoardSprint[];
  currentUserId: string;
  canEdit: boolean;
};
