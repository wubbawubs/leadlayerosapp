import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { Logo } from "@/components/brand/Logo";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import { getProductFlowState } from "@/lib/productFlow/productFlow.functions";
import type {
  AutomationStatus,
  ProductFlowState,
  ReviewGateStatus,
} from "@/lib/shared/productFlow/schemas";
import { IntelligencePipelinePanel } from "@/components/intelligencePipeline/IntelligencePipelinePanel";

export const Route = createFileRoute("/_authenticated/growth/flow")({
  component: ProductFlowPage,
  head: () => ({
    meta: [
      { title: "Product Flow — LeadLayer" },
      {
        name: "description",
        content:
          "Guided operating flow: where the client is in the journey, what's automated, what needs review, what's blocked.",
      },
    ],
  }),
});

function ProductFlowPage() {
  const fetchTenants = useServerFn(listMyTenants);
  const fetchFlow = useServerFn(getProductFlowState);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });
  const tenantId = tenantsQuery.data?.tenants[0]?.id ?? null;

  const flowQuery = useQuery({
    queryKey: ["product-flow-state", tenantId],
    queryFn: async () =>
      tenantId ? await fetchFlow({ data: { tenantId } }) : { flowJson: null },
    enabled: !!tenantId,
  });

  const flow: ProductFlowState | null = useMemo(() => {
    const raw = flowQuery.data?.flowJson;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ProductFlowState;
    } catch {
      return null;
    }
  }, [flowQuery.data]);

  return (
    <div className="min-h-screen bg-background bg-blueprint">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/app" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <span className="font-medium text-foreground">Flow</span>
            <Link to="/growth/intelligence" className="text-muted-foreground hover:text-foreground">
              Intelligence
            </Link>
            <Link to="/growth/blueprint" className="text-muted-foreground hover:text-foreground">
              Blueprint
            </Link>
            <Link to="/growth/masterplan" className="text-muted-foreground hover:text-foreground">
              Masterplan
            </Link>
            <Link to="/growth/execution" className="text-muted-foreground hover:text-foreground">
              Execution
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl px-6 pb-24 pt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Product Flow Orchestration V1
        </p>
        <h1 className="mt-2 font-display text-4xl text-foreground">
          The guided journey, not a pile of pages.
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
          Derived from the Growth Intelligence Snapshot. Shows where this client
          is in the journey, what is running automatically, what needs operator
          review, and what is blocked.
        </p>

        {tenantId && <IntelligencePipelinePanel tenantId={tenantId} />}

        {flowQuery.isLoading && (
          <p className="mt-8 text-sm text-muted-foreground">Resolving flow…</p>
        )}

        {flow && (
          <>
            <LifecycleHero flow={flow} />
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <StatusCard
                label="Client-visible status"
                tone="primary"
                body={flow.clientVisibleStatus}
                footer="What the client sees in their portal."
              />
              <StatusCard
                label="Operator status"
                tone="muted"
                body={flow.operatorStatus}
                footer="Internal — surfaces partial / failed / missing detail."
              />
            </div>

            <NextActionsSection flow={flow} />
            <AutomationSection flow={flow} />
            <ReviewGatesSection flow={flow} />
            <BlockersSection flow={flow} />
          </>
        )}
      </main>
    </div>
  );
}

