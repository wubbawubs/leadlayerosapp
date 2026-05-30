import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import {
  generateMonthlyExecutionPlan,
  listMonthlyExecutionPlans,
  updateMonthlyExecutionPlanStatus,
} from "@/lib/shared/monthlyExecutionPlans/monthlyExecutionPlans.functions";
import type {
  MonthlyExecutionPlan,
  PackageTier,
  PlanStatus,
  PlanAction,
  ActionCategory,
} from "@/lib/shared/monthlyExecutionPlans/schemas";

export const Route = createFileRoute("/_authenticated/growth/monthly-plan")({
  component: MonthlyPlanPage,
  head: () => ({
    meta: [{ title: "Monthly Execution Plan — LeadLayer" }],
  }),
});

const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  draft: "Draft",
  ready_for_review: "Ready for review",
  approved: "Approved",
  in_execution: "In execution",
  completed: "Completed",
  archived: "Archived",
};

const PLAN_STATUS_STYLE: Record<PlanStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  ready_for_review: "bg-amber-500/15 text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-400",
  in_execution: "bg-primary/15 text-primary",
  completed: "bg-emerald-500/15 text-emerald-400",
  archived: "bg-muted text-muted-foreground",
};

const CATEGORY_LABEL: Record<ActionCategory, string> = {
  visibility_asset: "Visibility asset",
  conversion_improvement: "Conversion",
  trust_or_proof: "Trust / proof",
  local_visibility: "Local visibility",
  measurement: "Measurement",
  reporting_or_review: "Reporting",
};

const CATEGORY_STYLE: Record<ActionCategory, string> = {
  visibility_asset: "bg-primary/15 text-primary",
  conversion_improvement: "bg-blue-500/15 text-blue-400",
  trust_or_proof: "bg-emerald-500/15 text-emerald-400",
  local_visibility: "bg-purple-500/15 text-purple-400",
  measurement: "bg-amber-500/15 text-amber-400",
  reporting_or_review: "bg-muted text-muted-foreground",
};

const DELIVERY_LABEL: Record<string, string> = {
  software: "LeadLayer",
  operator: "Operator",
  hybrid: "Hybrid",
  manual: "Manual",
};

const IMPACT_STYLE: Record<string, string> = {
  high: "text-emerald-400",
  medium: "text-amber-400",
  low: "text-muted-foreground",
};

