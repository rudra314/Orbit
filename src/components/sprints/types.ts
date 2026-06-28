import type {
  BoardColumn,
  BoardItem,
  BoardMember,
} from "@/components/board/types";

export type SprintStatus = "PLANNING" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export type SprintDTO = {
  id: string;
  name: string;
  status: SprintStatus;
  startDate: string | null;
  endDate: string | null;
  goal: string | null;
};

export type SprintsData = {
  project: { id: string; key: string; name: string };
  sprints: SprintDTO[];
  items: BoardItem[];
  columns: BoardColumn[];
  members: BoardMember[];
  currentUserId: string;
  canEdit: boolean;
  canManage: boolean;
};

export type Capacity = {
  total: number;
  done: number;
  points: number;
  donePoints: number;
  hours: number;
};
