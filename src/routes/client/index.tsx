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
  Target,
  Eye,
  Euro,
} from "lucide-react";
import {
  getMyClientDashboard,
  getMyClientAnalytics,
} from "@/lib/shared/clientPortal/clientAuth.functions";
import { ClientShell } from "@/components/app/ClientShell";
import { StatusChip, SectionLabel, useCountUp } from "@/components/client/bits";
import {
  TrafficTrend,
  CtaPerformance,
  SourceBreakdown,
  StoryHighlights,
  HeroSparkline,
  WonBanner,
} from "@/components/client/dashboard";
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

  // Publish / optimize events that fall inside the trend window get annotated
  // on the chart so the visitor + conversion lines have narrative context.
  const publishEvents = portal.recentActivity
    .filter((a) => a.type === "page_published" || a.type === "page_optimized")
    .map((a) => ({
      date: a.date,
      label: a.label,
      kind: a.type === "page_published" ? ("published" as const) : ("optimized" as const),
    }));

  // "How it works" is an onboarding affordance — only useful when there's
  // almost nothing else on the page yet. After that it just adds noise.
  const showHowItWorks = portal.recentActivity.length < 3;

  return (
    <ClientShell
      businessName={portal.businessName}
      locale={locale}
      hero={<HomeHero portal={portal} locale={locale} />}
    >
      {/* Just-won celebrate banner (last 24h, if any) */}
      <WonBanner leads={portal.leads} locale={locale} />

      {/* Editorial KPI band */}
      <StatBand portal={portal} analytics={analytics} locale={locale} />

      {/* Two-column layout on desktop, stack on mobile */}
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
        {/* ── Main column ── */}
        <div className="min-w-0 space-y-10">
          {/* Editorial story summary — answers "what mattered this month" */}
          <StoryHighlights portal={portal} analytics={analytics} locale={locale} />

          {/* Traffic & conversions trend (with publish annotations) */}
          {analytics && (
            <TrafficTrend analytics={analytics} locale={locale} events={publishEvents} />
          )}

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
                className="paper-card block p-5"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] bg-paper-subtle">
                    <FileText className="h-4 w-4 text-amber-deep" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-ink">
                      {portal.reports[0].periodLabel}
                    </p>
                    <p className="mt-1 text-[13px] text-ink-3">
                      {c.reportLeads(portal.reports[0].leadCount)} ·{" "}
                      {c.reportPages(
                        portal.reports[0].pagesPublished + portal.reports[0].pagesOptimized,
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-paper-line pt-3 text-[13px]">
                  <span className="text-ink-3">{formatMoney(portal.reports[0].revenue, locale)}</span>
                  <span className="flex items-center gap-1 font-semibold text-amber-deep">
                    {c.viewLatestReport}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
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

          {/* How it works — only shown for early accounts as a primer */}
          {showHowItWorks && (
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
          )}
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
  const isComplete = goal?.status === "complete";
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


  // Primary hero CTA — picks the next most useful destination
  const heroCta = portal.reports.length > 0 && portal.reports[0].shareToken
    ? { label: c.viewLatestReport, to: "/client/reports" as const }
    : { label: c.viewLeads, to: "/client/leads" as const };

  // Ring mirrors the headline fraction (actual/target) so it can't contradict
  // the "7 / 8" shown next to it; falls back to the goal's own progress.
  const percent =
    target && target > 0
      ? Math.min(100, Math.round((actual / target) * 100))
      : Math.min(100, Math.round(goal?.progressPercent ?? 0));
  const statusTint = isGood
    ? "rgba(123,199,150,0.16)"
    : isBehind
      ? "rgba(232,185,74,0.16)"
      : "rgba(255,255,255,0.08)";

  return (
    <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
      {/* Left — greeting + goal + insight + CTA */}
      <div className="min-w-0">
        <p className="label-mono">
          {greeting(locale)} · {formatDayline(locale)}
        </p>

        {goal?.title && <p className="mt-4 text-[15px] text-ink-2">{goal.title}</p>}

        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3">
          <span className="font-display text-5xl font-extrabold leading-none tracking-[-0.03em] text-ink sm:text-6xl">
            <span className="text-amber-bright">{animated}</span>
            {target != null && <span className="text-ink-2"> / {target}</span>}
          </span>
          <span className="font-display text-lg font-semibold text-ink-2">{c.leadsWord}</span>
        </div>


        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-[13px] font-semibold ${isComplete ? "animate-pulse-soft" : ""}`}
            style={{ color: statusColor, backgroundColor: statusTint }}
          >
            {statusLabel}
          </span>
          {goal?.daysRemaining != null && (
            <span className="text-sm text-ink-3">{c.daysLeft(goal.daysRemaining)}</span>
          )}
          <Link
            to={heroCta.to}
            className="ml-1 flex items-center gap-1.5 rounded-[6px] bg-amber px-3.5 py-1.5 text-[13px] font-semibold text-paper transition-colors hover:bg-amber-deep"
          >
            {heroCta.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Right — sparkline + goal ring, side by side on desktop */}
      <div className="flex shrink-0 items-center gap-7">
        <div className="hidden sm:block">
          <HeroSparkline leads={portal.leads} locale={locale} />
        </div>
        <GoalRing percent={percent} label={c.ofGoal} celebrate={isComplete} />
      </div>
    </div>
  );
}

function GoalRing({
  percent,
  label,
  celebrate = false,
}: {
  percent: number;
  label: string;
  celebrate?: boolean;
}) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - percent / 100);
  return (
    <div className={`relative h-36 w-36 ${celebrate ? "animate-pulse-soft" : ""}`}>
      <svg viewBox="0 0 128 128" className="h-36 w-36 -rotate-90">
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="12"
        />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke="var(--amber)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-extrabold leading-none text-ink">
          {percent}%
        </span>
        <span className="label-mono mt-1">{label}</span>
      </div>
    </div>
  );
}

// ── Editorial stat band ─────────────────────────────────────────────

/**
 * Hierarchical KPI band: one hero stat (leads MTD, large + delta) and three
 * compact secondary cells. Every stat is clickable so the dashboard becomes
 * a hub, not a dead-end of numbers.
 */
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
    <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr] md:gap-4">
      {/* Hero KPI — Proven revenue (the outcome that matters). Hero band
          above already owns "leads this month", so we don't repeat it here. */}
      <HeroKpi
        label={c.statRevenue}
        value={formatMoney(portal.stats.provenRevenue, locale)}
        delta={leadsDelta}
        deltaLabel={c.vsLastMonth(prevMonth)}
        to="/client/leads"
        accent
      />

      <SecondaryKpi
        icon={<Target className="h-4 w-4" />}
        label={a.conversionRate}
        value={analytics ? `${analytics.totals.conversionRate}%` : "—"}
        tone="info"
      />
      <SecondaryKpi
        icon={<Eye className="h-4 w-4" />}
        label={a.visitors}
        value={analytics ? analytics.totals.sessions.toLocaleString() : "—"}
        tone="neutral"
      />
    </div>
  );
}

function HeroKpi({
  label,
  value,
  delta,
  deltaLabel,
  to,
  accent = false,
}: {
  label: string;
  value: string | number;
  delta: number;
  deltaLabel: string;
  to: "/client/leads";
  accent?: boolean;
}) {
  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const deltaColor =
    delta > 0 ? "text-paper-success" : delta < 0 ? "text-paper-danger" : "text-ink-3";

  return (
    <Link
      to={to}
      className="paper-card group relative col-span-2 flex flex-col justify-between overflow-hidden p-4 transition-colors hover:border-amber/40 md:col-span-1 md:p-5"
      style={{
        backgroundImage:
          "radial-gradient(120% 100% at 100% 0%, rgba(217,119,6,0.10), transparent 55%)",
      }}
    >
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <ArrowRight className="h-4 w-4 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-deep" />
      </div>
      <div className="mt-4">
        <p
          className={`font-display text-4xl font-extrabold leading-none tracking-[-0.02em] md:text-[44px] ${accent ? "text-paper-success" : "text-ink"}`}
        >
          {value}
        </p>
        {delta !== 0 && (
          <span className={`mt-2 flex items-center gap-1 text-[13px] font-semibold ${deltaColor}`}>
            <DeltaIcon className="h-3.5 w-3.5 shrink-0" />
            {delta > 0 ? "+" : ""}
            {delta} {deltaLabel}
          </span>
        )}
      </div>
    </Link>
  );
}

const KPI_TONE: Record<string, string> = {
  amber: "bg-[rgba(217,119,6,0.12)] text-amber-deep",
  info: "bg-[rgba(47,90,117,0.10)] text-paper-info",
  success: "bg-[rgba(31,122,54,0.12)] text-paper-success",
  neutral: "bg-paper-subtle text-ink-3",
};

function SecondaryKpi({
  icon,
  label,
  value,
  tone = "neutral",
  accent = false,
  to,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "amber" | "info" | "success" | "neutral";
  accent?: boolean;
  to?: "/client/leads" | "/client/pages" | "/client/reports";
}) {
  const isEmpty = value === "—" || value === "-";
  const inner = (
    <div className="paper-card flex h-full flex-col justify-between p-3.5 transition-colors hover:border-paper-line-strong sm:p-4">
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-[8px] ${KPI_TONE[tone]}`}
        >
          {icon}
        </span>
      </div>
      <p
        className={`mt-3 font-display font-extrabold leading-none tracking-tight ${isEmpty ? "text-base text-ink-3" : "text-[22px] sm:text-[26px]"} ${accent && !isEmpty ? "text-paper-success" : isEmpty ? "" : "text-ink"}`}
      >
        {isEmpty ? "Nog geen data" : value}
      </p>
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
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