function LifecycleHero({ flow }: { flow: ProductFlowState }) {
  return (
    <section className="mt-8 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card/80 to-card/40 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            Lifecycle stage
          </p>
          <p className="font-display text-4xl text-foreground">{flow.lifecycleLabel}</p>
          <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
            {flow.lifecycleStage}
          </p>
        </div>
        <div className="min-w-[260px] flex-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Journey progress</span>
            <span className="font-mono text-foreground">{flow.progressPercent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-background/40">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${flow.progressPercent}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {[
              "onboarding",
              "collecting",
              "review",
              "blueprint",
              "masterplan",
              "execution",
            ].map((s) => (
              <span key={s} className="rounded bg-background/40 px-2 py-0.5">
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusCard({
  label,
  body,
  footer,
  tone,
}: {
  label: string;
  body: string;
  footer: string;
  tone: "primary" | "muted";
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        tone === "primary"
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-card/60"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
        {label}
      </p>
      <p className="mt-2 text-foreground">{body}</p>
      <p className="mt-3 text-xs text-muted-foreground">{footer}</p>
    </div>
  );
}

function NextActionsSection({ flow }: { flow: ProductFlowState }) {
  const { primaryNextAction, secondaryActions } = flow;
  return (
    <section className="mt-8 rounded-2xl border border-border bg-card/60 p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
        Next actions
      </p>
      <div className="mt-3 rounded-lg border border-primary/30 bg-primary/10 p-4">
        <p className="text-xs uppercase tracking-wider text-primary">Primary</p>
        <p className="mt-1 font-medium text-foreground">{primaryNextAction.label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{primaryNextAction.reason}</p>
        {primaryNextAction.href && (
          <Link
            to={primaryNextAction.href}
            className="mt-3 inline-block rounded border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary/20"
          >
            Take action →
          </Link>
        )}
      </div>
      {secondaryActions.length > 0 && (
        <ul className="mt-4 space-y-2">
          {secondaryActions.slice(0, 4).map((a) => (
            <li
              key={a.type}
              className="flex items-center justify-between rounded border border-border bg-background/40 p-3 text-sm"
            >
              <div>
                <p className="font-medium text-foreground">{a.label}</p>
                <p className="text-xs text-muted-foreground">{a.reason}</p>
              </div>
              {a.href && (
                <Link
                  to={a.href}
                  className="text-xs text-primary hover:underline"
                >
                  Open →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AutomationSection({ flow }: { flow: ProductFlowState }) {
  return (
    <section className="mt-8">
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        Automation checklist
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        What the software pipeline has done for this client.
      </p>
      <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card/40">
        {flow.automationChecklist.map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-4 p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground">
                {item.sourceModule}
                {item.reason ? ` · ${item.reason}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <AutomationBadge status={item.status} />
              {item.href && (
                <Link
                  to={item.href}
                  className="text-xs text-primary hover:underline"
                >
                  Open →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReviewGatesSection({ flow }: { flow: ProductFlowState }) {
  return (
    <section className="mt-8">
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        Review gates
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Human review checkpoints between automation and client delivery.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {flow.reviewGates.map((gate) => (
          <div
            key={gate.gate}
            className="rounded-lg border border-border bg-card/40 p-4"
          >
            <div className="flex items-center justify-between">
              <p className="font-medium text-foreground">{gate.label}</p>
              <GateBadge status={gate.status} />
            </div>
            {gate.reason && (
              <p className="mt-2 text-xs text-muted-foreground">{gate.reason}</p>
            )}
            {gate.missing && gate.missing.length > 0 && (
              <p className="mt-2 text-xs text-amber-500">
                Missing: {gate.missing.slice(0, 3).join(", ")}
              </p>
            )}
            {gate.href && (
              <Link
                to={gate.href}
                className="mt-3 inline-block text-xs text-primary hover:underline"
              >
                Open gate →
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function BlockersSection({ flow }: { flow: ProductFlowState }) {
  if (flow.blockers.length === 0) {
    return (
      <section className="mt-8 rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
        No active blockers.
      </section>
    );
  }
  return (
    <section className="mt-8">
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-destructive">
        Blockers
      </h2>
      <ul className="mt-3 space-y-2">
        {flow.blockers.map((b) => (
          <li
            key={b.key}
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
          >
            <div className="flex items-center justify-between">
              <p className="font-medium text-foreground">{b.label}</p>
              <span className="text-[10px] uppercase tracking-wider text-destructive">
                {b.severity}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{b.reason}</p>
            {b.href && (
              <Link
                to={b.href}
                className="mt-2 inline-block text-xs text-primary hover:underline"
              >
                Resolve →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AutomationBadge({ status }: { status: AutomationStatus }) {
  const map: Record<AutomationStatus, { label: string; cls: string }> = {
    not_started: { label: "Not started", cls: "border-border bg-background/40 text-muted-foreground" },
    running: { label: "Running", cls: "border-primary/40 bg-primary/10 text-primary" },
    complete: { label: "Complete", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
    partial: { label: "Partial", cls: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
    failed: { label: "Failed", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
    blocked: { label: "Blocked", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  };
  const cfg = map[status];
  return (
    <span
      className={`rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

function GateBadge({ status }: { status: ReviewGateStatus }) {
  const map: Record<ReviewGateStatus, { label: string; cls: string }> = {
    not_ready: { label: "Not ready", cls: "border-border bg-background/40 text-muted-foreground" },
    ready_for_review: {
      label: "Review",
      cls: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    },
    approved: { label: "Approved", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
    blocked: { label: "Blocked", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  };
  const cfg = map[status];
  return (
    <span
      className={`rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}
