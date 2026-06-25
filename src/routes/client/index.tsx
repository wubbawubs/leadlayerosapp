/**
 * Client home — "frame + sheet" architecture.
 *
 * Operator-dashboard discipline applied to the paper surface:
 *  - one charcoal hero (goal + big number) up top, via `ClientShell.hero`
 *  - one cream sheet below — no band-stacking, no tonal jumps
 *  - hierarchy comes from type + spacing + hairlines, never from background
 *  - KPI strip is hairline-divided, every cell has a delta or a CTA (no `—`)
 *  - two-column desktop layout: main flow left, rail right
 *
 * Pages still get scannable in 30 seconds; the magazine bands are gone.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  FileText,
  TrendingUp,
  TrendingDown,
  FilePlus,
  Sparkles,
  BarChart3,
  Phone,
} from "lucide-react";
import {
  getMyClientDashboard,
  getMyClientAnalytics,
} from "@/lib/shared/clientPortal/clientAuth.functions";
import { ClientShell } from "@/components/app/ClientShell";
import { StatusChip, useCountUp } from "@/components/client/bits";
import {
  TrafficTrend,
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

  const activeLeads = portal.leads.filter(
    (l) => l.status !== "lost" && l.status !== "junk",
  );

  const justWon = portal.leads.some(
    (l) =>
      l.status === "won" &&
      Date.now() - new Date(l.createdAt).getTime() < 24 * 3600 * 1000,
  );

  const publishEvents = portal.recentActivity
    .filter((a) => a.type === "page_published" || a.type === "page_optimized")
    .map((a) => ({
      date: a.date,
      label: a.label,
      kind:
        a.type === "page_published"
          ? ("published" as const)
          : ("optimized" as const),
    }));

  const showHowItWorks = portal.recentActivity.length < 3;
  const latestReport =
    portal.reports.length > 0 && portal.reports[0].shareToken
      ? portal.reports[0]
      : null;

  return (
    <ClientShell
      businessName={portal.businessName}
      locale={locale}
      hero={<HomeHero portal={portal} locale={locale} />}
    >
      {justWon && (
        <div className="mb-6">
          <WonBanner leads={portal.leads} locale={locale} />
        </div>
      )}

      {/* KPI strip — hairline-divided, deltas always present, empty cells
          turn into CTAs so nothing reads as "no data". */}
      <KpiStrip portal={portal} analytics={analytics} locale={locale} />

      {/* Two-column body: main flow left, rail right. */}
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px] lg:gap-12">
        <div className="min-w-0 space-y-10">
          {analytics && (
            <Section
              title={
                locale === "nl"
                  ? "Bezoekers & conversies"
                  : "Visitors & conversions"
              }
              hint={
                locale === "nl"
                  ? "Amber-stippen markeren publicaties."
                  : "Amber dots mark publications."
              }
            >
              <TrafficTrend
                analytics={analytics}
                locale={locale}
                events={publishEvents}
              />
            </Section>
          )}

          <Section
            title={c.recentLeads}
            action={
              activeLeads.length > 0 ? (
                <Link
                  to="/client/leads"
                  className="flex items-center gap-1 text-[13px] font-semibold text-amber-deep hover:underline"
                >
                  {c.allLeads} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : undefined
            }
          >
            {activeLeads.length > 0 ? (
              <ul className="divide-y divide-paper-line border-y border-paper-line">
                {activeLeads.slice(0, 5).map((l) => (
                  <li key={l.id}>
                    <Link
                      to="/client/leads"
                      className="flex items-center gap-3 py-3 transition-colors hover:bg-paper-subtle/40"
                    >
                      <LeadAvatar name={l.name ?? "?"} source={l.source} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-ink">
                          {l.name ?? c.unknownCaller}
                        </p>
                        <p className="mt-0.5 truncate text-[13px] text-ink-3">
                          {l.source
                            ? `${c.via} ${c.sources[l.source] ?? l.source} · `
                            : ""}
                          {formatRelative(l.createdAt, locale)}
                        </p>
                      </div>
                      <StatusChip status={l.status} locale={locale} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<Phone className="h-4 w-4" />}
                title={
                  locale === "nl"
                    ? "Nog geen leads deze maand"
                    : "No leads yet this month"
                }
                body={
                  locale === "nl"
                    ? "Zodra er een nieuwe aanvraag binnenkomt verschijnt die hier."
                    : "New requests will appear here as they arrive."
                }
              />
            )}
          </Section>

          {portal.recentActivity.length > 0 && (
            <Section title={c.whatWeDid}>
              <ul className="divide-y divide-paper-line border-y border-paper-line">
                {portal.recentActivity.slice(0, 6).map((a, i) => (
                  <li key={i}>
                    <ActivityRow activity={a} locale={locale} />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {/* ── Rail ─────────────────────────────────────────────── */}
        <aside className="space-y-10 lg:sticky lg:top-6 lg:self-start">
          {latestReport ? (
            <Section title={locale === "nl" ? "Laatste rapport" : "Latest report"}>
              <a
                href={`/r/${latestReport.shareToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-[6px] border border-paper-line bg-paper-raised p-4 transition-colors hover:border-amber/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="label-mono">LeadLayer · Report</p>
                    <p className="mt-2 font-display text-lg font-extrabold leading-tight text-ink">
                      {latestReport.periodLabel}
                    </p>
                    <p className="mt-1 text-[13px] text-ink-2">
                      {c.reportLeads(latestReport.leadCount)} ·{" "}
                      {formatMoney(latestReport.revenue, locale)}
                    </p>
                  </div>
                  <FileText className="h-5 w-5 shrink-0 text-ink-3 transition-colors group-hover:text-amber-deep" />
                </div>
                <div className="mt-4 flex items-center gap-1 text-[13px] font-semibold text-amber-deep">
                  {c.viewLatestReport}
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </a>
            </Section>
          ) : (
            <Section title={locale === "nl" ? "Laatste rapport" : "Latest report"}>
              <EmptyState
                icon={<FileText className="h-4 w-4" />}
                title={
                  locale === "nl"
                    ? "Nog geen rapport"
                    : "No report yet"
                }
                body={
                  locale === "nl"
                    ? "Je eerste maandeditie verschijnt aan het einde van de maand."
                    : "Your first monthly issue arrives at month end."
                }
              />
            </Section>
          )}

          {portal.nextMonthFocus.length > 0 && (
            <Section title={c.comingNext}>
              <ol className="space-y-3">
                {portal.nextMonthFocus.slice(0, 4).map((f, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-[14px] leading-snug text-ink"
                  >
                    <span className="mt-px font-display text-[13px] font-extrabold tabular-nums text-amber-deep">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1">{f}</span>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {showHowItWorks && (
            <Section title={c.howItWorks}>
              <ol className="space-y-4">
                {c.howSteps.map((s, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-px font-display text-[13px] font-extrabold tabular-nums text-amber-deep">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink">{s.title}</p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">
                        {s.copy}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </aside>
      </div>
    </ClientShell>
  );
}

// ── Layout primitives ─────────────────────────────────────────────

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-bold tracking-tight text-ink">
            {title}
          </h2>
          {hint && <p className="mt-0.5 text-[13px] text-ink-3">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({
  icon,
  title,
  body,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta?: { label: string; to: "/client/leads" | "/client/pages" | "/client/reports" };
}) {
  return (
    <div className="flex items-start gap-3 border-y border-paper-line py-5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] bg-paper-subtle text-ink-2">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{body}</p>
        {cta && (
          <Link
            to={cta.to}
            className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-amber-deep hover:underline"
          >
            {cta.label} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

// ── KPI strip ─────────────────────────────────────────────────────

/**
 * Hairline-divided KPI strip — 3 cells on desktop, stacked on mobile.
 * Every cell has a delta or a CTA, never a bare `—`.
 */
function KpiStrip({
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
    <div className="grid divide-y divide-paper-line border-y border-paper-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <KpiCell
        label={c.statRevenue}
        value={formatMoney(portal.stats.provenRevenue, locale)}
        delta={leadsDelta}
        deltaLabel={c.vsLastMonth(prevMonth)}
        to="/client/leads"
        accent="success"
      />
      <KpiCell
        label={a.conversionRate}
        value={analytics ? `${analytics.totals.conversionRate}%` : null}
        emptyTitle={
          locale === "nl" ? "Geen conversie-data" : "No conversion data"
        }
        emptyBody={
          locale === "nl"
            ? "Koppel je formulier om dit te zien."
            : "Connect your form to track this."
        }
        emptyCta={{
          label: locale === "nl" ? "Naar pagina's" : "Open pages",
          to: "/client/pages",
        }}
      />
      <KpiCell
        label={a.visitors}
        value={analytics ? analytics.totals.sessions.toLocaleString() : null}
        emptyTitle={
          locale === "nl" ? "Nog geen verkeer" : "No traffic yet"
        }
        emptyBody={
          locale === "nl"
            ? "Verkeer komt binnen zodra een pagina live staat."
            : "Traffic appears once a page goes live."
        }
        emptyCta={{
          label: locale === "nl" ? "Bekijk pagina's" : "View pages",
          to: "/client/pages",
        }}
      />
    </div>
  );
}

function KpiCell({
  label,
  value,
  delta,
  deltaLabel,
  to,
  accent,
  emptyTitle,
  emptyBody,
  emptyCta,
}: {
  label: string;
  value: string | null;
  delta?: number;
  deltaLabel?: string;
  to?: "/client/leads" | "/client/pages" | "/client/reports";
  accent?: "success";
  emptyTitle?: string;
  emptyBody?: string;
  emptyCta?: { label: string; to: "/client/leads" | "/client/pages" | "/client/reports" };
}) {
  // Empty cell → talk to the operator instead of showing a dash.
  if (!value) {
    return (
      <div className="px-5 py-5 sm:px-6">
        <p className="label-mono">{label}</p>
        <p className="mt-2 text-[15px] font-semibold text-ink">{emptyTitle}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{emptyBody}</p>
        {emptyCta && (
          <Link
            to={emptyCta.to}
            className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-amber-deep hover:underline"
          >
            {emptyCta.label} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    );
  }

  const hasDelta = typeof delta === "number" && delta !== 0;
  const DeltaIcon = (delta ?? 0) > 0 ? TrendingUp : TrendingDown;
  const deltaColor = (delta ?? 0) > 0 ? "text-paper-success" : "text-paper-danger";

  const inner = (
    <>
      <div className="flex items-center justify-between">
        <p className="label-mono">{label}</p>
        {to && (
          <ArrowUpRight className="h-3.5 w-3.5 text-ink-3 transition-colors group-hover:text-amber-deep" />
        )}
      </div>
      <p
        className={`mt-3 font-display text-[30px] font-extrabold leading-none tracking-[-0.02em] sm:text-[34px] ${
          accent === "success" ? "text-paper-success" : "text-ink"
        }`}
      >
        {value}
      </p>
      {hasDelta && (
        <span className={`mt-2 flex items-center gap-1 text-[12px] font-semibold ${deltaColor}`}>
          <DeltaIcon className="h-3.5 w-3.5 shrink-0" />
          {(delta as number) > 0 ? "+" : ""}
          {delta} {deltaLabel}
        </span>
      )}
    </>
  );

  return to ? (
    <Link to={to} className="group block px-5 py-5 transition-colors hover:bg-paper-subtle/40 sm:px-6">
      {inner}
    </Link>
  ) : (
    <div className="px-5 py-5 sm:px-6">{inner}</div>
  );
}

// ── Lead avatar ───────────────────────────────────────────────────

function LeadAvatar({ name, source }: { name: string; source?: string | null }) {
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  const tint =
    source === "phone"
      ? { bg: "rgba(217,119,6,0.16)", fg: "var(--amber-deep)" }
      : source === "form"
        ? { bg: "rgba(47,90,117,0.14)", fg: "var(--paper-info)" }
        : source === "walk_in"
          ? { bg: "rgba(31,122,54,0.14)", fg: "var(--paper-success)" }
          : { bg: "var(--paper-subtle)", fg: "var(--ink-2)" };
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-[13px] font-bold"
      style={{ backgroundColor: tint.bg, color: tint.fg }}
    >
      {initial}
    </span>
  );
}

// ── Hero (rendered inside the charcoal frame) ─────────────────────

/**
 * "Cover of the report" hero. Editorial composition:
 *  - eyebrow row (greeting + live pulse showing last lead)
 *  - oversized goal headline as the lede sentence
 *  - massive count + target, anchored by a full-width amber progress rail
 *  - meta row of hairline-divided facts (status / days left / weekly delta)
 *  - CTA pinned bottom-right, sparkline above it as a quiet rhythm chart
 */
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
  const statusDot = isGood ? "#7BC796" : isBehind ? "#E8B94A" : "#B5AEA3";
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

  const heroCta =
    portal.reports.length > 0 && portal.reports[0].shareToken
      ? { label: c.viewLatestReport, to: "/client/reports" as const }
      : { label: c.viewLeads, to: "/client/leads" as const };

  // Progress rail: actual vs target if there's a goal, otherwise vs last month.
  const percent =
    target && target > 0
      ? Math.min(100, Math.round((actual / target) * 100))
      : Math.min(100, Math.round(goal?.progressPercent ?? 0));

  // Lede sentence — prefer the configured goal title, otherwise generate one.
  const lede =
    goal?.title ??
    (locale === "nl"
      ? "Nieuwe klanten deze maand"
      : "New customers this month");

  // Weekly delta (this week vs last 7 days prior) — small but factual.
  const now = Date.now();
  const wk = 7 * 24 * 3600 * 1000;
  let thisWeek = 0;
  let prevWeek = 0;
  for (const l of portal.leads) {
    if (l.status === "junk") continue;
    const age = now - new Date(l.createdAt).getTime();
    if (age < wk) thisWeek++;
    else if (age < 2 * wk) prevWeek++;
  }
  const weekDelta = thisWeek - prevWeek;

  // "Last lead X ago" — live pulse signalling activity. Hidden if no leads.
  const mostRecent = portal.leads
    .filter((l) => l.status !== "junk")
    .map((l) => new Date(l.createdAt).getTime())
    .sort((a, b) => b - a)[0];

  return (
    <div className="flex flex-col gap-8">
      {/* Row 1 — eyebrow + live pulse */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label-mono">
          {greeting(locale)} · {formatDayline(locale)}
        </p>
        {mostRecent && (
          <div className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[12px] text-ondark-2">
            <span className="relative flex h-1.5 w-1.5">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ backgroundColor: "#E85D04" }}
              />
              <span
                className="relative inline-flex h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: "#E85D04" }}
              />
            </span>
            {locale === "nl" ? "Laatste lead" : "Last lead"}{" "}
            <span className="text-ink">
              {formatRelative(new Date(mostRecent).toISOString(), locale)}
            </span>
          </div>
        )}
      </div>

      {/* Row 2 — lede + huge number */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink sm:text-[34px]">
            {lede}
          </h1>

          <div className="mt-6 flex items-baseline gap-4">
            <span className="font-display text-[88px] font-extrabold leading-[0.85] tracking-[-0.04em] text-ink sm:text-[112px]">
              <span className="text-amber-bright">{animated}</span>
              {target != null && (
                <span className="ml-2 text-[40px] font-bold text-ondark-3 sm:text-[52px]">
                  / {target}
                </span>
              )}
            </span>
          </div>

          {/* Full-width progress rail */}
          <div className="mt-6">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
              <div
                className={`h-full rounded-full bg-amber transition-[width] duration-[900ms] ease-out ${isComplete ? "animate-pulse-soft" : ""}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[12px] font-medium text-ondark-3">
              <span>{percent}% {c.ofGoal}</span>
              {goal?.daysRemaining != null && (
                <span>{c.daysLeft(goal.daysRemaining)}</span>
              )}
            </div>
          </div>

          {/* Hairline meta row + primary CTA */}
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
            <span
              className="flex items-center gap-2 text-[13px] font-semibold"
              style={{ color: statusColor }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: statusDot }}
              />
              {statusLabel}
            </span>
            <span className="h-3 w-px bg-white/10" />
            <span className="text-[13px] text-ondark-2">
              {weekDelta >= 0 ? "+" : ""}
              {weekDelta}{" "}
              <span className="text-ondark-3">
                {locale === "nl" ? "vs vorige week" : "vs last week"}
              </span>
            </span>
            <Link
              to={heroCta.to}
              className="ml-auto flex items-center gap-1.5 rounded-[6px] bg-amber px-4 py-2 text-[13px] font-semibold text-paper transition-colors hover:bg-amber-deep"
            >
              {heroCta.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Right — sparkline panel, sits as a quiet rhythm chart */}
        <div className="hidden lg:flex lg:flex-col lg:justify-end lg:pb-2">
          <div className="rounded-[6px] border border-white/8 bg-white/[0.03] p-5">
            <HeroSparkline leads={portal.leads} locale={locale} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Activity row ──────────────────────────────────────────────────

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
    <div className="flex items-start gap-3 py-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] bg-paper-subtle">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] leading-snug text-ink">{activity.label}</p>
        {activity.detail && (
          <p className="mt-0.5 truncate text-[13px] text-ink-2">{activity.detail}</p>
        )}
      </div>
      <p className="shrink-0 text-[12px] text-ink-3">{formatRelative(activity.date, locale)}</p>
    </div>
  );
}
