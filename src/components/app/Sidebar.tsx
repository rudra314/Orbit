"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { OrbitMark } from "@/components/OrbitMark";

// [slug, label, icon] — icon shows in the collapsed (icon-only) rail below xl.
const NAV = [
  ["board", "Board", "▦"],
  ["backlog", "Backlog", "☰"],
  ["sprints", "Sprints", "▻"],
  ["ai-review", "AI Review", "✦"],
  ["deliverables", "Deliverables", "📦"],
  ["documents", "Documents", "📄"],
  ["reports", "Reports", "📊"],
  ["dashboard", "Dashboard", "📈"],
  ["activity", "Activity", "🕒"],
  ["audit", "Audit", "🛡"],
  ["settings", "Settings", "⚙"],
] as const;

export function Sidebar({
  projects,
  currentKey,
}: {
  projects: { key: string; name: string; accentColor: string }[];
  currentKey: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const current = projects.find((p) => p.key === currentKey);

  return (
    // Collapses to an icon-only rail below 1280px (xl); full width at xl+.
    <aside className="flex h-screen w-16 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground xl:w-60">
      <div className="flex items-center justify-center gap-2 px-4 py-4 text-sidebar-foreground xl:justify-start">
        <OrbitMark className="h-6 w-6 shrink-0 text-primary" />
        <span className="hidden font-semibold xl:inline">Orbit</span>
      </div>

      {/* Project switcher — hidden in the collapsed rail */}
      <div className="hidden px-3 pb-3 xl:block">
        <select
          value={currentKey}
          onChange={(e) => {
            const value = e.target.value;
            if (value === "__new__") router.push("/setup/new");
            else router.push(`/${value}/board`);
          }}
          className="w-full truncate rounded-md border border-sidebar-border bg-sidebar-active px-2 py-2 text-sm text-sidebar-foreground outline-none"
        >
          {projects.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name} ({p.key})
            </option>
          ))}
          <option value="__new__">+ New project…</option>
        </select>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.map(([slug, label, icon]) => {
          const href = `/${currentKey}/${slug}`;
          const active = pathname === href;
          return (
            <Link
              key={slug}
              href={href}
              title={label}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm max-xl:justify-center ${
                active
                  ? "bg-sidebar-active font-medium text-sidebar-foreground"
                  : "text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-foreground"
              }`}
            >
              <span className="text-base leading-none xl:hidden" aria-hidden>
                {icon}
              </span>
              <span className="hidden xl:inline">{label}</span>
            </Link>
          );
        })}
      </nav>

      {current && (
        <div className="flex items-center justify-center gap-2 border-t border-sidebar-border px-4 py-3 text-xs text-sidebar-muted xl:justify-start">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: current.accentColor }}
          />
          <span className="hidden truncate xl:inline">{current.name}</span>
        </div>
      )}
    </aside>
  );
}
