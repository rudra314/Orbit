import { prisma } from "@/repositories/prisma";
import { pulseRepository } from "@/repositories/pulseRepository";
import type { NewNotification } from "@/repositories/notificationRepository";

// Outbox event types this worker turns into notifications.
export const NOTIFICATION_EVENT_TYPES = [
  "comment_added",
  "status_changed",
  "work_item_created",
  "link_created",
  "ai_generation_approved",
  "sprint_started",
  "sprint_completed",
  "blocker_flagged",
  "dm_responded",
  "pulse_reminder_check",
] as const;

type Payload = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const ids = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

const itemLink = (key: string, workItemId: string) =>
  `/${key}/board?item=${workItemId}`;

async function projectKey(projectId: string): Promise<string | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { key: true },
  });
  return p?.key ?? null;
}

async function actorName(actorUserId: string | null): Promise<string> {
  if (!actorUserId) return "Someone";
  const u = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { name: true },
  });
  return u?.name ?? "Someone";
}

// Each handler turns one outbox payload into the notification rows to write.
// The actor is never notified about their own action.

async function onComment(p: Payload): Promise<NewNotification[]> {
  const projectId = str(p.projectId);
  const workItemId = str(p.workItemId);
  const actorUserId = str(p.actorUserId);
  if (!projectId || !workItemId) return [];

  const recipients = ids(p.notifyUserIds);
  if (recipients.length === 0) return [];
  const mentioned = new Set(ids(p.mentions));

  const [key, name, item] = await Promise.all([
    projectKey(projectId),
    actorName(actorUserId),
    prisma.workItem.findUnique({
      where: { id: workItemId },
      select: { itemKey: true },
    }),
  ]);
  if (!key || !item) return [];

  return recipients.map((userId) => {
    const isMention = mentioned.has(userId);
    return {
      userId,
      projectId,
      type: isMention ? "mentioned" : "commented",
      title: isMention
        ? `${name} mentioned you in ${item.itemKey}`
        : `${name} commented on ${item.itemKey}`,
      body: null,
      link: itemLink(key, workItemId),
    };
  });
}

async function onStatusChanged(p: Payload): Promise<NewNotification[]> {
  const projectId = str(p.projectId);
  const workItemId = str(p.workItemId);
  const toStatusId = str(p.toStatusId);
  const actorUserId = str(p.actorUserId);
  if (!projectId || !workItemId || !toStatusId) return [];

  const status = await prisma.workflowStatus.findUnique({
    where: { id: toStatusId },
    select: { category: true },
  });
  // Only notify when the item actually moved into a Done column.
  if (status?.category !== "COMPLETED") return [];

  const item = await prisma.workItem.findUnique({
    where: { id: workItemId },
    select: { itemKey: true, reporterId: true },
  });
  if (!item?.reporterId || item.reporterId === actorUserId) return [];

  const key = await projectKey(projectId);
  if (!key) return [];

  return [
    {
      userId: item.reporterId,
      projectId,
      type: "status_done",
      title: `${item.itemKey} was completed`,
      body: null,
      link: itemLink(key, workItemId),
    },
  ];
}

async function onWorkItemCreated(p: Payload): Promise<NewNotification[]> {
  const projectId = str(p.projectId);
  const workItemId = str(p.workItemId);
  const actorUserId = str(p.actorUserId);
  if (!projectId || !workItemId) return [];

  const item = await prisma.workItem.findUnique({
    where: { id: workItemId },
    select: { itemKey: true, title: true, assigneeId: true },
  });
  if (!item?.assigneeId || item.assigneeId === actorUserId) return [];

  const key = await projectKey(projectId);
  if (!key) return [];

  return [
    {
      userId: item.assigneeId,
      projectId,
      type: "assigned",
      title: `You were assigned ${item.itemKey}: ${item.title}`,
      body: null,
      link: itemLink(key, workItemId),
    },
  ];
}

async function onLinkCreated(p: Payload): Promise<NewNotification[]> {
  const sourceItemId = str(p.sourceItemId);
  const targetItemId = str(p.targetItemId);
  const actorUserId = str(p.actorUserId);
  if (!sourceItemId || !targetItemId) return [];

  const [source, target] = await Promise.all([
    prisma.workItem.findUnique({
      where: { id: sourceItemId },
      select: { itemKey: true, type: true },
    }),
    prisma.workItem.findUnique({
      where: { id: targetItemId },
      select: { itemKey: true, assigneeId: true, projectId: true },
    }),
  ]);
  // Only the "a bug was linked to your story" case fires a notification.
  if (source?.type !== "BUG" || !target?.assigneeId) return [];
  if (target.assigneeId === actorUserId) return [];

  const key = await projectKey(target.projectId);
  if (!key) return [];

  return [
    {
      userId: target.assigneeId,
      projectId: target.projectId,
      type: "bug_linked",
      title: `Bug ${source.itemKey} was linked to your story ${target.itemKey}`,
      body: null,
      link: itemLink(key, targetItemId),
    },
  ];
}

async function onAiApproved(p: Payload): Promise<NewNotification[]> {
  const projectId = str(p.projectId);
  const actorUserId = str(p.actorUserId);
  if (!projectId) return [];

  const counts = (p.counts ?? {}) as Record<string, number>;
  const total =
    (counts.epics ?? 0) +
    (counts.features ?? 0) +
    (counts.stories ?? 0) +
    (counts.testCases ?? 0);

  const [key, pms] = await Promise.all([
    projectKey(projectId),
    prisma.projectMember.findMany({
      where: { projectId, role: "PM" },
      select: { userId: true },
    }),
  ]);
  if (!key) return [];

  return pms
    .map((m) => m.userId)
    .filter((userId) => userId !== actorUserId)
    .map((userId) => ({
      userId,
      projectId,
      type: "ai_review",
      title: `AI generated ${total} item${total === 1 ? "" : "s"} — review needed`,
      body: null,
      link: `/${key}/ai-review`,
    }));
}

