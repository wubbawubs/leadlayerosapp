import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import {
  generateMonthlyReport,
  generateMonthlyReportShareLink,
  listMonthlyReports,
  revokeMonthlyReportShareLink,
  updateMonthlyReportStatus,
} from "@/lib/shared/monthlyReports/monthlyReports.functions";
import type { MonthlyReport, MonthlyReportStatus } from "@/lib/shared/monthlyReports/schemas";

export const Route = createFileRoute("/_authenticated/growth/reports")({
  component: MonthlyReportsPage,
  head: () => ({
    meta: [{ title: "Monthly Reports — LeadLayer" }],
  }),
});

const STATUS_LABEL: Record<MonthlyReportStatus, string> = {
  draft: "Draft",
  ready_for_review: "Ready for review",
  approved: "Approved",
  sent: "Sent",
  archived: "Archived",
};

const STATUS_STYLE: Record<MonthlyReportStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  ready_for_review: "bg-amber-500/15 text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-400",
  sent: "bg-primary/15 text-primary",
  archived: "bg-muted text-muted-foreground",
};

function currentMonthPeriod(): { start: string; end: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

function MonthlyReportsPage() {
  const qc = useQueryClient();
  const fetchTenants = useServerFn(listMyTenants);
  const doGenerate = useServerFn(generateMonthlyReport);
  const doList = useServerFn(listMonthlyReports);
  const doUpdateStatus = useServerFn(updateMonthlyReportStatus);
  const doGenerateShareLink = useServerFn(generateMonthlyReportShareLink);
  const doRevokeShareLink = useServerFn(revokeMonthlyReportShareLink);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });
  const tenantId = tenantsQuery.data?.tenants[0]?.id ?? null;

  const reportsQuery = useQuery({
    queryKey: ["monthly-reports", tenantId],
    queryFn: () => doList({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });

  const period = currentMonthPeriod();
  const [periodStart, setPeriodStart] = useState(period.start);
  const [periodEnd, setPeriodEnd] = useState(period.end);
  const [selected, setSelected] = useState<MonthlyReport | null>(null);
  const [copied, setCopied] = useState(false);

  const generateMutation = useMutation({
    mutationFn: () => {
      if (!tenantId) throw new Error("No tenant");
      return doGenerate({ data: { tenantId, periodStart, periodEnd } });
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Monthly report generated");
        setSelected(res.report);
      }
      void qc.invalidateQueries({ queryKey: ["monthly-reports", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to generate report"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ reportId, status }: { reportId: string; status: MonthlyReportStatus }) => {
      if (!tenantId) throw new Error("No tenant");
      return doUpdateStatus({ data: { tenantId, reportId, status } });
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`Report marked as "${STATUS_LABEL[res.report.status]}"`);
        setSelected(res.report);
      }
      void qc.invalidateQueries({ queryKey: ["monthly-reports", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update status"),
  });

  const shareMutation = useMutation({
    mutationFn: ({ reportId }: { reportId: string }) => {
      if (!tenantId) throw new Error("No tenant");
      return doGenerateShareLink({ data: { tenantId, reportId } });
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Share link generated");
        setSelected(res.report);
      }
      void qc.invalidateQueries({ queryKey: ["monthly-reports", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to generate share link"),
  });

  const revokeMutation = useMutation({
    mutationFn: ({ reportId }: { reportId: string }) => {
      if (!tenantId) throw new Error("No tenant");
      return doRevokeShareLink({ data: { tenantId, reportId } });
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Share link revoked");
        setSelected(res.report);
      }
      void qc.invalidateQueries({ queryKey: ["monthly-reports", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to revoke share link"),
  });

  const reports = reportsQuery.data?.reports ?? [];
  const report = selected ?? reports[0] ?? null;

  return (
    <div className="min-h-screen bg-background bg-blueprint">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/app" className="text-muted-foreground hover:text-foreground">
            Dashboard
          </Link>
          <Link to="/growth/leads" className="text-muted-foreground hover:text-foreground">
            Leads
          </Link>
          <Link to="/growth/execution" className="text-muted-foreground hover:text-foreground">
            Execution
          </Link>
          <span className="font-medium text-foreground">Reports</span>
        </nav>
      </header>

      <main className="container mx-auto max-w-5xl px-6 pb-24 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Monthly Reports · V1
        </p>
        <h1 className="font-display text-4xl text-foreground">Monthly Reports</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Generate a monthly progress report showing leads, goal gap, delivery, and next steps.
          Review, edit the narrative, then mark it approved before sharing with the client.
        </p>

        {/* Generate controls */}
        <div className="mt-6 rounded-lg border border-border bg-card/70 p-5">
          <p className="mb-3 text-sm font-medium text-foreground">Generate report</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Period start</span>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Period end</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </label>
            <button
              disabled={!tenantId || generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {generateMutation.isPending ? "Generating…" : "Generate report"}
            </button>
          </div>
          {generateMutation.isError && (
            <p className="mt-2 text-xs text-destructive">
              {(generateMutation.error as Error).message}
            </p>
          )}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[220px,1fr]">
          {/* Report list sidebar */}
          <div className="space-y-1">
            {reports.length === 0 && !reportsQuery.isLoading && (
              <p className="text-xs text-muted-foreground">No reports yet.</p>
            )}
            {reports.map((r: MonthlyReport) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={`w-full rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                  (selected?.id ?? reports[0]?.id) === r.id
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-card/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="font-medium">
                  {formatPeriodLabel(r.periodStart, r.periodEnd)}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLE[r.status as MonthlyReportStatus]}`}
                  >
                    {STATUS_LABEL[r.status as MonthlyReportStatus]}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Report detail */}
          {report ? (
            <ReportDetail
              report={report}
              onStatusChange={(status) =>
                statusMutation.mutate({ reportId: report.id, status })
              }
              statusBusy={statusMutation.isPending}
              onGenerateShareLink={() => shareMutation.mutate({ reportId: report.id })}
              onRevokeShareLink={() => revokeMutation.mutate({ reportId: report.id })}
              shareBusy={shareMutation.isPending || revokeMutation.isPending}
              copied={copied}
              onCopied={() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-card/40 p-10 text-center">
              <p className="text-sm text-muted-foreground">
                Generate your first report to see it here.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ReportDetail({
  report,
  onStatusChange,
  statusBusy,
  onGenerateShareLink,
  onRevokeShareLink,
  shareBusy,
  copied,
  onCopied,
}: {
  report: MonthlyReport;
  onStatusChange: (s: MonthlyReportStatus) => void;
  statusBusy: boolean;
  onGenerateShareLink: () => void;
  onRevokeShareLink: () => void;
  shareBusy: boolean;
  copied: boolean;
  onCopied: () => void;
}) {
  const gp = report.goalProgressSummary;
  const ls = report.leadSummary;
  const es = report.executionSummary;
  const ws = report.wordpressSummary;

  const nextStatuses: MonthlyReportStatus[] = (() => {
    const s = report.status;
    if (s === "draft") return ["ready_for_review"];
    if (s === "ready_for_review") return ["approved", "draft"];
    if (s === "approved") return ["sent", "draft"];
    if (s === "sent") return ["archived"];
    return [];
  })();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-foreground">
            {formatPeriodLabel(report.periodStart, report.periodEnd)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Generated {new Date(report.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLE[report.status]}`}
          >
            {STATUS_LABEL[report.status]}
          </span>
          {nextStatuses.map((s) => (
            <button
              key={s}
              disabled={statusBusy}
              onClick={() => onStatusChange(s)}
              className="rounded border border-border bg-background/40 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-60"
            >
              Mark {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Share link */}
      {(report.status === "approved" || report.status === "ready_for_review" || report.status === "sent") && (
        <div className="rounded-lg border border-border bg-card/40 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Client share link
          </p>
          {report.shareToken ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/r/${report.shareToken}`}
                  className="flex-1 truncate rounded border border-border bg-background/60 px-3 py-1.5 font-mono text-xs text-foreground focus:outline-none"
                />
                <button
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(`${window.location.origin}/r/${report.shareToken}`)
                      .then(onCopied);
                  }}
                  className="rounded border border-border bg-background/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <button
                disabled={shareBusy}
                onClick={onRevokeShareLink}
                className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-60"
              >
                Revoke link
              </button>
            </div>
          ) : (
            <button
              disabled={shareBusy}
              onClick={onGenerateShareLink}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {shareBusy ? "Generating…" : "Generate share link"}
            </button>
          )}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            { label: "Leads this period", value: ls.total },
            { label: "Required / month", value: gp.requiredLeadsPerMonth ?? "—" },
            {
              label: "Gap",
              value: gp.gap != null ? (gp.gap > 0 ? `−${gp.gap}` : "✓ on track") : "—",
              highlight: gp.gap != null && gp.gap > 0,
            },
            { label: "Artifacts approved", value: es.artifactsApproved },
          ] as Array<{ label: string; value: string | number; highlight?: boolean }>
        ).map(({ label, value, highlight }) => (
          <div key={label} className="rounded-lg border border-border bg-card/60 p-4">
            <p className={`text-2xl font-bold ${highlight ? "text-amber-400" : "text-foreground"}`}>
              {value}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Delivery */}
      <div className="rounded-lg border border-border bg-card/40 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Delivery
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 text-sm">
          <Stat label="WP drafts created" value={ws.draftsCreated} />
          <Stat label="Items done" value={es.masterplanItemsDone} />
          <Stat label="Items in progress" value={es.masterplanItemsInProgress} />
        </div>
        {ws.drafts.length > 0 && (
          <ul className="mt-3 space-y-1">
            {ws.drafts.map((d, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="text-foreground">{d.title ?? d.targetSlug ?? "Untitled"}</span>
                {d.wpEditLink && (
                  <a
                    href={d.wpEditLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Edit in WP ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Lead breakdown */}
      {ls.total > 0 && (
        <div className="rounded-lg border border-border bg-card/40 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Lead breakdown
          </p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 text-sm">
            <Stat label="New" value={ls.new} />
            <Stat label="Qualified" value={ls.qualified} />
            <Stat label="Won" value={ls.won} />
            <Stat label="Lost" value={ls.lost} />
            <Stat label="Unqualified" value={ls.unqualified} />
            {Object.entries(ls.sources).length > 0 && (
              <div className="rounded border border-border bg-background/40 p-2">
                <p className="text-xs text-muted-foreground">Top source</p>
                <p className="text-sm font-medium text-foreground capitalize">
                  {Object.entries(ls.sources).sort((a, b) => b[1] - a[1])[0]?.[0]?.replace(/_/g, " ") ?? "—"}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Next actions */}
      {report.nextActions.length > 0 && (
        <div className="rounded-lg border border-border bg-card/40 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Next actions
          </p>
          <ul className="space-y-2">
            {report.nextActions.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span
                  className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                    a.priority === "critical" || a.priority === "high"
                      ? "bg-amber-400"
                      : "bg-muted-foreground"
                  }`}
                />
                <div>
                  <span className="font-medium text-foreground">{a.label}</span>
                  <span className="ml-1 text-muted-foreground">— {a.reason}</span>
                  {a.href && (
                    <Link
                      to={a.href as "/growth/leads"}
                      className="ml-2 text-primary hover:underline"
                    >
                      Go →
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risks */}
      {report.risks.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-amber-400">
            Risks
          </p>
          <ul className="space-y-2">
            {report.risks.map((r, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium text-amber-300">{r.label}</span>
                <span className="ml-1 text-muted-foreground">— {r.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Narrative */}
      {report.narrative && (
        <div className="rounded-lg border border-border bg-card/40 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Narrative draft
          </p>
          <pre className="whitespace-pre-wrap font-sans text-sm text-foreground leading-relaxed">
            {report.narrative}
          </pre>
          <p className="mt-3 text-xs text-muted-foreground">
            This is a template-based draft. Edit in your preferred tool before sending to the client.
          </p>
          <div className="mt-3 border-t border-border pt-3">
            <Link
              to="/growth/monthly-plan"
              className="text-xs font-medium text-primary hover:underline"
            >
              Generate next month's execution plan →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-border bg-background/40 p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}

function formatPeriodLabel(start: string, end: string): string {
  try {
    const s = new Date(`${start}T00:00:00Z`);
    const e = new Date(`${end}T00:00:00Z`);
    const startLabel = s.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    const endLabel = e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    return `${startLabel} – ${endLabel}`;
  } catch {
    return `${start} – ${end}`;
  }
}
