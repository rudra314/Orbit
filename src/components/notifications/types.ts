export type NotificationDto = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export type NotificationPage = {
  notifications: NotificationDto[];
  nextCursor: string | null;
};

// One glyph per notification type (see notificationWorker for producers).
const ICONS: Record<string, string> = {
  assigned: "🔔",
  mentioned: "💬",
  commented: "💬",
  blocked: "⚠️",
  sprint_started: "🚀",
  sprint_completed: "✅",
  ai_review: "🤖",
  bug_linked: "🔗",
  due_approaching: "📅",
  status_done: "✅",
  pulse_reminder: "📋",
  blocker_flagged: "⚠️",
  dm_responded: "💬",
};

export function notificationIcon(type: string): string {
  return ICONS[type] ?? "🔔";
}
