// Pulsing placeholder block. Uses the `muted` token so it adapts to dark mode
// automatically (per the design-token rule — no hardcoded greys).
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}
