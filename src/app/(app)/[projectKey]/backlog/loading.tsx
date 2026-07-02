import { Skeleton } from "@/components/Skeleton";

// Shown while the backlog's server data loads.
export default function BacklogLoading() {
  return (
    <div className="flex h-full">
      <div className="w-56 shrink-0 border-r border-border p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="mb-2 h-8 w-full" />
        ))}
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="ml-auto h-7 w-24" />
        </div>
        <div className="flex-1 space-y-2 p-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