function currentNextMonthPeriod(): { start: string; end: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // next month
  const nextM = m > 11 ? 0 : m;
  const nextY = m > 11 ? y + 1 : y;
  const last = new Date(Date.UTC(nextY, nextM + 1, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${nextY}-${pad(nextM + 1)}-01`,
    end: `${nextY}-${pad(nextM + 1)}-${pad(last)}`,
  };
}

function MonthlyPlanPage() {
  const qc = useQueryClient();
  const fetchTenants = useServerFn(listMyTenants);
  const doGenerate = useServerFn(generateMonthlyExecutionPlan);
  const doList = useServerFn(listMonthlyExecutionPlans);
  const doUpdateStatus = useServerFn(updateMonthlyExecutionPlanStatus);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });
  const tenantId = tenantsQuery.data?.tenants[0]?.id ?? null;

  const plansQuery = useQuery({
    queryKey: ["monthly-execution-plans", tenantId],
    queryFn: () => doList({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });

  const nextPeriod = currentNextMonthPeriod();
  const [periodStart, setPeriodStart] = useState(nextPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(nextPeriod.end);
  const [tier, setTier] = useState<PackageTier>("growth");
  const [selected, setSelected] = useState<MonthlyExecutionPlan | null>(null);

  const generateMutation = useMutation({
    mutationFn: () => {
      if (!tenantId) throw new Error("No active tenant");
      return doGenerate({ data: { tenantId, periodStart, periodEnd, packageTier: tier } });
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Execution plan generated");
        setSelected(res.plan);
      }
      void qc.invalidateQueries({ queryKey: ["monthly-execution-plans", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to generate plan"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ planId, status }: { planId: string; status: PlanStatus }) => {
      if (!tenantId) throw new Error("No active tenant");
      return doUpdateStatus({ data: { tenantId, planId, status } });
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`Plan marked "${PLAN_STATUS_LABEL[res.plan.status]}"`);
        setSelected(res.plan);
      }
      void qc.invalidateQueries({ queryKey: ["monthly-execution-plans", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update status"),
  });

  const plans = plansQuery.data?.plans ?? [];
  const plan = selected ?? plans[0] ?? null;

  return (
    <div className="min-h-screen bg-background bg-blueprint">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/app" className="text-muted-foreground hover:text-foreground">Dashboard</Link>
          <Link to="/growth/reports" className="text-muted-foreground hover:text-foreground">Reports</Link>
          <Link to="/growth/masterplan" className="text-muted-foreground hover:text-foreground">Masterplan</Link>
          <span className="font-medium text-foreground">Monthly plan</span>
        </nav>
      </header>

      <main className="container mx-auto max-w-5xl px-6 pb-24 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Monthly Execution Planner · V1
        </p>
        <h1 className="font-display text-4xl text-foreground">Monthly Execution Plan</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Forward-looking plan: what LeadLayer executes next month to close the lead gap.
          Based on goal, lead data, Snapshot, Masterplan items, and package tier.
        </p>

        {/* Generate controls */}
        <div className="mt-6 rounded-lg border border-border bg-card/70 p-5">
          <p className="mb-3 text-sm font-medium text-foreground">Generate plan for next period</p>
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
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Package tier</span>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value as PackageTier)}
                className="rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="starter">Starter (2–3 actions)</option>
                <option value="growth">Growth (4–5 actions)</option>
                <option value="pro">Pro (6–8 actions)</option>
              </select>
            </label>
            <button
              disabled={!tenantId || generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {generateMutation.isPending ? "Generating…" : "Generate plan"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[200px,1fr]">
          {/* Plan list sidebar */}
          <div className="space-y-1">
            {plans.length === 0 && !plansQuery.isLoading && (
              <p className="text-xs text-muted-foreground">No plans yet.</p>
            )}
            {plans.map((p: MonthlyExecutionPlan) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className={`w-full rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                  (selected?.id ?? plans[0]?.id) === p.id
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-card/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="font-medium">{formatPeriodLabel(p.periodStart, p.periodEnd)}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PLAN_STATUS_STYLE[p.status as PlanStatus]}`}>
                    {PLAN_STATUS_LABEL[p.status as PlanStatus]}
                  </span>
                  <span className="text-[10px] text-muted-foreground capitalize">{p.packageTier}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Plan detail */}
          {plan ? (
            <PlanDetail
              plan={plan}
              onStatusChange={(status) => statusMutation.mutate({ planId: plan.id, status })}
              statusBusy={statusMutation.isPending}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-card/40 p-10 text-center">
              <p className="text-sm text-muted-foreground">
                Generate your first execution plan to see it here.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function PlanDetail({
  plan,
  onStatusChange,
  statusBusy,
}: {
  plan: MonthlyExecutionPlan;
  onStatusChange: (s: PlanStatus) => void;
  statusBusy: boolean;
}) {
  const gp = plan.leadGapSummary;
  const ei = plan.expectedImpact;

  const nextStatuses: PlanStatus[] = (() => {
    const s = plan.status;
    if (s === "draft") return ["ready_for_review"];
    if (s === "ready_for_review") return ["approved", "draft"];
    if (s === "approved") return ["in_execution", "draft"];
    if (s === "in_execution") return ["completed"];
    if (s === "completed") return ["archived"];
    return [];
  })();

  // Group actions by category
  const byCategory = plan.selectedActions.reduce<Record<string, PlanAction[]>>((acc, a) => {
    (acc[a.category] ??= []).push(a);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-medium text-foreground">{formatPeriodLabel(plan.periodStart, plan.periodEnd)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground capitalize">
            {plan.packageTier} tier · {plan.selectedActions.length} actions · Generated {new Date(plan.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PLAN_STATUS_STYLE[plan.status as PlanStatus]}`}>
            {PLAN_STATUS_LABEL[plan.status as PlanStatus]}
          </span>
          {nextStatuses.map((s) => (
            <button
              key={s}
              disabled={statusBusy}
              onClick={() => onStatusChange(s)}
              className="rounded border border-border bg-background/40 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-60"
            >
              Mark {PLAN_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Lead gap"
          value={gp.gap != null ? (gp.gap > 0 ? `−${gp.gap}` : "✓ on track") : "—"}
          highlight={gp.gap != null && gp.gap > 0}
        />
        <StatTile label="Actions" value={plan.selectedActions.length} />
        <StatTile label="Pages to deliver" value={ei.pagesDelivered} />
        <StatTile
          label="Projected uplift"
          value={ei.projectedLeadUplift}
          colorClass={IMPACT_STYLE[ei.projectedLeadUplift]}
        />
      </div>

      {/* Rationale */}
      {plan.rationale && (
        <div className="rounded-lg border border-border bg-card/40 px-4 py-3 text-sm text-muted-foreground">
          {plan.rationale}
        </div>
      )}

      {/* Actions by category */}
      {(Object.keys(byCategory) as ActionCategory[]).map((cat) => (
        <div key={cat} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {CATEGORY_LABEL[cat] ?? cat}
          </h2>
          {byCategory[cat].map((action) => (
            <ActionCard key={action.id} action={action} />
          ))}
        </div>
      ))}

      {/* Required inputs */}
      {plan.requiredInputs.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-400">Required inputs</p>
          <ul className="list-disc pl-4 space-y-1">
            {plan.requiredInputs.map((inp, i) => (
              <li key={i} className="text-sm text-muted-foreground">{inp}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Risks */}
      {plan.risks.length > 0 && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-rose-400">Risks</p>
          <ul className="list-disc pl-4 space-y-1">
            {plan.risks.map((r, i) => (
              <li key={i} className="text-sm text-muted-foreground">{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Expected impact note */}
      <div className="rounded-lg border border-border bg-card/40 px-4 py-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Expected impact: </span>{ei.note}
      </div>
    </div>
  );
}

function ActionCard({ action }: { action: PlanAction }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div
        className="flex cursor-pointer items-start justify-between gap-3"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${CATEGORY_STYLE[action.category]}`}>
            {CATEGORY_LABEL[action.category]}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{action.priority}</span>
          <span className="text-[10px] text-muted-foreground">
            {DELIVERY_LABEL[action.deliveryType] ?? action.deliveryType}
          </span>
          <span className={`text-[10px] font-medium ${IMPACT_STYLE[action.expectedLeadImpact]}`}>
            {action.expectedLeadImpact} impact
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
      </div>
      <p className="mt-1.5 text-sm font-medium text-foreground">{action.title}</p>
      {open && (
        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
          <p><span className="font-medium text-foreground">Rationale:</span> {action.rationale}</p>
          <p><span className="font-medium text-foreground">Success metric:</span> {action.successMetric}</p>
          {action.requiredInputs.length > 0 && (
            <p><span className="font-medium text-foreground">Requires:</span> {action.requiredInputs.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, highlight, colorClass }: { label: string; value: string | number; highlight?: boolean; colorClass?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-4">
      <p className={`text-2xl font-bold capitalize ${highlight ? "text-amber-400" : colorClass ?? "text-foreground"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function formatPeriodLabel(start: string, end: string): string {
  try {
    const s = new Date(`${start}T00:00:00Z`);
    const e = new Date(`${end}T00:00:00Z`);
    return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – ${e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
  } catch {
    return `${start} – ${end}`;
  }
}
