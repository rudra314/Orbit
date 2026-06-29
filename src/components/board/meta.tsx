import type {
  Discipline,
  LinkType,
  Priority,
  Severity,
  TestCaseStatus,
  TestType,
  VerificationStatus,
  WorkItemType,
} from "./types";

export const TYPE_META: Record<
  WorkItemType,
  { label: string; color: string }
> = {
  STORY: { label: "Story", color: "#0052CC" },
  BUG: { label: "Bug", color: "#DE350B" },
  TASK: { label: "Task", color: "#00857A" },
  SPIKE: { label: "Spike", color: "#6554C0" },
};

// Distinct simple icon per work item type. Inherits size from props.
export function TypeIcon({
  type,
  className = "h-3.5 w-3.5",
}: {
  type: WorkItemType;
  className?: string;
}) {
  const color = TYPE_META[type].color;
  const common = { className, fill: color };
  switch (type) {
    case "STORY":
      return (
        <svg viewBox="0 0 16 16" {...common} aria-label="Story">
          <rect x="2" y="2" width="12" height="12" rx="2" />
          <rect x="4.5" y="5" width="7" height="1.5" fill="#fff" />
          <rect x="4.5" y="8" width="5" height="1.5" fill="#fff" />
        </svg>
      );
    case "BUG":
      return (
        <svg viewBox="0 0 16 16" {...common} aria-label="Bug">
          <circle cx="8" cy="9" r="4.5" />
          <rect x="7.25" y="1.5" width="1.5" height="3" />
        </svg>
      );
    case "TASK":
      return (
        <svg viewBox="0 0 16 16" {...common} aria-label="Task">
          <rect x="2" y="2" width="12" height="12" rx="2" />
          <path
            d="M5 8.2l2 2 4-4.4"
            stroke="#fff"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "SPIKE":
      return (
        <svg viewBox="0 0 16 16" {...common} aria-label="Spike">
          <path d="M9 1.5L3.5 9H7l-1 5.5L12.5 7H9l1-5.5z" />
        </svg>
      );
  }
}

export const PRIORITY_META: Record<
  Priority,
  { label: string; color: string }
> = {
  CRITICAL: { label: "Critical", color: "#DE350B" },
  HIGH: { label: "High", color: "#FF8B00" },
  MEDIUM: { label: "Medium", color: "#0052CC" },
  LOW: { label: "Low", color: "#6B778C" },
};

export function PriorityDot({ priority }: { priority: Priority }) {
  return (
    <span
      title={`${PRIORITY_META[priority].label} priority`}
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: PRIORITY_META[priority].color }}
    />
  );
}

export const PRIORITIES: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
export const WORK_ITEM_TYPES: WorkItemType[] = ["STORY", "BUG", "TASK", "SPIKE"];
export const SEVERITIES: Severity[] = [
  "BLOCKER",
  "CRITICAL",
  "MAJOR",
  "MINOR",
  "TRIVIAL",
];
export const DISCIPLINES: Discipline[] = [
  "PRODUCT",
  "UX",
  "DEVELOPMENT",
  "QE",
  "DEVOPS",
  "ARCHITECTURE",
  "DELIVERY",
  "OTHER",
];
export const VERIFICATION_STATUSES: VerificationStatus[] = [
  "NOT_VERIFIED",
  "VERIFIED",
  "REOPENED",
];

// Human-readable label per link type — used both for the "Add link" dropdown
// and for the grouped section headers in the Links tab.
export const LINK_TYPE_LABEL: Record<LinkType, string> = {
  RELATES_TO: "Relates to",
  BLOCKS: "Blocks",
  IS_BLOCKED_BY: "Is blocked by",
  CAUSES: "Causes",
  IS_CAUSED_BY: "Is caused by",
  DUPLICATES: "Duplicates",
  IS_DUPLICATED_BY: "Is duplicated by",
  FOUND_IN: "Found in",
  TESTED_BY: "Tested by",
  DEPENDS_ON: "Depends on",
};

// Order shown in the dropdown and used to group the link list.
export const LINK_TYPE_ORDER: LinkType[] = [
  "RELATES_TO",
  "BLOCKS",
  "IS_BLOCKED_BY",
  "DEPENDS_ON",
  "CAUSES",
  "IS_CAUSED_BY",
  "DUPLICATES",
  "IS_DUPLICATED_BY",
  "FOUND_IN",
  "TESTED_BY",
];

export const TEST_STATUS_META: Record<
  TestCaseStatus,
  { label: string; color: string }
> = {
  DRAFT: { label: "Draft", color: "#6B778C" },
  ACTIVE: { label: "Active", color: "#0F6E56" },
  REJECTED: { label: "Rejected", color: "#DE350B" },
  DEPRECATED: { label: "Deprecated", color: "#97650F" },
};

export const TEST_TYPE_LABEL: Record<TestType, string> = {
  MANUAL: "Manual",
  AUTOMATED: "Automated",
};

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Deterministic avatar color from a string id.
export function avatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 45% 45%)`;
}

export function Avatar({
  name,
  avatarUrl,
  id,
  size = 24,
}: {
  name: string | null;
  avatarUrl?: string | null;
  id: string;
  size?: number;
}) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatarUrl}
        alt={name ?? ""}
        title={name ?? ""}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      title={name ?? ""}
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: avatarColor(id),
        fontSize: size * 0.4,
      }}
    >
      {initials(name)}
    </span>
  );
}
