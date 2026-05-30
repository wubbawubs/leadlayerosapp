import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  ExternalLink,
  Copy,
  Link2,
  Link2Off,
  CheckCircle2,
} from "lucide-react";

import {
  listMonthlyReports,
  generateMonthlyReport,
  updateMonthlyReportStatus,
  generateMonthlyReportShareLink,
  revokeMonthlyReportShareLink,
} from "@/lib/shared/monthlyReports/monthlyReports.functions";
import type { MonthlyReport } from "@/lib/shared/monthlyReports/schemas";
import {
  listMonthlyExecutionPlans,
  generateMonthlyExecutionPlan,
  updateMonthlyExecutionPlanStatus,
} from "@/lib/shared/monthlyExecutionPlans/monthlyExecutionPlans.functions";
import type { MonthlyExecutionPlan } from "@/lib/shared/monthlyExecutionPlans/schemas";

import { StatusPill, type StatusTone } from "@/components/execution/StatusPill";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/clients/$tenantId/reports")({
  component: ReportsTab,
  head: () => ({ meta: [{ title: "Reports — LeadLayer" }] }),
});

function ReportsTab() {
  const { tenantId } = Route.useParams();

  const fetchReports = useServerFn(listMonthlyReports);
  const fetchPlans = useServerFn(listMonthlyExecutionPlans);

  const reportsQuery = useQuery({
    queryKey: ["monthly-reports", tenantId],
    queryFn: () => fetchReports({ data: { tenantId, limit: 12 } }),
  });
  const plansQuery = useQuery({
    queryKey: ["monthly-execution-plans", tenantId],
    queryFn: () => fetchPlans({ data: { tenantId, limit: 12 } }),
  });

  const reports = reportsQuery.data?.reports ?? [];
  const plans = plansQuery.data?.plans ?? [];
  const latest = reports[0] ?? null;
  const history = reports.slice(1);

  return (
    <div className="mx-auto max-w-7xl space-y-12 px-8 py-10">
      <header className="border-b border-border pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          § Reports · Monthly cadence
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
          Monthly reports & execution plan
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Generate the monthly proof report, share it with the client, and
          approve next month's execution plan.
        </p>
      </header>

      <LatestReportSection tenantId={tenantId} latest={latest} loading={reportsQuery.isLoading} />

      {history.length > 0 && (
        <ReportHistorySection tenantId={tenantId} reports={history} />
      )}

      <ExecutionPlanSection
        tenantId={tenantId}
        plans={plans}
        loading={plansQuery.isLoading}
      />
    </div>
  );
}

// ----------------------------------------------------------------
// Latest report
// ----------------------------------------------------------------

