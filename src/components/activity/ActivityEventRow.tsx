import Link from "next/link";
import type { ActivityContext, ActivityEvent } from "./types";
import { absoluteTime, relativeTime } from "./time";
import { Avatar } from "@/components/board/meta";

// One distinct glyph per event type (rendered in a muted badge).
const ICON: Record<string, string> = {
  work_item_created: "+",
  status_changed: "→",
  work_item_updated: "✎",
  comment_added: "❝",
  link_created: "↔",
  test_case_added: "✓",
  ai_generation_approved: "✦",
  sprint_assigned: "▣",
  blocked_toggled: "⚑",
};

type Meta = Record<string, unknown>;

function StatusBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {name}
    </span>
  );
}

function prettyEnum(v: unknown): string {
  if (typeof v !== "string" || !v) return "—";
  return v.charAt(0) + v.slice(1).toLowerCase();
}

function truncate(v: unknown, n = 40): string {
  const s = v == null || v === "" ? "—" : String(v);
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// Renders the field-change clause for a work_item_updated event.
function describeChanges(meta: Meta, ctx: ActivityContext) {
  const changes = Array.isArray(meta.changes)
    ? (meta.changes as { field: string; from: unknown; to: unknown }[])
    : [];
  if (changes.length === 0) return <>updated this item</>;

  return (
    <>
      {changes.map((c, i) => {
        const label =
          c.field === "assigneeId"
            ? "assignee"
            : c.field === "storyPoints"
              ? "points"
              : c.field;
        let from: string;
        let to: string;
        if (c.field === "assigneeId") {
          from = c.from ? (ctx.members[String(c.from)] ?? "someone") : "Unassigned";
          to = c.to ? (ctx.members[String(c.to)] ?? "someone") : "Unassigned";
        } else if (c.field === "priority") {
          from = prettyEnum(c.from);
          to = prettyEnum(c.to);
        } else {
          from = truncate(c.from);
          to = truncate(c.to);
        }
        return (
          <span key={c.field}>
            {i > 0 && "; "}
            changed {label} from <span className="font-medium">{from}</span> to{" "}
            <span className="font-medium">{to}</span>
          </span>
        );
      })}
    </>
  );
}

// The predicate (everything after the actor's name) for an event.
function predicate(event: ActivityEvent, ctx: ActivityContext): React.ReactNode {
  const meta = (event.metadata ?? {}) as Meta;
  switch (event.eventType) {
    case "work_item_created":
      return <>created this item</>;
    case "status_changed": {
      const from = ctx.statuses[String(meta.fromStatusId)];
      const to = ctx.statuses[String(meta.toStatusId)];
      return (
        <>
          moved from{" "}
          {from ? <StatusBadge name={from.name} color={from.color} /> : "—"} to{" "}
          {to ? <StatusBadge name={to.name} color={to.color} /> : "—"}
        </>
      );
    }
    case "work_item_updated":
      return describeChanges(meta, ctx);
    case "comment_added":
      return <>commented</>;
    case "link_created":
      return (
        <>
          linked this to{" "}
          <span className="font-medium">{String(meta.targetKey ?? "")}</span>
          {meta.targetTitle ? `: ${truncate(meta.targetTitle, 50)}` : ""}
        </>
      );
    case "test_case_added":
      return (
        <>
          added test case:{" "}
          <span className="font-medium">{truncate(meta.title, 50)}</span>
        </>
      );
    case "ai_generation_approved": {
      const counts = (meta.counts ?? {}) as Record<string, number>;
      const total =
        (counts.epics ?? 0) +
        (counts.features ?? 0) +
        (counts.stories ?? 0) +
        (counts.testCases ?? 0);
      return <>approved AI-generated items ({total})</>;
    }
    case "sprint_assigned":
      return meta.sprintId ? (
        <>
          added to{" "}
          <span className="font-medium">
            {ctx.sprints[String(meta.sprintId)] ?? "a sprint"}
          </span>
        </>
      ) : (
        <>removed from sprint</>
      );
    case "blocked_toggled":
      return meta.blocked ? (
        <>
          marked as blocked
          {meta.reason ? `: ${truncate(meta.reason, 60)}` : ""}
        </>
      ) : (
        <>removed blocker</>
      );
    default:
      return <>{event.eventType.replace(/_/g, " ")}</>;
  }
}

export function ActivityEventRow({
  event,
  ctx,
  showItem = false,
  projectKey,
}: {
  event: ActivityEvent;
  ctx: ActivityContext;
  showItem?: boolean;
  projectKey?: string;
}) {
  const meta = (event.metadata ?? {}) as Meta;
  const actorName = event.actor?.name ?? "Someone";

  return (
    <div className="flex gap-3 py-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
        {ICON[event.eventType] ?? "•"}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          {event.actor && (
            <Avatar
              id={event.actor.id}
              name={event.actor.name}
              avatarUrl={event.actor.avatarUrl}
              size={18}
            />
          )}
          <p className="min-w-0 text-sm text-foreground">
            <span className="font-medium">{actorName}</span> {predicate(event, ctx)}
            <span
              className="ml-1.5 whitespace-nowrap text-xs text-muted-foreground"
              title={absoluteTime(event.createdAt)}
            >
              · {relativeTime(event.createdAt)}
            </span>
          </p>
        </div>

        {/* Comment snippet */}
        {event.eventType === "comment_added" && typeof meta.snippet === "string" && (
          <p className="mt-1 line-clamp-2 rounded bg-muted/60 px-2 py-1 text-xs text-muted-foreground">
            {meta.snippet}
          </p>
        )}

        {/* Related work item chip (project feed only) — click to open the item */}
        {showItem && event.workItem && projectKey && (
          <Link
            href={`/${projectKey}/board?item=${event.workItem.id}`}
            className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
          >
            <span className="shrink-0 font-medium">{event.workItem.itemKey}</span>
            <span className="truncate">{event.workItem.title}</span>
          </Link>
        )}
      </div>
    </div>
  );
}
