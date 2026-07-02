"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["", "General"],
  ["team", "Team"],
  ["ai", "AI"],
] as const;

export function SettingsNav({ projectKey }: { projectKey: string }) {
  const pathname = usePathname();
  const base = `/${projectKey}/settings`;

  return (
    <nav className="flex gap-1 border-b border-border px-6">
      {TABS.map(([slug, label]) => {
        const href = slug ? `${base}/${slug}` : base;
        const active = pathname === href;
        return (
          <Link
            key={label}
            href={href}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm ${
              active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
