import { Skeleton } from "@/components/Skeleton";

// Shown while the sprints page server data loads.
export default function SprintsLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="flex-1 space-y-6 p-5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border p-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
            <div className="space-y-2 pt-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-10 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
