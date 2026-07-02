/**
 * Client dashboard analytics panels — trend chart, CTA funnel, sources.
 * Paper aesthetic; recharts for the trend. Powered by getMyClientAnalytics.
 */
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceDot,
} from "recharts";
import {
  Sparkles,
  FilePlus,
  BarChart3,
  ArrowRight,
  Trophy,
  Eye,
  MousePointerClick,
  Target,
} from "lucide-react";
import { SectionLabel } from "@/components/client/bits";
import { portalCopy, formatMoney, type PortalLocale } from "@/lib/shared/clientPortal/portalCopy";
import type {
  ClientAnalytics,
  ClientPortalData,
} from "@/lib/shared/clientPortal/clientAuth.functions";

const AMBER = "#D97706";
const INK3 = "#8C8884";
const LINE = "#DDD4C2";
const SUCCESS = "#1F7A36";

// ── Traffic & conversions trend ─────────────────────────────────────

export function TrafficTrend({
  analytics,
  locale,
  events = [],
}: {
  analytics: ClientAnalytics;
  locale: PortalLocale;
  /** Publish / optimization events, mapped onto trend dates as amber ticks. */
  events?: { date: string; label: string; kind: "published" | "optimized" }[];
}) {
  const a = portalCopy(locale).analytics;
  const data = analytics.trend.map((d) => ({
    date: d.date,
    visitors: d.pageviews,
    conversions: d.conversions,
  }));
  // Keep conversion bars visually secondary to the visitors area (they're
  // a much smaller absolute number) by giving the right axis headroom.
  const maxConv = Math.max(...data.map((d) => d.conversions), 1);

  // Match events to chart dates (YYYY-MM-DD); only events that align with a
  // visible trend day are rendered, so the chart can't lie.
  const trendDates = new Set(data.map((d) => d.date));
  const annotated = events
    .map((e) => ({ ...e, date: e.date.slice(0, 10) }))
    .filter((e) => trendDates.has(e.date));

  const fmtDay = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === "nl" ? "nl-NL" : "en-GB", {
      day: "numeric",
      month: "short",
    });

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <SectionLabel>{a.trafficTrend}</SectionLabel>
        <span className="text-[13px] text-ink-3">{a.last30}</span>
      </div>
      <div className="panel p-5">
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="llVisitors" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={AMBER} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={AMBER} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={LINE} strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDay}
                tick={{ fill: INK3, fontSize: 11 }}
                axisLine={{ stroke: LINE }}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                yAxisId="left"
                tick={{ fill: INK3, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <YAxis yAxisId="right" orientation="right" hide domain={[0, maxConv * 3]} />
              <Tooltip
                labelFormatter={(v) => fmtDay(v as string)}
                contentStyle={{
                  background: "rgba(251,247,238,0.90)",
                  backdropFilter: "blur(12px) saturate(150%)",
                  WebkitBackdropFilter: "blur(12px) saturate(150%)",
                  border: "1px solid rgba(191,179,149,0.45)",
                  borderRadius: 12,
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 24px -8px rgba(26,26,28,0.25)",
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => [
                  value,
                  name === "visitors" ? a.visitors : a.conversions,
                ]}
              />
              <Bar
                yAxisId="right"
                dataKey="conversions"
                fill={SUCCESS}
                radius={[2, 2, 0, 0]}
                maxBarSize={10}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="visitors"
                stroke={AMBER}
                strokeWidth={2}
                fill="url(#llVisitors)"
                dot={false}
              />
              {/* Publish / optimization annotations */}
              {annotated.map((e, i) => (
                <ReferenceDot
                  key={`evt-${i}`}
                  yAxisId="left"
                  x={e.date}
                  y={0}
                  r={4}
                  fill={AMBER}
                  stroke="#FBF7EE"
                  strokeWidth={2}
                  ifOverflow="visible"
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-paper-line pt-3 text-[13px]">
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="h-2 w-2 rounded-full" style={{ background: AMBER }} /> {a.visitors}
          </span>
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="h-2 w-2 rounded-full" style={{ background: SUCCESS }} />{" "}
            {a.conversions}
          </span>
          {annotated.length > 0 && (
            <span className="flex items-center gap-1.5 text-ink-3">
              <span
                className="h-2 w-2 rounded-full ring-2 ring-paper"
                style={{ background: AMBER }}
              />
              {locale === "nl" ? "pagina live" : "page shipped"}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

// ── CTA performance funnel ──────────────────────────────────────────

export function CtaPerformance({
  analytics,
  locale,
}: {
  analytics: ClientAnalytics;
  locale: PortalLocale;
}) {
  const a = portalCopy(locale).analytics;
  const ctas = analytics.ctas;
  if (ctas.length === 0) return null;

  const maxRate = Math.max(...ctas.map((c) => c.conversionRate), 1);

  return (
    <section>
      <div className="mb-4">
        <SectionLabel>{a.ctaPerformance}</SectionLabel>
        <p className="mt-1 text-[13px] text-ink-3">{a.ctaSub}</p>
      </div>
      <div className="panel divide-y divide-paper-line">
        {ctas.map((c) => (
          <div key={c.cta} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-[15px] font-semibold text-ink">{c.cta}</p>
              <span
                className="rounded-[3px] px-2 py-0.5 font-mono text-[11px] font-semibold"
                style={{ background: "rgba(31,122,54,0.12)", color: SUCCESS }}
              >
                {c.conversionRate}% {a.convShort}
              </span>
            </div>
            {/* Funnel metrics */}
            <div className="mt-3 grid grid-cols-3 gap-3">
              <FunnelMetric
                icon={<Eye className="h-3.5 w-3.5" />}
                label={a.impressions}
                value={c.impressions}
              />
              <FunnelMetric
                icon={<MousePointerClick className="h-3.5 w-3.5" />}
                label={`${a.clicks} · ${c.ctr}% ${a.ctr}`}
                value={c.clicks}
              />
              <FunnelMetric
                icon={<Target className="h-3.5 w-3.5" />}
                label={a.conversions}
                value={c.conversions}
                accent
              />
            </div>
            {/* Conversion-rate bar */}
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper-inset">
              <div
                className="h-full rounded-full"
                style={{ width: `${(c.conversionRate / maxRate) * 100}%`, background: SUCCESS }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FunnelMetric({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-ink-3">{icon}</div>
      <p
        className={`mt-1 font-display text-xl font-bold leading-none tracking-tight ${accent ? "text-paper-success" : "text-ink"}`}
      >
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-[12px] leading-tight text-ink-3">{label}</p>
    </div>
  );
}

// ── Source breakdown ────────────────────────────────────────────────

export function SourceBreakdown({
  analytics,
  locale,
}: {
  analytics: ClientAnalytics;
  locale: PortalLocale;
}) {
  const c = portalCopy(locale);
  const a = c.analytics;
  const sources = analytics.sources;
  if (sources.length === 0) return null;
  const max = Math.max(...sources.map((s) => s.conversions), 1);

  return (
    <section>
      <div className="mb-4">
        <SectionLabel>{a.bySource}</SectionLabel>
      </div>
      <div className="space-y-3">
        {sources.map((s) => (
          <div key={s.source}>
            <div className="mb-1 flex items-baseline justify-between text-[13px]">
              <span className="font-medium text-ink">{c.sources[s.source] ?? s.source}</span>
              <span className="font-mono text-ink-2">{s.conversions}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-paper-inset">
              <div
                className="h-full rounded-full"
                style={{ width: `${(s.conversions / max) * 100}%`, background: AMBER }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Hero sparkline: leads per week, last 4 weeks ────────────────────

/**
 * Tiny editorial spark — buckets the last 28 days of leads into 4 weekly
 * counts and renders them as a clean polyline. Lives inside the charcoal
 * hero, so colors are tuned for the dark surface.
 */
export function HeroSparkline({
  leads,
  locale,
}: {
  leads: ClientPortalData["leads"];
  locale: PortalLocale;
}) {
  const c = portalCopy(locale);
  const now = Date.now();
  const week = 7 * 24 * 3600 * 1000;
  const buckets = [0, 0, 0, 0]; // weeks ago: 3, 2, 1, 0
  for (const l of leads) {
    const age = now - new Date(l.createdAt).getTime();
    if (age < 0 || age >= 4 * week) continue;
    if (l.status === "junk") continue;
    const idx = 3 - Math.floor(age / week);
    buckets[idx]++;
  }
  const max = Math.max(...buckets, 1);
  const w = 132;
  const h = 44;
  const stepX = w / (buckets.length - 1);
  const points = buckets.map((v, i) => `${i * stepX},${h - (v / max) * (h - 6) - 3}`).join(" ");
  const total = buckets.reduce((a, b) => a + b, 0);
  const last = buckets[buckets.length - 1];
  const prev = buckets[buckets.length - 2];
  const delta = last - prev;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="label-mono">{c.weeklySpark}</span>
        <span
          className="font-mono text-[11px] font-semibold"
          style={{ color: delta >= 0 ? "#7BC796" : "#E8B94A" }}
        >
          {delta >= 0 ? "+" : ""}
          {delta}
        </span>
      </div>
      <svg width={w} height={h} className="overflow-visible">
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={AMBER} stopOpacity={0.45} />
            <stop offset="100%" stopColor={AMBER} stopOpacity={0} />
          </linearGradient>
        </defs>
        <polygon points={`0,${h} ${points} ${w},${h}`} fill="url(#sparkFill)" />
        <polyline
          points={points}
          fill="none"
          stroke={AMBER}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {buckets.map((v, i) => (
          <circle
            key={i}
            cx={i * stepX}
            cy={h - (v / max) * (h - 6) - 3}
            r={i === buckets.length - 1 ? 3 : 2}
            fill={i === buckets.length - 1 ? "#FBF7EE" : AMBER}
            stroke={AMBER}
            strokeWidth={i === buckets.length - 1 ? 2 : 0}
          />
        ))}
      </svg>
      <span className="text-[11px] text-ondark-3">
        {c.weeklySparkSub} · {total} {c.leadsWord}
      </span>
    </div>
  );
}

// ── Just-won banner ─────────────────────────────────────────────────

/**
 * Celebrates a deal closed in the last 24h. Subtle amber gradient on paper —
 * not a confetti party, just a "we noticed" moment.
 */
export function WonBanner({
  leads,
  locale,
}: {
  leads: ClientPortalData["leads"];
  locale: PortalLocale;
}) {
  const c = portalCopy(locale);
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const recent = leads.find((l) => l.status === "won" && new Date(l.createdAt).getTime() > cutoff);
  if (!recent) return null;
  const amount = recent.closedAmount != null ? formatMoney(recent.closedAmount, locale) : "—";
  return (
    <div
      className="mb-6 flex items-center gap-3 rounded-[6px] border border-paper-line px-4 py-3"
      style={{
        background: "linear-gradient(90deg, rgba(217,119,6,0.10) 0%, rgba(217,119,6,0.02) 70%)",
      }}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber/90 text-paper">
        <Trophy className="h-4 w-4" />
      </span>
      <p className="text-[15px] font-semibold text-ink">
        {c.justWonBanner(recent.name ?? c.unknownCaller, amount)}
      </p>
    </div>
  );
}

// ── Story highlights ────────────────────────────────────────────────

type Highlight = { icon: React.ReactNode; text: string };

/**
 * "This month at {Business}" — derives up to 3 narrative bullets from the
 * data already on the page: top lead source, strongest CTA, biggest won
 * deal, pages shipped, lead momentum. Replaces the "widget grid" feel with
 * a one-glance editorial summary.
 */
export function StoryHighlights({
  portal,
  analytics,
  locale,
}: {
  portal: ClientPortalData;
  analytics: ClientAnalytics | null;
  locale: PortalLocale;
}) {
  const c = portalCopy(locale);
  const highlights: Highlight[] = [];

  // 1) Biggest won deal this month (most concrete proof of value)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const wonThisMonth = portal.leads.filter(
    (l) => l.status === "won" && new Date(l.createdAt).getTime() >= monthStart,
  );
  const biggest = wonThisMonth.reduce<(typeof wonThisMonth)[number] | null>(
    (best, l) =>
      l.closedAmount != null && (!best || (best.closedAmount ?? 0) < l.closedAmount) ? l : best,
    null,
  );
  if (biggest && biggest.closedAmount && biggest.closedAmount > 0) {
    highlights.push({
      icon: <Trophy className="h-4 w-4 text-paper-success" />,
      text: c.storyBiggestWin(formatMoney(biggest.closedAmount, locale)),
    });
  }

  // 2) Top source (analytics first, fall back to lead source counts)
  const topSource =
    analytics?.sources?.[0] ??
    (() => {
      const counts: Record<string, number> = {};
      for (const l of portal.leads) {
        if (l.source) counts[l.source] = (counts[l.source] ?? 0) + 1;
      }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      return top ? { source: top[0], conversions: top[1] } : null;
    })();
  if (topSource && topSource.conversions > 0) {
    const label = c.sources[topSource.source] ?? topSource.source;
    highlights.push({
      icon: <BarChart3 className="h-4 w-4 text-paper-info" />,
      text: c.storyTopSource(label, topSource.conversions),
    });
  }

  // 3) Strongest CTA
  const topCta = analytics?.ctas
    ?.filter((c) => c.conversions > 0)
    .sort((a, b) => b.conversionRate - a.conversionRate)[0];
  if (topCta) {
    highlights.push({
      icon: <Sparkles className="h-4 w-4 text-amber-deep" />,
      text: c.storyTopCta(topCta.cta, topCta.conversionRate),
    });
  }

  // 4) Pages shipped (fill remaining slot)
  const shipped = portal.stats.pagesLive + portal.stats.pagesOptimized;
  if (highlights.length < 3 && shipped > 0) {
    highlights.push({
      icon: <FilePlus className="h-4 w-4 text-paper-info" />,
      text: c.storyPagesShipped(shipped),
    });
  }

  // 5) Momentum
  if (highlights.length < 3) {
    highlights.push({
      icon: <ArrowRight className="h-4 w-4 text-ink-2" />,
      text: c.storyMomentum(portal.stats.leadsThisMonth, portal.stats.leadsLastMonth),
    });
  }

  const top3 = highlights.slice(0, 3);
  if (top3.length === 0) {
    return (
      <section>
        <div className="mb-4">
          <SectionLabel>{c.storyTitle(portal.businessName)}</SectionLabel>
        </div>
        <p className="text-[15px] text-ink-2">{c.storyNoData}</p>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-4">
        <SectionLabel>{c.storyTitle(portal.businessName)}</SectionLabel>
      </div>
      <ol className="divide-y divide-paper-line border-y border-paper-line">
        {top3.map((h, i) => (
          <li key={i} className="flex items-start gap-4 py-4">
            <span className="mt-0.5 font-mono text-sm font-semibold text-amber-deep">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="mt-0.5 shrink-0">{h.icon}</span>
            <p className="text-[15px] leading-snug text-ink">{h.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
