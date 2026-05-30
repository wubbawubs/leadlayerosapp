/**
 * LeadLayer brand mark — three stacked parallelogram layers.
 * Inspired by leadlayer.studio. Uses brand tokens only — no raw hex.
 */
export function Mark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Top layer — filled accent */}
      <path
        d="M14 8 L42 8 L34 18 L6 18 Z"
        fill="var(--accent)"
      />
      {/* Middle layer — outline */}
      <path
        d="M10 21 L38 21 L30 31 L2 31 Z"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
      />
      {/* Bottom layer — deep accent */}
      <path
        d="M14 34 L42 34 L34 44 L6 44 Z"
        fill="var(--brand-orange-deep)"
      />
    </svg>
  );
}
