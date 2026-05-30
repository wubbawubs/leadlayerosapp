import { Info } from "lucide-react";

/**
 * Missing context — amber warning callout. Null → "Review details unavailable".
 * Empty array → hidden.
 */
export function MissingContext({
  items,
  label = "Missing context",
}: {
  items: string[] | null | undefined;
  label?: string;
}) {
  if (items == null) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {label} · review details unavailable
      </p>
    );
  }
  if (items.length === 0) return null;
  return (
    <div className="rounded-md border-l-4 border-[color:var(--status-amber)] bg-[color:var(--status-amber-soft)] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--status-amber)]">
        <Info className="h-3.5 w-3.5" />
        {label}
      </div>
      <ul className="mt-1 space-y-0.5 text-xs text-foreground">
        {items.map((f, i) => (
          <li key={i}>· {f}</li>
        ))}
      </ul>
    </div>
  );
}
