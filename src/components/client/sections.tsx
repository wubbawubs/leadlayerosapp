/**
 * Editorial section primitives for the client portal.
 *
 * The client dashboard reads like a printed monthly report: a sequence of
 * full-bleed bands, each with its own paper tint, separated by tonal shifts
 * rather than hairline rules. `DashboardBand` is the building block; pages
 * compose their layout by stacking bands with different `tone`s.
 *
 * Inside every band, content is constrained to the same editorial width so
 * the typographic axis stays put while the "paper" changes color.
 */
import type { ReactNode } from "react";

type Tone =
  | "paper" // base warm cream (default page color)
  | "cream-deep" // a touch darker — for KPI / hero-adjacent bands
  | "white" // brightest — chart / data bands stand out
  | "sage" // cool cream wash — calm sections like timelines
  | "amber" // warm amber-glazed accent band — used sparingly
  | "charcoal"; // dark inverted band

const TONE_BG: Record<Tone, string> = {
  paper: "bg-paper",
  "cream-deep": "bg-[var(--paper-deep)]",
  white: "bg-[#FBF9F4]",
  sage: "bg-[var(--paper-sage)]",
  amber: "",
  charcoal: "surface-charcoal",
};

const TONE_EXTRA: Record<Tone, string> = {
  paper: "",
  "cream-deep": "",
  white: "",
  sage: "",
  amber: "",
  charcoal: "",
};

export function DashboardBand({
  tone = "paper",
  children,
  className = "",
  compact = false,
  innerClassName = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  /** Tighter vertical padding for short bands (banners, single-row strips). */
  compact?: boolean;
  innerClassName?: string;
}) {
  const pad = compact ? "py-6 lg:py-8" : "py-12 lg:py-16";
  const style =
    tone === "amber"
      ? {
          backgroundImage:
            "linear-gradient(180deg, rgba(217,119,6,0.10) 0%, rgba(217,119,6,0.04) 60%, transparent 100%), radial-gradient(60% 90% at 90% 10%, rgba(217,119,6,0.18), transparent 65%)",
          backgroundColor: "var(--paper-deep)",
        }
      : undefined;

  return (
    <section
      className={`relative w-full ${TONE_BG[tone]} ${TONE_EXTRA[tone]} ${pad} ${className}`}
      style={style}
    >
      <div
        className={`mx-auto w-full max-w-[1600px] px-5 lg:px-10 ${innerClassName}`}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * Editorial section header — amber eyebrow over a display title.
 *
 * Heavier than the old `SectionLabel`: pairs a small amber-cap eyebrow with
 * a large display-weight title and an optional kicker sentence, the way a
 * magazine opens a chapter. Use it as the lede of every band.
 */
export function MagazineSection({
  eyebrow,
  title,
  kicker,
  action,
  children,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  kicker?: string;
  action?: ReactNode;
  children?: ReactNode;
  align?: "left" | "center";
}) {
  const alignment = align === "center" ? "text-center mx-auto" : "";
  return (
    <div>
      <div
        className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-3 ${align === "center" ? "flex-col items-center" : ""}`}
      >
        <div className={`max-w-2xl ${alignment}`}>
          {eyebrow && (
            <p className="font-semibold uppercase tracking-[0.16em] text-[11px] text-amber-deep">
              {eyebrow}
            </p>
          )}
          <h2 className="mt-2 font-display text-2xl font-extrabold leading-[1.1] tracking-tight text-ink lg:text-[28px]">
            {title}
          </h2>
          {kicker && (
            <p className="mt-2 text-[15px] leading-snug text-ink-2">{kicker}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children && <div className="mt-7">{children}</div>}
    </div>
  );
}