async function onSprintStarted(p: Payload): Promise<NewNotification[]> {
  const projectId = str(p.projectId);
  const sprintId = str(p.sprintId);
  const actorUserId = str(p.actorUserId);
  if (!projectId || !sprintId) return [];

  const [key, sprint, members] = await Promise.all([
    projectKey(projectId),
    prisma.sprint.findUnique({ where: { id: sprintId }, select: { name: true } }),
    prisma.workItem.findMany({
      where: { sprintId, assigneeId: { not: null } },
      select: { assigneeId: true },
      distinct: ["assigneeId"],
    }),
  ]);
  if (!key || !sprint) return [];

  return members
    .map((m) => m.assigneeId)
    .filter((userId): userId is string => !!userId && userId !== actorUserId)
    .map((userId) => ({
      userId,
      projectId,
      type: "sprint_started",
      title: `Sprint ${sprint.name} has started`,
      body: null,
      link: `/${key}/sprints`,
    }));
}

async function onSprintCompleted(p: Payload): Promise<NewNotification[]> {
  const projectId = str(p.projectId);
  const sprintId = str(p.sprintId);
  const actorUserId = str(p.actorUserId);
  if (!projectId || !sprintId) return [];

  const [key, sprint, leads] = await Promise.all([
    projectKey(projectId),
    prisma.sprint.findUnique({ where: { id: sprintId }, select: { name: true } }),
    prisma.projectMember.findMany({
      where: { projectId, role: { in: ["PM", "LEAD"] } },
      select: { userId: true },
    }),
  ]);
  if (!key || !sprint) return [];

  return leads
    .map((m) => m.userId)
    .filter((userId) => userId !== actorUserId)
    .map((userId) => ({
      userId,
      projectId,
      type: "sprint_completed",
      title: `Sprint ${sprint.name} completed`,
      body: null,
      link: `/${key}/sprints`,
    }));
}

async function onBlockerFlagged(p: Payload): Promise<NewNotification[]> {
  const projectId = str(p.projectId);
  const workItemId = str(p.workItemId);
  const actorUserId = str(p.actorUserId);
  const blockerDetail = str(p.blockerDetail) ?? "";
  if (!projectId || !workItemId) return [];

  const [key, name, item, pms] = await Promise.all([
    projectKey(projectId),
    actorName(actorUserId),
    prisma.workItem.findUnique({ where: { id: workItemId }, select: { itemKey: true } }),
    prisma.projectMember.findMany({
      where: { projectId, role: "PM" },
      select: { userId: true },
    }),
  ]);
  if (!key || !item) return [];

  return pms
    .map((m) => m.userId)
    .filter((userId) => userId !== actorUserId)
    .map((userId) => ({
      userId,
      projectId,
      type: "blocker_flagged",
      title: `${name} flagged a blocker on ${item.itemKey}`,
      body: blockerDetail.slice(0, 100),
      link: `/${key}/pulse/digest`,
    }));
}

async function onDmResponded(p: Payload): Promise<NewNotification[]> {
  const projectId = str(p.projectId);
  const recipientUserId = str(p.recipientUserId);
  const actorUserId = str(p.actorUserId);
  const response = str(p.response) ?? "";
  if (!projectId || !recipientUserId || recipientUserId === actorUserId) return [];

  const [key, name] = await Promise.all([projectKey(projectId), actorName(actorUserId)]);
  if (!key) return [];

  return [
    {
      userId: recipientUserId,
      projectId,
      type: "dm_responded",
      title: `${name} responded to your blocker`,
      body: response.slice(0, 100),
      link: `/${key}/pulse`,
    },
  ];
}

async function onPulseReminderCheck(p: Payload): Promise<NewNotification[]> {
  const projectId = str(p.projectId);
  if (!projectId) return [];

  const key = await projectKey(projectId);
  if (!key) return [];

  const now = new Date();
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const unsubmitted = await pulseRepository.getUnsubmittedMembers(projectId, date);

  return unsubmitted.map((m) => ({
    userId: m.userId,
    projectId,
    type: "pulse_reminder",
    title: "Daily pulse reminder",
    body: "Submit your daily pulse for today — takes under 2 minutes.",
    link: `/${key}/pulse`,
  }));
}

const HANDLERS: Record<string, (p: Payload) => Promise<NewNotification[]>> = {
  comment_added: onComment,
  status_changed: onStatusChanged,
  work_item_created: onWorkItemCreated,
  link_created: onLinkCreated,
  ai_generation_approved: onAiApproved,
  sprint_started: onSprintStarted,
  sprint_completed: onSprintCompleted,
  blocker_flagged: onBlockerFlagged,
  dm_responded: onDmResponded,
  pulse_reminder_check: onPulseReminderCheck,
};

// Maps one outbox event to the notification rows it produces. Returns [] for
// event types this worker doesn't handle.
export function buildNotifications(
  eventType: string,
  payload: unknown,
): Promise<NewNotification[]> {
  const handler = HANDLERS[eventType];
  if (!handler) return Promise.resolve([]);
  return handler((payload ?? {}) as Payload);
}
