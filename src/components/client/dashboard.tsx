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
import { Sparkles, FilePlus, BarChart3, ArrowRight, Trophy } from "lucide-react";
import { SectionLabel } from "@/components/client/bits";
import {
  portalCopy,
  formatMoney,
  type PortalLocale,
} from "@/lib/shared/clientPortal/portalCopy";
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
}: {
  analytics: ClientAnalytics;
  locale: PortalLocale;
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
                  background: "#FBF7EE",
                  border: `1px solid ${LINE}`,
                  borderRadius: 4,
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
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div className="mt-3 flex items-center gap-5 border-t border-paper-line pt-3 text-[13px]">
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="h-2 w-2 rounded-full" style={{ background: AMBER }} /> {a.visitors}
          </span>
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="h-2 w-2 rounded-full" style={{ background: SUCCESS }} />{" "}
            {a.conversions}
          </span>
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
