"use client";

import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

function titleFromPath(pathname: string) {
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  return last.charAt(0).toUpperCase() + last.slice(1);
}

export function Topbar({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  const initials = (user.name || user.email)
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6">
      <h1 className="text-sm font-semibold text-foreground">
        {titleFromPath(pathname)}
      </h1>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Notifications"
          title="Notifications"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
        >
          🔔
        </button>

        <ThemeToggle />

        <div className="flex items-center gap-2">
          <span
            title={user.email}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          >
            {initials}
          </span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
