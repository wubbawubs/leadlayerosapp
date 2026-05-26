import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { Logo } from "@/components/brand/Logo";
import {
  TenantSwitcher,
  getActiveTenantId,
} from "@/components/app/TenantSwitcher";
import { supabase } from "@/integrations/supabase/client";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import { getActiveGrowthGoal } from "@/lib/shared/growthGoals/repo.functions";
import {
  getActiveMasterplan,
  listMasterplanItems,
} from "@/lib/shared/masterplan/repo.functions";
import { getExecutionBoard } from "@/lib/shared/execution/board.functions";


export const Route = createFileRoute("/_authenticated/app")({
  component: AppHome,
});

type NavGroup = {
  label: string;
  items: { label: string; to: string; soon?: boolean }[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Growth",
    items: [
      { label: "Goal", to: "/settings/growth-goal" },
      { label: "Masterplan", to: "/growth/masterplan" },
      { label: "Execution", to: "/growth/execution" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "Business profile", to: "/settings/business-profile" },
      { label: "Tone profile", to: "/settings/tone-profile" },
    ],
  },
  {
    label: "Website",
    items: [
      { label: "Sites", to: "/sites" },
    ],
  },
];

function AppHome() {
  const navigate = useNavigate();
  const fetchTenants = useServerFn(listMyTenants);
  const fetchGoal = useServerFn(getActiveGrowthGoal);
  const fetchPlan = useServerFn(getActiveMasterplan);
  const fetchItems = useServerFn(listMasterplanItems);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });

  const tenantId =
    (typeof window !== "undefined" ? getActiveTenantId() : null) ??
    tenantsQuery.data?.tenants[0]?.id ??
    null;

  const goalQuery = useQuery({
    queryKey: ["active-goal", tenantId],
    queryFn: () => fetchGoal({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });

  const planQuery = useQuery({
    queryKey: ["active-plan", tenantId],
    queryFn: () => fetchPlan({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });

  const planId = planQuery.data?.plan?.id ?? null;
  const itemsQuery = useQuery({
    queryKey: ["plan-items", tenantId, planId],
    queryFn: () =>
      fetchItems({ data: { tenantId: tenantId!, masterPlanId: planId! } }),
    enabled: !!tenantId && !!planId,
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const goal = goalQuery.data?.goal;
  const plan = planQuery.data?.plan;
  const items = itemsQuery.data?.items ?? [];
  const byStatus = items.reduce<Record<string, number>>((acc, it) => {
    acc[it.status] = (acc[it.status] ?? 0) + 1;
    return acc;
  }, {});

  const nextSteps: { title: string; to: string; reason: string }[] = [];
  if (!goal) {
    nextSteps.push({
      title: "Set a growth goal",
      to: "/settings/growth-goal",
      reason: "Without a goal the masterplan and proposals have no direction.",
    });
  } else if (!plan) {
    nextSteps.push({
      title: "Generate the masterplan",
      to: "/growth/masterplan",
      reason: "Translate the goal into a concrete 30/60/90 execution plan.",
    });
  } else if ((byStatus.approved ?? 0) === 0) {
    nextSteps.push({
      title: "Approve high-priority masterplan items",
      to: "/growth/masterplan",
      reason: "Approved items become the operator's execution queue.",
    });
  }
  nextSteps.push({
    title: "Review latest audit + QA proposals",
    to: "/sites",
    reason: "Objective facts feed the next planning round.",
  });

  return (
    <div className="min-h-screen bg-background bg-blueprint">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="hidden items-center gap-5 text-sm md:flex">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {group.label}
                </span>
                {group.items.map((item) => (
                  <Link
                    key={item.label}
                    to={item.to}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {item.label}
                    {item.soon && (
                      <span className="ml-1 rounded bg-secondary px-1 text-[10px] uppercase text-muted-foreground">
                        soon
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {tenantsQuery.data && tenantsQuery.data.tenants.length > 0 && (
            <TenantSwitcher tenants={tenantsQuery.data.tenants} />
          )}
          <button
            onClick={signOut}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="container mx-auto px-6 pb-24 pt-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Lead Growth OS
        </p>
        <h1 className="font-display text-5xl text-foreground">
          Goal → Masterplan → <span className="text-primary">Execution.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Your operator cockpit. Define the growth goal, generate the
          masterplan, then run audits and proposals against it. Publishing,
          tracking and reporting follow in later sprints.
        </p>

        <section className="mt-10 grid gap-5 lg:grid-cols-3">
          <Card
            title="Active growth goal"
            subtitle="Goal Intake V1"
            cta={{ label: goal ? "Edit goal" : "Set a goal", to: "/settings/growth-goal" }}
          >
            {!tenantId && <p className="text-sm text-muted-foreground">Select a tenant.</p>}
            {tenantId && goalQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {tenantId && !goalQuery.isLoading && !goal && (
              <p className="text-sm text-muted-foreground">
                No active goal yet. Without a goal we cannot prioritize work.
              </p>
            )}
            {goal && (
              <div className="space-y-2 text-sm">
                <div className="text-foreground">
                  <span className="font-medium">{goal.targetCount ?? "—"}</span>{" "}
                  {goal.targetType}
                  {goal.timeframeMonths ? ` / ${goal.timeframeMonths} mo` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  Required leads:{" "}
                  <span className="text-foreground">
                    {goal.requiredLeads ?? "—"}
                  </span>
                  {" · "}Close rate:{" "}
                  <span className="text-foreground">
                    {goal.closeRate != null
                      ? `${Math.round(goal.closeRate * 100)}%`
                      : "—"}
                  </span>
                </div>
                {goal.serviceFocus.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Focus: {goal.serviceFocus.slice(0, 3).join(", ")}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card
            title="Active masterplan"
            subtitle="Masterplan V1"
            cta={{
              label: plan ? "Open masterplan" : "Generate masterplan",
              to: "/growth/masterplan",
            }}
          >
            {!plan && (
              <p className="text-sm text-muted-foreground">
                No active masterplan. Generate one from the active goal.
              </p>
            )}
            {plan && (
              <div className="space-y-2 text-sm">
                {plan.summary && (
                  <p className="text-foreground line-clamp-3">{plan.summary}</p>
                )}
                {plan.confidence != null && (
                  <div className="text-xs text-muted-foreground">
                    Confidence: {Math.round((plan.confidence ?? 0) * 100)}%
                  </div>
                )}
                {plan.missingContext.length > 0 && (
                  <div className="text-xs text-amber-500">
                    Missing context: {plan.missingContext.slice(0, 3).join(", ")}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card title="Masterplan items" subtitle="Execution queue">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No items yet. Generate or refresh the masterplan.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {(["proposed", "approved", "in_progress", "done", "skipped"] as const).map(
                  (s) => (
                    <li key={s} className="flex justify-between text-muted-foreground">
                      <span className="capitalize">{s.replace("_", " ")}</span>
                      <span className="font-mono text-foreground">{byStatus[s] ?? 0}</span>
                    </li>
                  ),
                )}
              </ul>
            )}
          </Card>
        </section>

        <section className="mt-10 grid gap-5 lg:grid-cols-2">
          <Card title="Next steps" subtitle="What to do now">
            <ul className="space-y-3 text-sm">
              {nextSteps.map((s) => (
                <li key={s.title} className="rounded border border-border bg-background/30 p-3">
                  <Link
                    to={s.to}
                    className="font-medium text-foreground hover:text-primary"
                  >
                    {s.title} →
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">{s.reason}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Roadmap" subtitle="Lead Growth OS — V4">
            <ol className="space-y-1 text-sm text-muted-foreground">
              <li>✅ Goal Intake V1</li>
              <li>✅ Masterplan V1</li>
              <li>✅ Audit + Proposal V2 + QA core</li>
              <li className="text-foreground">→ Roadmap + Dashboard Alignment V1</li>
              <li>⬜ Masterplan → Proposal V2 link</li>
              <li>⬜ Execution Board</li>
              <li>⬜ Safe Publishing</li>
              <li>⬜ Tracking / Lead Inbox</li>
              <li>⬜ Reporting / Monthly Growth Loop</li>
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">
              See <span className="font-mono">docs/ROADMAP_V4.md</span> for the
              full Modular Architecture Contract.
            </p>
          </Card>
        </section>
      </main>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
  cta,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  cta?: { label: string; to: string };
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card/70 p-5">
      <div className="mb-3">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {subtitle}
        </p>
      </div>
      <div className="flex-1">{children}</div>
      {cta && (
        <Link
          to={cta.to}
          className="mt-4 inline-flex w-fit items-center rounded-md border border-border bg-background/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          {cta.label} →
        </Link>
      )}
    </div>
  );
}
