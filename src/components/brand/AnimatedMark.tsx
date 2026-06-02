/**
 * AnimatedMark — three-layer parallelogram cascade.
 * Each layer pulses in sequence (200ms stagger), creating a
 * "layers stacking" rhythm that reads as intentional work happening.
 *
 * Use as the primary loading state: full-screen loader, inline
 * section loading, and the navigation progress indicator backing.
 */
export function AnimatedMark({
  className = "h-10 w-10",
  speed = 1.6,
}: {
  className?: string;
  speed?: number;
}) {
  const dur = `${speed}s`;

  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Top layer — accent fill, pulses first */}
      <path
        d="M14 8 L42 8 L34 18 L6 18 Z"
        fill="var(--accent)"
        style={{
          animation: `layer-pulse ${dur} ease-in-out infinite`,
          animationDelay: "0s",
        }}
      />
      {/* Middle layer — outline only, pulses second */}
      <path
        d="M10 21 L38 21 L30 31 L2 31 Z"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        style={{
          animation: `layer-pulse ${dur} ease-in-out infinite`,
          animationDelay: `${speed * 0.2}s`,
        }}
      />
      {/* Bottom layer — deep orange, pulses last */}
      <path
        d="M14 34 L42 34 L34 44 L6 44 Z"
        fill="var(--brand-orange-deep)"
        style={{
          animation: `layer-pulse ${dur} ease-in-out infinite`,
          animationDelay: `${speed * 0.4}s`,
        }}
      />
    </svg>
  );
}

/**
 * FullscreenLoader — centered AnimatedMark on the app background.
 * Use for initial auth check and heavy page transitions.
 */
export function FullscreenLoader() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background bg-blueprint-subtle">
      <AnimatedMark className="h-12 w-12" />
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        LeadLayer
      </p>
    </div>
  );
}

/**
 * InlineLoader — small AnimatedMark for use inside cards, tabs, or panels
 * while data is fetching.
 */
export function InlineLoader({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <AnimatedMark className="h-5 w-5" speed={1.2} />
      {label && (
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
      )}
    </div>
  );
}
