import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import { getActiveGrowthGoal } from "@/lib/shared/growthGoals/repo.functions";
import {
  getActiveMasterplan,
  listMasterplanItems,
  generateMasterplan,
  updateMasterplanItem,
} from "@/lib/shared/masterplan/repo.functions";
import {
  generateProposalV2ForMasterplanItem,
  listProposalCountsForMasterplan,
  listProposalsForMasterplanItem,
} from "@/lib/shared/masterplan/proposalGen.functions";
import { mapMasterplanItemToAction } from "@/lib/shared/masterplan/proposalMapping";
import {
  type MasterplanItem,
  type MasterplanItemStatus,
  roadmapBucket,
  priorityRank,
} from "@/lib/shared/masterplan/schemas";

export const Route = createFileRoute("/_authenticated/growth/masterplan")({
  component: MasterplanPage,
  head: () => ({
    meta: [{ title: "Masterplan — LeadLayer" }],
  }),
});

function MasterplanPage() {
  const qc = useQueryClient();
  const fetchTenants = useServerFn(listMyTenants);
  const fetchGoal = useServerFn(getActiveGrowthGoal);
  const fetchPlan = useServerFn(getActiveMasterplan);
  const fetchItems = useServerFn(listMasterplanItems);
  const generateFn = useServerFn(generateMasterplan);
  const updateItemFn = useServerFn(updateMasterplanItem);
  const generateProposalFn = useServerFn(generateProposalV2ForMasterplanItem);
  const fetchProposalCounts = useServerFn(listProposalCountsForMasterplan);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });
  const tenantId = tenantsQuery.data?.tenants[0]?.id ?? null;

  const goalQuery = useQuery({
    queryKey: ["active-growth-goal", tenantId],
    queryFn: () =>
      tenantId ? fetchGoal({ data: { tenantId } }) : Promise.resolve({ goal: null }),
    enabled: !!tenantId,
  });

  const planQuery = useQuery({
    queryKey: ["active-masterplan", tenantId],
    queryFn: () =>
      tenantId ? fetchPlan({ data: { tenantId } }) : Promise.resolve({ plan: null }),
    enabled: !!tenantId,
  });

  const planId = planQuery.data?.plan?.id ?? null;

  const itemsQuery = useQuery({
    queryKey: ["masterplan-items", tenantId, planId],
    queryFn: () =>
      tenantId && planId
        ? fetchItems({ data: { tenantId, masterPlanId: planId } })
        : Promise.resolve({ items: [] }),
    enabled: !!tenantId && !!planId,
  });

  const generateMut = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Geen tenant");
      return generateFn({ data: { tenantId } });
    },
    onSuccess: (res) => {
      if ("ok" in res && res.ok) {
        toast.success(`Masterplan gegenereerd · ${res.itemCount} items`);
        qc.invalidateQueries({ queryKey: ["active-masterplan", tenantId] });
        qc.invalidateQueries({ queryKey: ["masterplan-items", tenantId] });
      } else if ("reason" in res && res.reason === "needs_goal") {
        toast.error(res.message);
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateItemMut = useMutation({
    mutationFn: async (vars: { itemId: string; status: MasterplanItemStatus }) => {
      if (!tenantId) throw new Error("Geen tenant");
      return updateItemFn({
        data: { tenantId, itemId: vars.itemId, patch: { status: vars.status } },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["masterplan-items", tenantId, planId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const proposalCountsQuery = useQuery({
    queryKey: ["masterplan-proposal-counts", tenantId, planId],
    queryFn: () =>
      tenantId && planId
        ? fetchProposalCounts({ data: { tenantId, masterPlanId: planId } })
        : Promise.resolve({ counts: {} }),
    enabled: !!tenantId && !!planId,
  });
  const proposalCounts: Record<string, { total: number; latestStatus: string | null }> =
    proposalCountsQuery.data?.counts ?? {};

  const generateProposalMut = useMutation({
    mutationFn: async (vars: { itemId: string }) => {
      if (!tenantId) throw new Error("Geen tenant");
      return generateProposalFn({
        data: { tenantId, masterplanItemId: vars.itemId },
      });
    },
    onSuccess: (res) => {
      if ("ok" in res && res.ok) {
        toast.success("Proposal gegenereerd — open Proposals voor review.");
        qc.invalidateQueries({ queryKey: ["masterplan-proposal-counts", tenantId, planId] });
      } else if ("reason" in res) {
        toast.message("Niet ondersteund in V1", { description: res.message });
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const goal = goalQuery.data?.goal ?? null;
  const plan = planQuery.data?.plan ?? null;
  const items = itemsQuery.data?.items ?? [];

  const buckets = useMemo(() => {
    const out: Record<"30" | "60" | "90", MasterplanItem[]> = { "30": [], "60": [], "90": [] };
    for (const it of items) out[roadmapBucket(it)].push(it);
    for (const k of ["30", "60", "90"] as const) {
      out[k].sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority));
    }
    return out;
  }, [items]);

  return (
    <div className="min-h-screen bg-background bg-blueprint">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/app" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <Link to="/settings/growth-goal" className="text-muted-foreground hover:text-foreground">
              Growth goal
            </Link>
            <span className="font-medium text-foreground">Masterplan</span>
            <Link to="/sites" className="text-muted-foreground hover:text-foreground">
              Sites
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl px-6 pb-24 pt-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Sprint · Masterplan V1
        </p>
        <h1 className="font-display text-4xl text-foreground">Masterplan</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          De brug tussen growth goal en executie. Concrete acties met prioriteit, effort en
          verwachte impact.
        </p>

        {!tenantId && <p className="mt-6 text-muted-foreground">Tenant laden…</p>}

        {tenantId && !goal && (
          <div className="mt-8 rounded-lg border border-destructive/30 bg-destructive/10 p-5">
            <h2 className="font-semibold text-foreground">Geen actieve growth goal</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Een masterplan vertaalt het doel naar acties. Maak eerst een active growth goal aan.
            </p>
            <Link
              to="/settings/growth-goal"
              className="mt-3 inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Naar growth goal
            </Link>
          </div>
        )}

        {tenantId && goal && (
          <div className="mt-8 space-y-6">
            {/* Active goal card */}
            <section className="rounded-lg border border-border bg-card/70 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-foreground">Active growth goal</h2>
                  <p className="mt-1 text-sm text-foreground">
                    {goal.targetCount != null
                      ? `${goal.targetCount} ${goal.targetType} per maand`
                      : "Target niet ingevuld"}
                    {goal.timeframeMonths ? ` binnen ${goal.timeframeMonths} maanden` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Required leads: {goal.requiredLeads ?? "—"} · Close rate:{" "}
                    {goal.closeRate != null ? `${Math.round(goal.closeRate * 100)}%` : "—"}
                  </p>
                  {goal.serviceFocus.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Focus: {goal.serviceFocus.slice(0, 4).join(", ")}
                    </p>
                  )}
                  {goal.locations.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Regio: {goal.locations.slice(0, 4).join(", ")}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => generateMut.mutate()}
                  disabled={generateMut.isPending}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {generateMut.isPending
                    ? "Genereren…"
                    : plan
                      ? "Regenerate masterplan"
                      : "Generate masterplan"}
                </button>
              </div>
            </section>

            {/* Masterplan summary */}
            {plan && (
              <section className="rounded-lg border border-primary/30 bg-primary/5 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-2xl text-foreground">Plan summary</h2>
                  {plan.confidence != null && (
                    <span className="text-xs text-muted-foreground">
                      confidence {Math.round(plan.confidence * 100)}%
                    </span>
                  )}
                </div>
                {plan.summary && <p className="mt-2 text-sm text-foreground">{plan.summary}</p>}
                {plan.strategySummary && (
                  <p className="mt-2 text-sm text-muted-foreground">{plan.strategySummary}</p>
                )}
                {plan.mainConstraints.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Main constraints
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-foreground">
                      {plan.mainConstraints.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {plan.missingContext.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Missing context
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                      {plan.missingContext.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* 30/60/90 roadmap */}
            {plan && (
              <section>
                <h2 className="font-display text-2xl text-foreground">30 / 60 / 90 roadmap</h2>
                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                  {(["30", "60", "90"] as const).map((bucket) => (
                    <div
                      key={bucket}
                      className="rounded-lg border border-border bg-card/60 p-4"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                        Eerste {bucket} dagen
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {buckets[bucket].length} items
                      </p>
                      <ul className="mt-3 space-y-2 text-sm">
                        {buckets[bucket].map((it) => (
                          <li
                            key={it.id}
                            className="flex items-start justify-between gap-2 rounded border border-border/60 bg-background/40 px-2 py-1.5"
                          >
                            <span className="text-foreground">{it.title}</span>
                            <PriorityBadge priority={it.priority} />
                          </li>
                        ))}
                        {buckets[bucket].length === 0 && (
                          <li className="text-xs text-muted-foreground">—</li>
                        )}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Item board */}
            {plan && (
              <section>
                <h2 className="font-display text-2xl text-foreground">Masterplan items</h2>
                <p className="text-xs text-muted-foreground">
                  {items.length} items · {plan.status}
                </p>
                <div className="mt-3 space-y-3">
                  {items.map((it) => {
                    const mapping = mapMasterplanItemToAction({ type: it.type });
                    const counts = proposalCounts[it.id] ?? { total: 0, latestStatus: null };
                    return (
                      <article
                        key={it.id}
                        className="rounded-lg border border-border bg-card/70 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                                {it.type}
                              </span>
                              <PriorityBadge priority={it.priority} />
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                effort {it.effort} · impact {it.expectedImpact} · {it.source}
                              </span>
                              {counts.total > 0 && (
                                <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                  {counts.total} proposal{counts.total === 1 ? "" : "s"}
                                  {counts.latestStatus ? ` · ${counts.latestStatus}` : ""}
                                </span>
                              )}
                            </div>
                            <h3 className="mt-1 font-semibold text-foreground">{it.title}</h3>
                            {it.description && (
                              <p className="mt-1 text-sm text-muted-foreground">{it.description}</p>
                            )}
                            {it.reason && (
                              <p className="mt-2 text-xs italic text-muted-foreground">
                                Waarom: {it.reason}
                              </p>
                            )}
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {mapping.supported ? (
                                <button
                                  onClick={() =>
                                    generateProposalMut.mutate({ itemId: it.id })
                                  }
                                  disabled={generateProposalMut.isPending}
                                  className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                                >
                                  {generateProposalMut.isPending &&
                                  generateProposalMut.variables?.itemId === it.id
                                    ? "Genereren…"
                                    : counts.total > 0
                                      ? "Regenerate proposal"
                                      : "Generate proposal"}
                                </button>
                              ) : (
                                <span className="rounded border border-dashed border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                  Manual task for now
                                </span>
                              )}
                              {counts.total > 0 && (
                                <Link
                                  to="/growth/masterplan/$itemId/proposals"
                                  params={{ itemId: it.id }}
                                  className="text-[11px] text-primary underline-offset-4 hover:underline"
                                >
                                  View linked proposals →
                                </Link>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <StatusPill status={it.status} />
                            <div className="flex flex-wrap gap-1">
                              {(
                                [
                                  ["approved", "Approve"],
                                  ["in_progress", "Start"],
                                  ["done", "Done"],
                                  ["skipped", "Skip"],
                                ] as const
                              ).map(([s, label]) => (
                                <button
                                  key={s}
                                  disabled={
                                    it.status === s || updateItemMut.isPending
                                  }
                                  onClick={() =>
                                    updateItemMut.mutate({ itemId: it.id, status: s })
                                  }
                                  className="rounded border border-border bg-background/40 px-2 py-1 text-[11px] text-foreground hover:bg-secondary disabled:opacity-40"
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {items.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nog geen items.</p>
                  )}
                </div>
              </section>
            )}

            {!plan && !generateMut.isPending && (
              <p className="text-sm text-muted-foreground">
                Nog geen masterplan. Klik "Generate masterplan" om er een te genereren op basis van
                de active growth goal, business profile, page intelligence en audit.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: MasterplanItem["priority"] }) {
  const cls =
    priority === "critical"
      ? "bg-destructive/20 text-destructive"
      : priority === "high"
        ? "bg-primary/20 text-primary"
        : priority === "medium"
          ? "bg-secondary text-foreground"
          : "bg-muted text-muted-foreground";
  return (
    <span
      className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {priority}
    </span>
  );
}

function StatusPill({ status }: { status: MasterplanItemStatus }) {
  const map: Record<MasterplanItemStatus, string> = {
    proposed: "bg-muted text-muted-foreground",
    approved: "bg-primary/20 text-primary",
    in_progress: "bg-secondary text-foreground",
    done: "bg-emerald-500/20 text-emerald-400",
    skipped: "bg-muted text-muted-foreground line-through",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${map[status]}`}>
      {status}
    </span>
  );
}
