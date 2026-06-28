// Orbit logo mark — an orbiting dot around a core. Uses currentColor so it
// inherits text color from its container.
export function OrbitMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-30 12 12)" />
      <circle cx="20" cy="8" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
