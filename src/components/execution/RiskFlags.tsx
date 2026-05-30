import { AlertTriangle } from "lucide-react";

/**
 * Risk flags — prominent red callout. Null/undefined → "Review details unavailable".
 * Empty array → hides entirely.
 */
export function RiskFlags({ flags }: { flags: string[] | null | undefined }) {
  if (flags == null) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        Risk flags · review details unavailable
      </p>
    );
  }
  if (flags.length === 0) return null;
  return (
    <div className="rounded-md border-l-4 border-[color:var(--status-red)] bg-[color:var(--status-red-soft)] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--status-red)]">
        <AlertTriangle className="h-3.5 w-3.5" />
        Risk flags
      </div>
      <ul className="mt-1 space-y-0.5 text-xs text-foreground">
        {flags.map((f, i) => (
          <li key={i}>· {f}</li>
        ))}
      </ul>
    </div>
  );
}
