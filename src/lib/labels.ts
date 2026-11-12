// Display labels for the SCREAMING_CASE enums (ProjectRole, Discipline).
// Plain title-casing turns "PM" into "Pm" and "QE" into "Qe", so acronyms and
// camel-cased product names are spelled out explicitly.
const SPECIAL_CASE: Record<string, string> = {
  PM: "PM",
  UX: "UX",
  QE: "QE",
  DEVOPS: "DevOps",
};

// "CONTRIBUTOR" → "Contributor", "PM" → "PM", "DEVOPS" → "DevOps".
export function prettyEnum(value: string): string {
  const key = value.toUpperCase();
  if (SPECIAL_CASE[key]) return SPECIAL_CASE[key];
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
