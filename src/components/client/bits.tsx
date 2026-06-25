/**
 * Shared building blocks for the client portal — paper surface.
 * Copy + formatters live in portalCopy.ts; this file is visual bits only.
 */
import { useEffect, useState } from "react";
import { portalCopy, type PortalLocale } from "@/lib/shared/clientPortal/portalCopy";

const STATUS_STYLES: Record<string, { color: string; bg: string }> = {
  new: { color: "var(--paper-info)", bg: "rgba(47,90,117,0.10)" },
  qualified: { color: "var(--amber-deep)", bg: "rgba(217,119,6,0.12)" },
  won: { color: "var(--paper-success)", bg: "rgba(31,122,54,0.12)" },
  lost: { color: "var(--paper-danger)", bg: "rgba(178,58,58,0.10)" },
  junk: { color: "var(--ink-3)", bg: "var(--paper-subtle)" },
};

export function StatusChip({ status, locale = "en" }: { status: string; locale?: PortalLocale }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.new;
  const label = portalCopy(locale).statusLabels[status] ?? status;
  return (
    <span
      className="shrink-0 rounded-[3px] px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      {label}
    </span>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">{children}</h2>
  );
}

/**
 * Count-up animation for hero numbers. Eases out over `duration` ms.
 * Returns the integer in flight; format it at the call site.
 */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!Number.isFinite(target) || target <= 0) {
      setValue(target || 0);
      return;
    }
    let raf: number;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}
