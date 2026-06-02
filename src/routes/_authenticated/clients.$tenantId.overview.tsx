import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Target,
  TrendingUp,
  FileText,
  CalendarRange,
  Layers,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";

import { getGoalProgress } from "@/lib/shared/reporting/goalProgress.functions";
import { getLeadStats, listLeads } from "@/lib/shared/leads/repo.functions";
import { getPageInventory } from "@/lib/shared/wordpressDrafts/pageInventory.functions";
import { listMonthlyReports } from "@/lib/shared/monthlyReports/monthlyReports.functions";
import { listMonthlyExecutionPlans } from "@/lib/shared/monthlyExecutionPlans/monthlyExecutionPlans.functions";
import { getExecutionBoard } from "@/lib/shared/execution/board.functions";
import { StatusPill, type StatusTone } from "@/components/execution/StatusPill";

export const Route = createFileRoute("/_authenticated/clients/$tenantId/overview")({
  component: OverviewTab,
  head: () => ({ meta: [{ title: "Overview — LeadLayer" }] }),
});

function OverviewTab() {
  const { tenantId } = Route.useParams();

  const fetchGoal = useServerFn(getGoalProgress);
  const fetchLeadStats = useServerFn(getLeadStats);
  const fetchWonLeads = useServerFn(listLeads);
  const fetchPages = useServerFn(getPageInventory);
  const fetchReports = useServerFn(listMonthlyReports);
  const fetchPlans = useServerFn(listMonthlyExecutionPlans);
  const fetchBoard = useServerFn(getExecutionBoard);

  const goalQ = useQuery({
    queryKey: ["overview-goal", tenantId],
    queryFn: () => fetchGoal({ data: { tenantId } }),
  });
  const statsQ = useQuery({
    queryKey: ["overview-leadstats", tenantId],
    queryFn: () => fetchLeadStats({ data: { tenantId } }),
  });
  const wonQ = useQuery({
    queryKey: ["overview-won", tenantId],
    queryFn: () => fetchWonLeads({ data: { tenantId, status: "won", limit: 200 } }),
  });
  const pagesQ = useQuery({
    queryKey: ["overview-pages", tenantId],
    queryFn: () => fetchPages({ data: { tenantId } }),
  });
  const reportsQ = useQuery({
    queryKey: ["overview-reports", tenantId],
    queryFn: () => fetchReports({ data: { tenantId, limit: 1 } }),
  });
  const plansQ = useQuery({
    queryKey: ["overview-plans", tenantId],
    queryFn: () => fetchPlans({ data: { tenantId, limit: 1 } }),
  });
  const boardQ = useQuery({
    queryKey: ["overview-board", tenantId],
    queryFn: () => fetchBoard({ data: { tenantId } }),
  });

  const goal = goalQ.data?.report;
  const stats = statsQ.data?.stats;
  const wonLeads = wonQ.data?.leads ?? [];
  const pages = pagesQ.data?.pages ?? [];
  const latestReport = reportsQ.data?.reports?.[0] ?? null;
  const latestPlan = plansQ.data?.plans?.[0] ?? null;
  const board = boardQ.data;

  const provenRevenue = wonLeads.reduce((acc, l) => acc + (l.closedAmount ?? 0), 0);

  // Page rollup
  const pageRollup = pages.reduce(
    (acc, p) => {
      if (p.source === "leadlayer_optimized") acc.optimized += 1;
      else if (p.status === "live") acc.live += 1;
      else if (p.status === "draft") acc.draft += 1;
      else if (p.status === "failed") acc.failed += 1;
      return acc;
    },
    { live: 0, draft: 0, optimized: 0, failed: 0 },
  );

  // Execution attention rollup
  const summary = board?.summary;
  const attention = summary
    ? {
        needs_edit: summary.needs_edit,
        in_qa: summary.in_qa,
        blocked: summary.blocked,
        manual_task: summary.manual_task,
        total:
          summary.needs_edit + summary.in_qa + summary.blocked + summary.manual_task,
      }
    : null;

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-8 py-10">
      <header className="border-b border-border pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          § 01 · Overview
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
          Client snapshot
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Single-glance status. Goal pace, lead flow, what's live, and what needs
          attention this week.
        </p>
      </header>

      <NeedsAttentionStrip
        tenantId={tenantId}
        attention={attention}
        nextAction={board?.nextAction ?? null}
        loading={boardQ.isLoading}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <GoalCard loading={goalQ.isLoading} goal={goal ?? null} tenantId={tenantId} />
        <LeadsCard
          loading={statsQ.isLoading || wonQ.isLoading}
          stats={stats ?? null}
          provenRevenue={provenRevenue}
          wonCount={wonLeads.length}
          tenantId={tenantId}
        />
        <DeliveryCard loading={pagesQ.isLoading} rollup={pageRollup} tenantId={tenantId} />
        <LatestReportCard
          loading={reportsQ.isLoading}
          report={latestReport}
          tenantId={tenantId}
        />
        <NextPlanCard
          loading={plansQ.isLoading}
          plan={latestPlan}
          tenantId={tenantId}
        />
      </div>
    </div>
  );
}

