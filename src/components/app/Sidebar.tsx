"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { OrbitMark } from "@/components/OrbitMark";

const NAV = [
  ["board", "Board"],
  ["backlog", "Backlog"],
  ["sprints", "Sprints"],
  ["ai-review", "AI Review"],
  ["deliverables", "Deliverables"],
  ["documents", "Documents"],
  ["reports", "Reports"],
  ["dashboard", "Dashboard"],
  ["activity", "Activity"],
  ["settings", "Settings"],
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
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 py-4 text-sidebar-foreground">
        <OrbitMark className="h-6 w-6 text-primary" />
        <span className="font-semibold">Orbit</span>
      </div>

      {/* Project switcher */}
      <div className="px-3 pb-3">
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
        {NAV.map(([slug, label]) => {
          const href = `/${currentKey}/${slug}`;
          const active = pathname === href;
          return (
            <Link
              key={slug}
              href={href}
              className={`block rounded-md px-3 py-2 text-sm ${
                active
                  ? "bg-sidebar-active font-medium text-sidebar-foreground"
                  : "text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-foreground"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {current && (
        <div className="flex items-center gap-2 border-t border-sidebar-border px-4 py-3 text-xs text-sidebar-muted">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: current.accentColor }}
          />
          <span className="truncate">{current.name}</span>
        </div>
      )}
    </aside>
  );
}
