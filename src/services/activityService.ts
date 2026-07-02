import {
  activityRepository,
  type ActivityRow,
} from "@/repositories/activityRepository";
import { workItemRepository } from "@/repositories/workItemRepository";
import { permissionService } from "@/services/permissionService";
import { NotFoundError } from "@/services/boardService";

const DEFAULT_LIMIT = 20;

// Project-feed filter categories → the activity_logs event types they cover.
// Drives the "by event type" filter; unmapped categories fall through to "all".
const CATEGORY_EVENTS: Record<string, string[]> = {
  status: ["status_changed", "work_item_created", "blocked_toggled"],
  comments: ["comment_added"],
  ai: ["ai_generation_approved"],
  sprint: ["sprint_assigned"],
  links: ["link_created"],
};

export type ActivityEvent = {
  id: string;
  eventType: string;
  createdAt: string;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
  workItem: { id: string; itemKey: string; title: string; type: string } | null;
  metadata: unknown;
};

export type ActivityPage = {
  events: ActivityEvent[];
  nextCursor: string | null;
};

function toEvent(row: ActivityRow): ActivityEvent {
  return {
    id: row.id,
    eventType: row.eventType,
    createdAt: row.createdAt.toISOString(),
    actor: row.user
      ? { id: row.user.id, name: row.user.name, avatarUrl: row.user.avatarUrl }
      : null,
    workItem: row.workItem
      ? {
          id: row.workItem.id,
          itemKey: row.workItem.itemKey,
          title: row.workItem.title,
          type: row.workItem.type,
        }
      : null,
    metadata: row.metadata ?? null,
  };
}

// Splits an over-fetched page (limit + 1) into the page plus a next cursor.
function paginate(rows: ActivityRow[], limit: number): ActivityPage {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  return {
    events: slice.map(toEvent),
    nextCursor: hasMore ? slice[slice.length - 1].id : null,
  };
}

export const activityService = {
  // Item-level history. Any project member (VIEWER included) may read.
  async getForWorkItem(
    workItemId: string,
    actorUserId: string,
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<ActivityPage> {
    const item = await workItemRepository.findProjectIdById(workItemId);
    if (!item) throw new NotFoundError("Work item not found.");
    await permissionService.assertProjectMember(actorUserId, item.projectId);

    const limit = opts.limit ?? DEFAULT_LIMIT;
    const rows = await activityRepository.listForWorkItem(workItemId, {
      limit,
      cursor: opts.cursor,
    });
    return paginate(rows, limit);
  },

  // Project-wide feed with filters. Any project member may read.
  async getForProject(
    projectId: string,
    actorUserId: string,
    filters: {
      category?: string;
      userId?: string;
      workItemType?: string;
      from?: string;
      to?: string;
    } = {},
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<ActivityPage & { hasAny: boolean }> {
    await permissionService.assertProjectMember(actorUserId, projectId);

    const limit = opts.limit ?? DEFAULT_LIMIT;
    const eventTypes =
      filters.category && CATEGORY_EVENTS[filters.category]
        ? CATEGORY_EVENTS[filters.category]
        : undefined;

    const rows = await activityRepository.listForProject(
      projectId,
      {
        eventTypes,
        userId: filters.userId || undefined,
        workItemType: filters.workItemType || undefined,
        from: filters.from ? new Date(filters.from) : undefined,
        to: filters.to ? new Date(filters.to) : undefined,
      },
      { limit, cursor: opts.cursor },
    );

    // Only run the (cheap) emptiness check on the first page so the UI can show
    // the "History begins here" marker.
    const hasAny = opts.cursor ? true : await activityRepository.hasAny(projectId);
    return { ...paginate(rows, limit), hasAny };
  },
};
