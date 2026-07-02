"use client";

import { useRouter } from "next/navigation";
import type { pulseService } from "@/services/pulseService";

type HistoryData = Awaited<ReturnType<typeof pulseService.getHistoryPageData>>;

function cellColor(day: HistoryData["days"][number]) {
  if (day.totalMembers === 0) return "#E5E7EB"; // grey — no submitting members yet
  const pct = day.submissionCount / day.totalMembers;
  if (pct >= 1) return "#00875A"; // green
  if (pct > 0) return "#FF8B00"; // amber
  return "#DE350B"; // red
}

export function HistoryClient({ data }: { data: HistoryData }) {
  const router = useRouter();

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col overflow-y-auto px-6 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-foreground">Pulse history</h1>
        <p className="text-sm text-muted-foreground">Last 30 days · {data.project.name}</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-4 text-sm">
        <Stat
          label="My submission rate"
          value={`${data.mySubmissionRate.submitted}/${data.mySubmissionRate.total} (${data.mySubmissionRate.pct}%)`}
        />
        <Stat label="Team average" value={`${data.teamAveragePct}%`} />
        <Stat label="Days with blockers" value={String(data.daysWithBlockers)} />
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {data.days.map((d) => (
          <button
            key={d.date}
            title={`${d.date} — ${d.submissionCount}/${d.totalMembers} submitted${
              d.hasBlockers ? " · blockers flagged" : ""
            }`}
            onClick={() => router.push(`/${data.project.key}/pulse/digest?date=${d.date}`)}
            className="relative flex aspect-square items-center justify-center rounded-md text-[10px] font-medium text-white"
            style={{ backgroundColor: cellColor(d) }}
          >
            {new Date(d.date).getDate()}
            {d.hasBlockers && (
              <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-white" />
            )}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <Legend color="#00875A" label="Full team submitted" />
        <Legend color="#FF8B00" label="Partial submission" />
        <Legend color="#DE350B" label="No submissions" />
        <Legend color="#E5E7EB" label="No submitting members" />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md border border-border bg-card px-3 py-2">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="block text-base font-semibold text-foreground">{value}</span>
    </span>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
