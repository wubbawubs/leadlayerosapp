import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  FilePlus,
  Sparkles,
  BarChart3,
} from "lucide-react";
import {
  getMyClientDashboard,
  getMyClientAnalytics,
} from "@/lib/shared/clientPortal/clientAuth.functions";
import { ClientShell } from "@/components/app/ClientShell";
import { StatusChip, SectionLabel, useCountUp } from "@/components/client/bits";
import { TrafficTrend, CtaPerformance, SourceBreakdown } from "@/components/client/dashboard";
import {
  portalCopy,
  formatMoney,
  formatRelative,
  greeting,
  formatDayline,
  monthShort,
  type PortalLocale,
} from "@/lib/shared/clientPortal/portalCopy";
import type {
  ClientPortalData,
  ClientAnalytics,
} from "@/lib/shared/clientPortal/clientAuth.functions";

export const Route = createFileRoute("/client/")({
  component: ClientHome,
  head: () => ({ meta: [{ title: "Dashboard — LeadLayer" }] }),
});

function ClientHome() {
  const fetchDashboard = useServerFn(getMyClientDashboard);
  const fetchAnalytics = useServerFn(getMyClientAnalytics);
  const query = useQuery({
    queryKey: ["client-dashboard"],
    queryFn: () => fetchDashboard(),
    retry: false,
  });
  const analyticsQuery = useQuery({
    queryKey: ["client-analytics"],
    queryFn: () => fetchAnalytics({ data: { days: 30 } }),
    retry: false,
  });

  const portal = query.data?.data ?? null;
  const analytics = analyticsQuery.data?.analytics ?? null;
  const locale: PortalLocale = portal?.locale ?? "en";
  const c = portalCopy(locale);

  if (query.isLoading)
    return (
      <ClientShell locale={locale}>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="space-y-3 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-paper-line border-t-amber" />
            <p className="label-mono">{c.loading}</p>
          </div>
        </div>
      </ClientShell>
    );

  if (!portal)
    return (
      <ClientShell locale={locale}>
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="font-display text-xl font-bold text-ink">{c.emptyTitle}</p>
          <p className="max-w-sm text-base text-ink-2">{c.emptyBody}</p>
        </div>
      </ClientShell>
    );

  const activeLeads = portal.leads.filter((l) => l.status !== "lost" && l.status !== "junk");

  return (
    <ClientShell
      businessName={portal.businessName}
      locale={locale}
      hero={<HomeHero portal={portal} locale={locale} />}
    >
      {/* Editorial KPI band */}
      <StatBand portal={portal} analytics={analytics} locale={locale} />

      {/* Two-column layout on desktop, stack on mobile */}
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
        {/* ── Main column ── */}
        <div className="min-w-0 space-y-10">
          {/* Traffic & conversions trend */}
          {analytics && <TrafficTrend analytics={analytics} locale={locale} />}

          {/* CTA performance funnel */}
          {analytics && <CtaPerformance analytics={analytics} locale={locale} />}

          {/* Newest leads */}
          {activeLeads.length > 0 && (
            <section>
              <div className="mb-4 flex items-baseline justify-between">
                <SectionLabel>{c.recentLeads}</SectionLabel>
                <Link
                  to="/client/leads"
                  className="text-sm font-medium text-amber-deep underline-offset-4 hover:underline"
                >
                  {c.allLeads} →
                </Link>
              </div>
              <div className="space-y-2.5">
                {activeLeads.slice(0, 4).map((l) => (
                  <Link
                    key={l.id}
                    to="/client/leads"
                    className="paper-card flex items-center justify-between px-4 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-ink">
                        {l.name ?? c.unknownCaller}
                      </p>
                      <p className="mt-0.5 text-[13px] text-ink-3">
                        {l.source ? `${c.via} ${c.sources[l.source] ?? l.source} · ` : ""}
                        {formatRelative(l.createdAt, locale)}
                      </p>
                    </div>
                    <div className="ml-3 flex shrink-0 items-center gap-3">
                      <StatusChip status={l.status} locale={locale} />
                      <ArrowRight className="h-4 w-4 text-ink-3" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Activity timeline */}
          {portal.recentActivity.length > 0 && (
            <section>
              <div className="mb-4">
                <SectionLabel>{c.whatWeDid}</SectionLabel>
              </div>
              <div className="divide-y divide-paper-line border-y border-paper-line">
                {portal.recentActivity.slice(0, 6).map((a, i) => (
                  <div
                    key={i}
                    className={`page-fade-up stagger-${Math.min(i + 1, 5) as 1 | 2 | 3 | 4 | 5}`}
                  >
                    <ActivityRow activity={a} locale={locale} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── Side rail ── */}
        <aside className="space-y-8">
          {/* Conversions by source */}
          {analytics && <SourceBreakdown analytics={analytics} locale={locale} />}

          {/* Latest report */}
          {portal.reports.length > 0 && portal.reports[0].shareToken && (
            <section>
              <div className="mb-4">
                <SectionLabel>{c.latestReport}</SectionLabel>
              </div>
              <a
                href={`/r/${portal.reports[0].shareToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="paper-card flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[4px] bg-paper-subtle">
                    <FileText className="h-4 w-4 text-amber-deep" />
                  </div>
                  <p className="text-[15px] font-semibold text-ink">
                    {portal.reports[0].periodLabel}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-ink-3" />
              </a>
            </section>
          )}

          {/* Coming next — numbered like the studio site */}
          {portal.nextMonthFocus.length > 0 && (
            <section>
              <div className="mb-4">
                <SectionLabel>{c.comingNext}</SectionLabel>
              </div>
              <ul className="space-y-3.5">
                {portal.nextMonthFocus.map((f, i) => (
                  <li key={i} className="flex items-start gap-3 text-[15px] leading-snug text-ink">
                    <span className="mt-px font-mono text-sm font-semibold text-amber-deep">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* How it works — brand layers, also carries empty accounts */}
          <section>
            <div className="mb-4">
              <SectionLabel>{c.howItWorks}</SectionLabel>
            </div>
            <div className="space-y-4">
              {c.howSteps.map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-px font-mono text-sm font-semibold text-amber-deep">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold text-ink">{s.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{s.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </ClientShell>
  );
}

// ── Hero (rendered inside the charcoal frame) ───────────────────────

function HomeHero({ portal, locale }: { portal: ClientPortalData; locale: PortalLocale }) {
  const c = portalCopy(locale);
  const goal = portal.goal;

  const actual = goal?.actualLeads ?? portal.stats.leadsThisMonth;
  const target = goal?.targetCount ?? null;
  const animated = useCountUp(actual);

  const isGood =
    goal && (goal.status === "on_track" || goal.status === "ahead" || goal.status === "complete");
  const isBehind = goal?.status === "behind";
  const statusColor = isGood ? "#7BC796" : isBehind ? "#E8B94A" : "var(--ondark-2)";
  const statusLabel = !goal
    ? c.statusProgress
    : goal.status === "ahead"
      ? c.statusAhead
      : goal.status === "on_track"
        ? c.statusOnTrack
        : goal.status === "complete"
          ? c.statusComplete
          : goal.status === "behind"
            ? c.statusBehind
            : c.statusProgress;

  return (
    <div>
      <p className="label-mono">
        {greeting(locale)} · {formatDayline(locale)}
      </p>

      {goal?.title && <p className="mt-5 text-base text-ink-2">{goal.title}</p>}

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4">
        <span className="font-display text-6xl font-extrabold leading-none tracking-[-0.03em] text-ink sm:text-7xl">
          <span className="text-amber-bright">{animated}</span>
          {target != null && <span className="text-ink-2"> / {target}</span>}
        </span>
        <span className="font-display text-xl font-semibold text-ink-2">{c.leadsWord}</span>
      </div>

      {/* Progress to goal */}
      <div className="mt-7 max-w-xl">
        <div className="h-2 overflow-hidden rounded-full bg-paper-inset">
          <div
            className="progress-fill h-full rounded-full"
            style={
              {
                "--progress-target": `${Math.min(100, goal?.progressPercent ?? 0)}%`,
                background: "var(--amber)",
              } as React.CSSProperties
            }
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[15px] font-semibold" style={{ color: statusColor }}>
            {statusLabel}
          </span>
          {goal?.daysRemaining != null && (
            <span className="text-sm text-ink-3">{c.daysLeft(goal.daysRemaining)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Editorial stat band ─────────────────────────────────────────────

function StatBand({
  portal,
  analytics,
  locale,
}: {
  portal: ClientPortalData;
  analytics: ClientAnalytics | null;
  locale: PortalLocale;
}) {
  const c = portalCopy(locale);
  const a = c.analytics;
  const leadsDelta = portal.stats.leadsThisMonth - portal.stats.leadsLastMonth;
  const prevMonth = monthShort(
    new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
    locale,
  );

  return (
    <div className="grid grid-cols-2 divide-paper-line border-y border-paper-line sm:grid-cols-4 sm:divide-x">
      <StatCell
        label={c.statLeadsMonth}
        value={String(portal.stats.leadsThisMonth)}
        delta={leadsDelta}
        deltaLabel={c.vsLastMonth(prevMonth)}
      />
      <StatCell
        label={a.conversionRate}
        value={analytics ? `${analytics.totals.conversionRate}%` : "—"}
      />
      <StatCell
        label={a.visitors}
        value={analytics ? analytics.totals.sessions.toLocaleString() : "—"}
      />
      <StatCell
        label={c.statRevenue}
        value={formatMoney(portal.stats.provenRevenue, locale)}
        accent={portal.stats.provenRevenue > 0}
      />
    </div>
  );
}

function StatCell({
  label,
  value,
  accent = false,
  delta,
  deltaLabel,
}: {
  label: string;
  value: string;
  accent?: boolean;
  delta?: number;
  deltaLabel?: string;
}) {
  const DeltaIcon =
    delta == null ? null : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const deltaColor =
    delta == null
      ? ""
      : delta > 0
        ? "text-paper-success"
        : delta < 0
          ? "text-paper-danger"
          : "text-ink-3";

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6 sm:first:pl-0">
      <p className="label-mono">{label}</p>
      <div className="mt-2.5 flex items-baseline gap-2.5">
        <p
          className={`font-display text-3xl font-extrabold leading-none tracking-tight sm:text-[32px] ${accent ? "text-paper-success" : "text-ink"}`}
        >
          {value}
        </p>
        {DeltaIcon && delta != null && (
          <span className={`flex items-center gap-1 text-[13px] font-semibold ${deltaColor}`}>
            <DeltaIcon className="h-3.5 w-3.5 shrink-0" />
            {delta > 0 ? "+" : ""}
            {delta} {deltaLabel}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Activity ────────────────────────────────────────────────────────

const ACTIVITY_ICON: Record<string, React.ReactNode> = {
  page_published: <FilePlus className="h-4 w-4 text-paper-info" />,
  page_optimized: <Sparkles className="h-4 w-4 text-amber-deep" />,
  report_ready: <BarChart3 className="h-4 w-4 text-paper-success" />,
};

function ActivityRow({
  activity,
  locale,
}: {
  activity: ClientPortalData["recentActivity"][number];
  locale: PortalLocale;
}) {
  const icon = ACTIVITY_ICON[activity.type] ?? (
    <div className="h-1.5 w-1.5 rounded-full bg-paper-line-strong" />
  );

  return (
    <div className="flex items-start gap-3.5 py-3.5">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] bg-paper-subtle">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-snug text-ink">{activity.label}</p>
        {activity.detail && <p className="mt-0.5 truncate text-sm text-ink-2">{activity.detail}</p>}
      </div>
      <p className="shrink-0 text-[13px] text-ink-3">{formatRelative(activity.date, locale)}</p>
    </div>
  );
}
