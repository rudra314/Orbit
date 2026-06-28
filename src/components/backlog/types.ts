import type {
  BoardColumn,
  BoardItem,
  BoardMember,
  BoardSprint,
} from "@/components/board/types";

export type RollupStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export type FeatureRollup = {
  id: string;
  title: string;
  total: number;
  done: number;
  status: RollupStatus;
};

export type EpicWithStats = {
  id: string;
  title: string;
  description: string | null;
  status: RollupStatus;
  startDate: string | null;
  targetDate: string | null;
  total: number;
  done: number;
  completionPct: number;
  features: FeatureRollup[];
};

export type BacklogData = {
  project: { id: string; key: string; name: string };
  epics: EpicWithStats[];
  items: BoardItem[];
  columns: BoardColumn[];
  members: BoardMember[];
  sprints: BoardSprint[];
  currentUserId: string;
  canEdit: boolean;
  canDelete: boolean;
};

export const ROLLUP_META: Record<RollupStatus, { label: string; color: string }> =
  {
    NOT_STARTED: { label: "Not started", color: "#6B778C" },
    IN_PROGRESS: { label: "In progress", color: "#0052CC" },
    COMPLETED: { label: "Completed", color: "#0F6E56" },
  };
