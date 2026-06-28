"use client";

import { useEffect, useState } from "react";

// Toggles between light/dark by adding/removing `.dark` on <html>,
// persisting the choice to localStorage (read by the no-flash script in layout).
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("orbit-theme", next ? "dark" : "light");
    setIsDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted ${className}`}
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}
