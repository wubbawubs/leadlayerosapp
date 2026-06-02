/**
 * Visual status pill — operator-friendly label using semantic status tokens.
 * Tone maps to: green (live/done), amber (needs attention/pending),
 * red (failed/blocker), info (review/approved/in-progress), neutral (planned/draft).
 */
export type StatusTone = "green" | "amber" | "red" | "info" | "neutral";

const TONE_CLASSES: Record<StatusTone, string> = {
  green:
    "border-[color:var(--status-green)]/30 bg-[color:var(--status-green-soft)] text-[color:var(--status-green)]",
  amber:
    "border-[color:var(--status-amber)]/30 bg-[color:var(--status-amber-soft)] text-[color:var(--status-amber)]",
  red:
    "border-[color:var(--status-red)]/30 bg-[color:var(--status-red-soft)] text-[color:var(--status-red)]",
  info:
    "border-[color:var(--status-info)]/30 bg-[color:var(--status-info-soft)] text-[color:var(--status-info)]",
  neutral:
    "border-[color:var(--status-neutral)]/30 bg-[color:var(--status-neutral-soft)] text-[color:var(--status-neutral)]",
};

export function StatusPill({
  tone,
  children,
  className = "",
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusDot({ tone }: { tone: StatusTone }) {
  const colorClass =
    tone === "green" ? "bg-[color:var(--status-green)]"
    : tone === "amber" ? "bg-[color:var(--status-amber)]"
    : tone === "red" ? "bg-[color:var(--status-red)]"
    : tone === "info" ? "bg-[color:var(--status-info)]"
    : "bg-[color:var(--status-neutral)]";

  return (
    <span aria-hidden className="relative inline-flex h-2 w-2">
      {tone === "red" && (
        <span
          className={`absolute inline-flex h-full w-full rounded-full ${colorClass} opacity-75`}
          style={{ animation: "dot-ring-pulse 1.8s ease-out infinite" }}
        />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${colorClass}`} />
    </span>
  );
}
