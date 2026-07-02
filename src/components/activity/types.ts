// Plain, serializable shapes returned by activityService, plus the project
// context the feed uses to resolve ids (status/assignee/sprint) to names.

export type ActivityActor = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export type ActivityWorkItem = {
  id: string;
  itemKey: string;
  title: string;
  type: string;
};

export type ActivityEvent = {
  id: string;
  eventType: string;
  createdAt: string;
  actor: ActivityActor | null;
  workItem: ActivityWorkItem | null;
  metadata: unknown;
};

export type ActivityPage = {
  events: ActivityEvent[];
  nextCursor: string | null;
};

// Lookup maps so the renderer can turn stored ids into current names/colors.
export type ActivityContext = {
  statuses: Record<string, { name: string; color: string }>;
  members: Record<string, string>;
  sprints: Record<string, string>;
};
