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

export type LinkType =
  | "RELATES_TO"
  | "BLOCKS"
  | "IS_BLOCKED_BY"
  | "CAUSES"
  | "IS_CAUSED_BY"
  | "DUPLICATES"
  | "IS_DUPLICATED_BY"
  | "FOUND_IN"
  | "TESTED_BY"
  | "DEPENDS_ON";

export type LinkedItem = {
  id: string;
  itemKey: string;
  type: WorkItemType;
  title: string;
  statusName: string;
  statusColor: string;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
};

export type LinkDto = {
  id: string;
  linkType: LinkType;
  direction: "out" | "in";
  item: LinkedItem;
};

export type LinkSearchResult = {
  id: string;
  itemKey: string;
  type: WorkItemType;
  title: string;
};

export type TestType = "MANUAL" | "AUTOMATED";
export type TestCaseStatus = "DRAFT" | "ACTIVE" | "REJECTED" | "DEPRECATED";

export type TestStep = {
  stepNumber: number;
  action: string;
  expectedResult: string;
};

export type TestCaseDto = {
  id: string;
  title: string;
  preconditions: string | null;
  steps: TestStep[];
  expectedResult: string | null;
  testType: TestType;
  priority: Priority;
  status: TestCaseStatus;
  aiGenerationId: string | null;
  sortOrder: number;
  createdByName: string | null;
  createdAt: string;
  approvedAt: string | null;
};

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