/* ------------------------------ Building blocks ----------------------------- */

function SystemCard({
  index,
  title,
  icon,
  to,
  toLabel,
  tenantId,
  children,
}: {
  index: string;
  title: string;
  icon: React.ReactNode;
  to?: "/clients/$tenantId/execution" | "/clients/$tenantId/leads" | "/clients/$tenantId/pages" | "/clients/$tenantId/reports" | "/clients/$tenantId/overview";
  toLabel?: string;
  tenantId: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          <span className="text-accent">§ {index}</span>
          <span>{title}</span>
        </div>
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <div className="mt-4 flex-1">{children}</div>
      {to && (
        <div className="mt-5 border-t border-border pt-3">
          <Link
            to={to}
            params={{ tenantId }}
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground hover:text-accent"
          >
            {toLabel ?? "Open"} →
          </Link>
        </div>
      )}
    </section>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </p>
  );
}

function CardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-2.5 w-12 rounded skeleton-shimmer" />
            <div className="h-6 w-10 rounded skeleton-shimmer" />
            <div className="h-2 w-8 rounded skeleton-shimmer" />
          </div>
        ))}
      </div>
      <div className="h-2 w-3/4 rounded skeleton-shimmer" />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/* ----------------------------- Needs attention ----------------------------- */

function NeedsAttentionStrip({
  tenantId,
  attention,
  nextAction,
  loading,
}: {
  tenantId: string;
  attention: { needs_edit: number; in_qa: number; blocked: number; manual_task: number; total: number } | null;
  nextAction: string | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="h-2.5 w-24 rounded skeleton-shimmer" />
        <div className="mt-3 h-3 w-64 rounded skeleton-shimmer" />
      </div>
    );
  }
  if (!attention || attention.total === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          <span className="text-accent">§ 00 · Needs attention</span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {nextAction ?? "Nothing needs operator attention right now."}
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          <AlertTriangle className="h-3 w-3 text-[color:var(--status-amber)]" />
          <span className="text-accent">§ 00 · Needs attention</span>
        </div>
        <Link
          to="/clients/$tenantId/execution"
          params={{ tenantId }}
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground hover:text-accent"
        >
          Open execution →
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {attention.needs_edit > 0 && (
          <StatusPill tone="amber">{attention.needs_edit} needs edit</StatusPill>
        )}
        {attention.in_qa > 0 && (
          <StatusPill tone="info">{attention.in_qa} in QA review</StatusPill>
        )}
        {attention.blocked > 0 && (
          <StatusPill tone="red">{attention.blocked} blocked</StatusPill>
        )}
        {attention.manual_task > 0 && (
          <StatusPill tone="neutral">{attention.manual_task} manual task</StatusPill>
        )}
      </div>
      {nextAction && (
        <p className="mt-4 text-sm text-foreground">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Next ·{" "}
          </span>
          {nextAction}
        </p>
      )}
    </div>
  );
}

