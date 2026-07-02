"use client";

import { useEffect } from "react";

// Catches render/data errors in any project page and shows a friendly message
// with a retry, instead of a blank screen.
export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Project page error:", error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">
          Failed to load. Try refreshing the page.
        </p>
        <p className="text-sm text-muted-foreground">
          Something went wrong while loading this view.
        </p>
      </div>
      <button
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Retry
      </button>
    </div>
  );
}
