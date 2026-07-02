import { Skeleton } from "@/components/Skeleton";

// Shown while the board's server data loads.
export default function BoardLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-7 w-28" />
        <Skeleton className="ml-auto h-7 w-24" />
      </div>
      <div className="flex flex-1 gap-3 overflow-hidden p-4">
        {Array.from({ length: 4 }).map((_, c) => (
          <div
            key={c}
            className="flex w-72 shrink-0 flex-col gap-2 rounded-lg border border-border bg-muted/40 p-2"
          >
            <Skeleton className="mx-1 my-1 h-5 w-32" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
