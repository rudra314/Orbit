// Mapping targets for the Excel/CSV importer. Shared by the import service
// (resolution) and the mapping UI (dropdown + auto-detection). No server deps.

export type ImportFieldKey =
  | "title"
  | "description"
  | "type"
  | "status"
  | "priority"
  | "assignee"
  | "storyPoints"
  | "estimatedHours"
  | "sprint"
  | "epic"
  | "labels"
  | "acceptanceCriteria";

export type ImportField = {
  key: ImportFieldKey;
  label: string;
  required: boolean;
  // Lowercased header aliases used to auto-map columns with obvious names.
  aliases: string[];
};

export const IMPORT_FIELDS: ImportField[] = [
  { key: "title", label: "Title", required: true, aliases: ["title", "name", "summary", "story", "task", "item"] },
  { key: "description", label: "Description", required: false, aliases: ["description", "desc", "details", "detail"] },
  { key: "type", label: "Type", required: false, aliases: ["type", "issue type", "work type", "category"] },
  { key: "status", label: "Status", required: false, aliases: ["status", "state", "stage", "column"] },
  { key: "priority", label: "Priority", required: false, aliases: ["priority", "prio", "importance"] },
  { key: "assignee", label: "Assignee", required: false, aliases: ["assignee", "assigned to", "owner", "assigned"] },
  { key: "storyPoints", label: "Story Points", required: false, aliases: ["story points", "points", "sp", "estimate", "story point"] },
  { key: "estimatedHours", label: "Estimated Hours", required: false, aliases: ["estimated hours", "est hours", "hours", "effort"] },
  { key: "sprint", label: "Sprint", required: false, aliases: ["sprint", "iteration"] },
  { key: "epic", label: "Epic", required: false, aliases: ["epic", "epic name", "epic link", "theme"] },
  { key: "labels", label: "Labels", required: false, aliases: ["labels", "label", "tags", "tag"] },
  { key: "acceptanceCriteria", label: "Acceptance Criteria", required: false, aliases: ["acceptance criteria", "acceptance", "ac", "criteria"] },
];

// Best-guess field for a source column header. Exact alias match wins over a
// contains match; returns null when nothing looks obvious.
export function autoDetectField(header: string): ImportFieldKey | null {
  const h = header.trim().toLowerCase();
  if (!h) return null;
  for (const f of IMPORT_FIELDS) {
    if (f.aliases.includes(h)) return f.key;
  }
  for (const f of IMPORT_FIELDS) {
    if (f.aliases.some((a) => h.includes(a))) return f.key;
  }
  return null;
}