function LatestReportSection({
  tenantId,
  latest,
  loading,
}: {
  tenantId: string;
  latest: MonthlyReport | null;
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const generateFn = useServerFn(generateMonthlyReport);

  const generateMutation = useMutation({
    mutationFn: () => {
      const { periodStart, periodEnd } = lastFullMonth();
      return generateFn({ data: { tenantId, periodStart, periodEnd } });
    },
    onSuccess: () => {
      toast.success("Report generated");
      queryClient.invalidateQueries({ queryKey: ["monthly-reports", tenantId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to generate report"),
  });

  const { periodStart, periodEnd } = lastFullMonth();
  const nextLabel = formatPeriodLabel(periodStart, periodEnd);

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            § 01 · Latest report
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold tracking-tight text-foreground">
            {latest ? formatPeriodLabel(latest.periodStart, latest.periodEnd) : "Nothing yet"}
          </h3>
        </div>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="gap-2 font-mono text-[11px] uppercase tracking-[0.14em]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {generateMutation.isPending
            ? "Generating…"
            : `Generate ${nextLabel}`}
        </Button>
      </div>

      {loading && (
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Loading…
        </p>
      )}

      {!loading && !latest && (
        <div className="border border-dashed border-border bg-card/60 p-10 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            No reports yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Generate the first monthly report for this client.
          </p>
        </div>
      )}

      {latest && <ReportCard tenantId={tenantId} report={latest} prominent />}
    </section>
  );
}

function ReportCard({
  tenantId,
  report,
  prominent = false,
}: {
  tenantId: string;
  report: MonthlyReport;
  prominent?: boolean;
}) {
  const queryClient = useQueryClient();

  const approveFn = useServerFn(updateMonthlyReportStatus);
  const shareFn = useServerFn(generateMonthlyReportShareLink);
  const revokeFn = useServerFn(revokeMonthlyReportShareLink);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["monthly-reports", tenantId] });

  const approveMutation = useMutation({
    mutationFn: () =>
      approveFn({
        data: { tenantId, reportId: report.id, status: "approved" },
      }),
    onSuccess: () => {
      toast.success("Report approved");
      invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to approve"),
  });

  const shareMutation = useMutation({
    mutationFn: () => shareFn({ data: { tenantId, reportId: report.id } }),
    onSuccess: () => {
      toast.success("Share link created");
      invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to share"),
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeFn({ data: { tenantId, reportId: report.id } }),
    onSuccess: () => {
      toast.success("Share link revoked");
      invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to revoke"),
  });

  const lead = report.leadSummary;
  const goal = report.goalProgressSummary;
  const wp = report.wordpressSummary;

  const shareUrl =
    report.shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/r/${report.shareToken}`
      : null;

  const sharePath = report.shareToken ? `/r/${report.shareToken}` : null;
  const canApprove =
    report.status === "draft" || report.status === "ready_for_review";

  return (
    <div className="border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {formatPeriodLabel(report.periodStart, report.periodEnd)}
          </p>
          <h4 className={`mt-1 font-display ${prominent ? "text-xl" : "text-base"} font-semibold tracking-tight text-foreground`}>
            Monthly report
          </h4>
        </div>
        <StatusPill tone={reportStatusTone(report.status)}>{report.status}</StatusPill>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-5">
        <Stat label="Leads" value={String(lead.total ?? 0)} />
        <Stat label="Won" value={String(lead.won ?? goal.wonLeadCount ?? 0)} />
        <Stat label="Proven revenue" value={formatMoney(goal.provenRevenue)} />
        <Stat label="Pages published" value={String(wp.draftsPublished ?? 0)} />
        <Stat label="Pages optimized" value={String(wp.pagesOptimized ?? 0)} />
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {sharePath && (
          <a
            href={sharePath}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 border border-border bg-background px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition hover:border-accent hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" /> View share page
          </a>
        )}
        {shareUrl && (
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(shareUrl);
              toast.success("Link copied");
            }}
            className="inline-flex items-center gap-1 border border-border bg-background px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition hover:border-accent hover:text-foreground"
          >
            <Copy className="h-3 w-3" /> Copy link
          </button>
        )}
        {!report.shareToken && (
          <Button
            size="sm"
            variant="outline"
            disabled={shareMutation.isPending}
            onClick={() => shareMutation.mutate()}
            className="h-7 gap-1.5 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em]"
          >
            <Link2 className="h-3 w-3" />
            {shareMutation.isPending ? "Creating…" : "Generate share link"}
          </Button>
        )}
        {report.shareToken && (
          <Button
            size="sm"
            variant="outline"
            disabled={revokeMutation.isPending}
            onClick={() => revokeMutation.mutate()}
            className="h-7 gap-1.5 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em]"
          >
            <Link2Off className="h-3 w-3" />
            {revokeMutation.isPending ? "Revoking…" : "Revoke link"}
          </Button>
        )}
        {canApprove && (
          <Button
            size="sm"
            disabled={approveMutation.isPending}
            onClick={() => approveMutation.mutate()}
            className="h-7 gap-1.5 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em]"
          >
            <CheckCircle2 className="h-3 w-3" />
            {approveMutation.isPending ? "Approving…" : "Approve"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-display text-lg font-bold tracking-tight text-foreground">
        {value}
      </dd>
    </div>
  );
}

// ----------------------------------------------------------------
// History
// ----------------------------------------------------------------

function ReportHistorySection({
  tenantId,
  reports,
}: {
  tenantId: string;
  reports: MonthlyReport[];
}) {
  return (
    <section>
      <div className="mb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          § 02 · History
        </p>
        <h3 className="mt-1 font-display text-lg font-semibold tracking-tight text-foreground">
          Past reports
        </h3>
      </div>
      <div className="space-y-4">
        {reports.map((r) => (
          <ReportCard key={r.id} tenantId={tenantId} report={r} />
        ))}
      </div>
    </section>
  );
}

// ----------------------------------------------------------------
// Execution plan
// ----------------------------------------------------------------

function ExecutionPlanSection({
  tenantId,
  plans,
  loading,
}: {
  tenantId: string;
  plans: MonthlyExecutionPlan[];
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const generateFn = useServerFn(generateMonthlyExecutionPlan);
  const updateFn = useServerFn(updateMonthlyExecutionPlanStatus);

  const latest = plans[0] ?? null;

  const generateMutation = useMutation({
    mutationFn: () => {
      const { periodStart, periodEnd } = nextFullMonth();
      return generateFn({ data: { tenantId, periodStart, periodEnd } });
    },
    onSuccess: () => {
      toast.success("Execution plan generated");
      queryClient.invalidateQueries({
        queryKey: ["monthly-execution-plans", tenantId],
      });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to generate plan"),
  });

  const approveMutation = useMutation({
    mutationFn: () => {
      if (!latest) throw new Error("No plan");
      return updateFn({
        data: { tenantId, planId: latest.id, status: "approved" },
      });
    },
    onSuccess: () => {
      toast.success("Plan approved");
      queryClient.invalidateQueries({
        queryKey: ["monthly-execution-plans", tenantId],
      });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to approve"),
  });

  const next = nextFullMonth();
  const nextLabel = formatPeriodLabel(next.periodStart, next.periodEnd);

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            § 03 · Monthly execution plan
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold tracking-tight text-foreground">
            {latest
              ? formatPeriodLabel(latest.periodStart, latest.periodEnd)
              : "No plan yet"}
          </h3>
        </div>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          variant="outline"
          className="gap-2 font-mono text-[11px] uppercase tracking-[0.14em]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {generateMutation.isPending ? "Generating…" : `Generate ${nextLabel}`}
        </Button>
      </div>

      {loading && (
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Loading…
        </p>
      )}

      {!loading && !latest && (
        <div className="border border-dashed border-border bg-card/60 p-10 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            No plan yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Generate next month's execution plan to align operator work with the goal.
          </p>
        </div>
      )}

      {latest && (
        <div className="border border-border bg-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Package: {latest.packageTier}
              </p>
              <h4 className="mt-1 font-display text-base font-semibold tracking-tight text-foreground">
                {latest.selectedActions.length} planned action
                {latest.selectedActions.length === 1 ? "" : "s"}
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill tone={planStatusTone(latest.status)}>{latest.status}</StatusPill>
              {(latest.status === "draft" || latest.status === "ready_for_review") && (
                <Button
                  size="sm"
                  disabled={approveMutation.isPending}
                  onClick={() => approveMutation.mutate()}
                  className="h-7 gap-1.5 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em]"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {approveMutation.isPending ? "Approving…" : "Approve"}
                </Button>
              )}
            </div>
          </div>

          {latest.rationale && (
            <p className="mt-4 text-sm text-muted-foreground">{latest.rationale}</p>
          )}

          {latest.selectedActions.length > 0 && (
            <ol className="mt-4 divide-y divide-border border-y border-border">
              {latest.selectedActions.map((a, i) => (
                <li key={a.id} className="flex items-start gap-4 py-3">
                  <span className="mt-0.5 w-6 shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">{a.title}</div>
                    <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {a.category.replace(/_/g, " ")} · {a.deliveryType} · impact {a.expectedLeadImpact}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {a.priority}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {latest.requiredInputs.length > 0 && (
            <div className="mt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Required inputs
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                {latest.requiredInputs.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ----------------------------------------------------------------
// helpers
// ----------------------------------------------------------------

function reportStatusTone(s: MonthlyReport["status"]): StatusTone {
  if (s === "approved" || s === "sent") return "green";
  if (s === "archived") return "red";
  return "amber";
}

function planStatusTone(s: MonthlyExecutionPlan["status"]): StatusTone {
  if (s === "approved" || s === "in_execution" || s === "completed") return "green";
  if (s === "archived") return "red";
  return "amber";
}

function lastFullMonth(): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based, current month
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0)); // last day of previous month
  return { periodStart: ymd(start), periodEnd: ymd(end) };
}

function nextFullMonth(): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m + 1, 1));
  const end = new Date(Date.UTC(y, m + 2, 0));
  return { periodStart: ymd(start), periodEnd: ymd(end) };
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatPeriodLabel(start: string, end: string): string {
  try {
    const s = new Date(`${start}T00:00:00Z`);
    return s.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return `${start} – ${end}`;
  }
}

function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}
