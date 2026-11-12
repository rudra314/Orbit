// Canonical labels for the project sections, keyed by their URL slug under
// /[projectKey]/. The sidebar and the topbar heading both read from here so a
// section can't end up labelled two ways ("AI Review" in the nav next to
// "Ai-review" in the header).
export const SECTION_LABELS: Record<string, string> = {
  board: "Board",
  backlog: "Backlog",
  sprints: "Sprints",
  "ai-review": "AI Review",
  deliverables: "Deliverables",
  reports: "Reports",
  "pulse/digest": "Team Digest",
  dashboard: "Dashboard",
  activity: "Activity",
  pulse: "Daily Pulse",
  audit: "Audit",
  settings: "Settings",
};

// Falls back to title-casing an unknown slug ("foo-bar" → "Foo bar") so a
// section added without a label here still reads sensibly.
export function sectionLabel(slug: string): string {
  const known = SECTION_LABELS[slug];
  if (known) return known;
  const words = slug.replace(/[-/]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