/* -------------------------------- Goal card -------------------------------- */

type GoalReport = NonNullable<Awaited<ReturnType<typeof getGoalProgress>>>["report"];

const GOAL_TONE: Record<GoalReport["status"], StatusTone> = {
  no_goal: "neutral",
  no_data: "neutral",
  on_track: "green",
  ahead: "green",
  behind: "amber",
  complete: "info",
};

const GOAL_LABEL: Record<GoalReport["status"], string> = {
  no_goal: "No goal",
  no_data: "No data",
  on_track: "On track",
  ahead: "Ahead",
  behind: "Behind",
  complete: "Complete",
};

function GoalCard({
  loading,
  goal,
  tenantId,
}: {
  loading: boolean;
  goal: GoalReport | null;
  tenantId: string;
}) {
  return (
    <SystemCard index="01" title="Growth goal" icon={<Target className="h-4 w-4" />} tenantId={tenantId}>
      {loading ? (
        <CardSkeleton />
      ) : !goal || goal.status === "no_goal" ? (
        <EmptyLine>No active growth goal set.</EmptyLine>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <StatusPill tone={GOAL_TONE[goal.status]}>{GOAL_LABEL[goal.status]}</StatusPill>
            {goal.goalTitle && (
              <span className="truncate text-sm text-foreground">{goal.goalTitle}</span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Required" value={goal.requiredLeads || "—"} hint="leads" />
            <Stat label="Actual" value={goal.actualLeads} hint="logged" />
            <Stat
              label="Gap"
              value={goal.gap > 0 ? `+${goal.gap}` : goal.gap < 0 ? goal.gap : "0"}
              hint={goal.gap > 0 ? "behind pace" : goal.gap < 0 ? "ahead" : "on pace"}
            />
          </div>
          {goal.timeframeMonths && (
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {goal.daysElapsed}d elapsed · {goal.daysRemaining}d remaining ·{" "}
              {goal.leadsPerDay}/day
            </p>
          )}
        </div>
      )}
    </SystemCard>
  );
}

/* -------------------------------- Leads card ------------------------------- */

function LeadsCard({
  loading,
  stats,
  provenRevenue,
  wonCount,
  tenantId,
}: {
  loading: boolean;
  stats: { last30Days: number; byStatus: Record<string, number> } | null;
  provenRevenue: number;
  wonCount: number;
  tenantId: string;
}) {
  return (
    <SystemCard
      index="02"
      title="Leads · last 30 days"
      icon={<TrendingUp className="h-4 w-4" />}
      to="/clients/$tenantId/leads"
      toLabel="Open leads"
      tenantId={tenantId}
    >
      {loading ? (
        <CardSkeleton />
      ) : !stats ? (
        <EmptyLine>No lead data yet.</EmptyLine>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <Stat label="New" value={stats.last30Days} hint="last 30d" />
          <Stat label="Won" value={wonCount} hint="all-time" />
          <Stat
            label="Revenue"
            value={
              provenRevenue > 0
                ? `€${Math.round(provenRevenue).toLocaleString()}`
                : "—"
            }
            hint="proven"
          />
        </div>
      )}
    </SystemCard>
  );
}

/* ------------------------------- Delivery card ----------------------------- */

function DeliveryCard({
  loading,
  rollup,
  tenantId,
}: {
  loading: boolean;
  rollup: { live: number; draft: number; optimized: number; failed: number };
  tenantId: string;
}) {
  const total = rollup.live + rollup.draft + rollup.optimized + rollup.failed;
  return (
    <SystemCard
      index="03"
      title="Delivery"
      icon={<Layers className="h-4 w-4" />}
      to="/clients/$tenantId/pages"
      toLabel="Open pages"
      tenantId={tenantId}
    >
      {loading ? (
        <CardSkeleton />
      ) : total === 0 ? (
        <EmptyLine>No pages delivered yet.</EmptyLine>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Live" value={rollup.live} hint="new pages" />
            <Stat label="Drafts" value={rollup.draft} />
            <Stat label="Optimized" value={rollup.optimized} hint="existing" />
          </div>
          {rollup.failed > 0 && (
            <StatusPill tone="red">{rollup.failed} failed to publish</StatusPill>
          )}
        </div>
      )}
    </SystemCard>
  );
}

/* ---------------------------- Latest report card --------------------------- */

const REPORT_TONE: Record<string, StatusTone> = {
  draft: "neutral",
  ready_for_review: "info",
  approved: "green",
  sent: "green",
  archived: "neutral",
};

function LatestReportCard({
  loading,
  report,
  tenantId,
}: {
  loading: boolean;
  report:
    | {
        id: string;
        periodStart: string;
        periodEnd: string;
        status: string;
        shareToken: string | null;
      }
    | null;
  tenantId: string;
}) {
  return (
    <SystemCard
      index="04"
      title="Latest report"
      icon={<FileText className="h-4 w-4" />}
      to="/clients/$tenantId/reports"
      toLabel="Open reports"
      tenantId={tenantId}
    >
      {loading ? (
        <CardSkeleton />
      ) : !report ? (
        <EmptyLine>No monthly report generated yet.</EmptyLine>
      ) : (
        <div className="space-y-3">
          <p className="font-display text-lg font-semibold text-foreground">
            {formatPeriod(report.periodStart, report.periodEnd)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={REPORT_TONE[report.status] ?? "neutral"}>
              {report.status.replace(/_/g, " ")}
            </StatusPill>
            {report.shareToken ? (
              <a
                href={`/r/${report.shareToken}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-accent hover:underline"
              >
                Share link <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                No share link
              </span>
            )}
          </div>
        </div>
      )}
    </SystemCard>
  );
}

/* ----------------------------- Next plan card ----------------------------- */

const PLAN_TONE: Record<string, StatusTone> = {
  draft: "neutral",
  ready_for_review: "info",
  approved: "green",
  in_execution: "info",
  completed: "green",
  archived: "neutral",
};

function NextPlanCard({
  loading,
  plan,
  tenantId,
}: {
  loading: boolean;
  plan:
    | {
        id: string;
        periodStart: string;
        periodEnd: string;
        status: string;
        packageTier: string;
        selectedActions: Array<{ title: string }>;
      }
    | null;
  tenantId: string;
}) {
  return (
    <SystemCard
      index="05"
      title="Next execution plan"
      icon={<CalendarRange className="h-4 w-4" />}
      to="/clients/$tenantId/reports"
      toLabel="Open plan"
      tenantId={tenantId}
    >
      {loading ? (
        <CardSkeleton />
      ) : !plan ? (
        <EmptyLine>No execution plan generated yet.</EmptyLine>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-display text-lg font-semibold text-foreground">
              {formatPeriod(plan.periodStart, plan.periodEnd)}
            </p>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {plan.packageTier}
            </span>
          </div>
          <StatusPill tone={PLAN_TONE[plan.status] ?? "neutral"}>
            {plan.status.replace(/_/g, " ")}
          </StatusPill>
          {plan.selectedActions.length > 0 ? (
            <ul className="space-y-1 text-sm text-foreground">
              {plan.selectedActions.slice(0, 3).map((a, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate">{a.title}</span>
                </li>
              ))}
              {plan.selectedActions.length > 3 && (
                <li className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  + {plan.selectedActions.length - 3} more
                </li>
              )}
            </ul>
          ) : (
            <EmptyLine>No actions selected.</EmptyLine>
          )}
        </div>
      )}
    </SystemCard>
  );
}

/* -------------------------------- utilities -------------------------------- */

function formatPeriod(start: string, end: string) {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const sameMonth = s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
    const monthFmt = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });
    if (sameMonth) return monthFmt.format(s);
    return `${new Intl.DateTimeFormat("en", { month: "short" }).format(s)} – ${monthFmt.format(e)}`;
  } catch {
    return `${start} → ${end}`;
  }
}
