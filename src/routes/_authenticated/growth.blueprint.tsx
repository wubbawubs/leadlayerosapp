import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Logo } from "@/components/brand/Logo";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import { getActiveGrowthGoal } from "@/lib/shared/growthGoals/repo.functions";
import {
  getActiveMasterplan,
  listMasterplanItems,
} from "@/lib/shared/masterplan/repo.functions";
import {
  runDataForSeoMarketScan,
  summarizeLatestMarketScan,
} from "@/lib/marketIntelligence/marketIntelligence.functions";
import {
  runCompetitorScanFn,
  summarizeLatestCompetitorScan,
} from "@/lib/competitiveIntelligence/competitiveIntelligence.functions";
import { fetchBlueprintPageDiagnostics } from "@/lib/shared/blueprint/pageDiagnostics.functions";
import { itemPhase } from "@/lib/shared/masterplan/schemas";

import {
  generateLeadEngineBlueprint,
  type GenerateBlueprintInput,
  type GeneratorMasterplanItem,
} from "@/lib/shared/blueprint/generator";
import type {
  BlueprintSection,
  DataAvailabilityState,
  LeadEngineBlueprint,
} from "@/lib/shared/blueprint/schemas";

export const Route = createFileRoute("/_authenticated/growth/blueprint")({
  component: BlueprintPage,
  head: () => ({
    meta: [{ title: "Lead Engine Blueprint — LeadLayer" }],
  }),
});

// Map masterplan item → generator input shape.
function adaptItem(it: {
  id: string;
  title: string;
  description: string | null;
  reason: string | null;
  type: string;
  priority: string;
  metadata: Record<string, unknown>;
}): GeneratorMasterplanItem {
  const phase = itemPhase(it as never);
  const md = (it.metadata ?? {}) as Record<string, unknown>;
  return {
    id: it.id,
    title: it.title,
    description: it.description,
    phase: phase === "backlog" ? "months_4_6" : phase,
    type: it.type,
    service: typeof md.service === "string" ? md.service : null,
    location: typeof md.location === "string" ? md.location : null,
    rationale: it.reason ?? null,
  };
}

function BlueprintPage() {
  const fetchTenants = useServerFn(listMyTenants);
  const fetchGoal = useServerFn(getActiveGrowthGoal);
  const fetchPlan = useServerFn(getActiveMasterplan);
  const fetchItems = useServerFn(listMasterplanItems);
  const fetchMarketSummary = useServerFn(summarizeLatestMarketScan);

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

  const goalId = goalQuery.data?.goal?.id ?? null;
  const marketQuery = useQuery({
    queryKey: ["market-summary", tenantId, goalId],
    queryFn: async () => {
      if (!tenantId) return { summary: null as Awaited<ReturnType<typeof fetchMarketSummary>>["summary"] | null };
      return await fetchMarketSummary({ data: { tenantId, growthGoalId: goalId } });
    },
    enabled: !!tenantId,
  });

  const fetchCompetitorSummary = useServerFn(summarizeLatestCompetitorScan);
  const competitorQuery = useQuery({
    queryKey: ["competitor-summary", tenantId, goalId],
    queryFn: async () => {
      if (!tenantId)
        return {
          summary: null as Awaited<ReturnType<typeof fetchCompetitorSummary>>["summary"] | null,
          config: { dataForSeo: false, firecrawl: false },
        };
      return await fetchCompetitorSummary({
        data: { tenantId, growthGoalId: goalId },
      });
    },
    enabled: !!tenantId,
  });

  const fetchPageDiagnostics = useServerFn(fetchBlueprintPageDiagnostics);
  const pageDiagnosticsQuery = useQuery({
    queryKey: ["blueprint-page-diagnostics", tenantId],
    queryFn: async () => {
      if (!tenantId) return { pages: [], auditId: null as string | null };
      return await fetchPageDiagnostics({ data: { tenantId } });
    },
    enabled: !!tenantId,
  });

  const goal = goalQuery.data?.goal ?? null;
  const plan = planQuery.data?.plan ?? null;
  const items = itemsQuery.data?.items ?? [];
  const marketSummary = marketQuery.data?.summary ?? null;
  const competitorSummary = competitorQuery.data?.summary ?? null;
  const competitorConfig = competitorQuery.data?.config ?? { dataForSeo: false, firecrawl: false };
  const pageDiagnostics = pageDiagnosticsQuery.data?.pages ?? [];

  const blueprint: LeadEngineBlueprint | null = useMemo(() => {
    if (!goal || !plan) return null;
    const input: GenerateBlueprintInput = {
      tenantId: tenantId ?? undefined,
      growthGoal: {
        id: goal.id,
        targetType: goal.targetType,
        targetCount: goal.targetCount ?? null,
        currentCount: goal.currentCount ?? null,
        closeRate: goal.closeRate ?? null,
        leadValue: goal.leadValue ?? null,
        timeframeMonths: goal.timeframeMonths ?? null,
        serviceFocus: goal.serviceFocus ?? [],
        locations: goal.locations ?? [],
        hasTracking: !!goal.trackingNotes,
        trackingNotes: goal.trackingNotes ?? null,
      },
      masterPlan: {
        id: plan.id,
        confidence: plan.confidence ?? null,
      },
      masterplanItems: items.map((it) =>
        adaptItem({
          id: it.id,
          title: it.title,
          description: it.description,
          reason: it.reason,
          type: it.type,
          priority: it.priority,
          metadata: (it.metadata ?? {}) as Record<string, unknown>,
        }),
      ),
      pageIntelligence: pageDiagnostics.map((p) => ({
        id: p.id,
        url: p.url,
        title: p.title,
        role: p.role,
        hasCta: p.hasCta,
        hasTrustSignals: p.hasTrustSignals,
        isThin: p.isThin,
        issues: p.issues,
        recommendation: p.nextAction,
        pageType: p.pageType,
        intent: p.intent,
        commercialPriority: p.commercialPriority,
        conversionReadiness: p.conversionReadiness,
        gaps: p.gaps,
        nextAction: p.nextAction,
        isLocalRelevant: p.isLocalRelevant,
      })),
      marketDemandSummary:
        marketSummary && marketSummary.available ? marketSummary : undefined,
      competitorSummary:
        competitorSummary && competitorSummary.available ? competitorSummary : undefined,
      now: new Date(),
    };
    return generateLeadEngineBlueprint(input);
  }, [goal, plan, items, tenantId, marketSummary, competitorSummary, pageDiagnostics]);

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
              Goal
            </Link>
            <Link to="/growth/masterplan" className="text-muted-foreground hover:text-foreground">
              Masterplan
            </Link>
            <span className="font-medium text-foreground">Blueprint</span>
            <Link to="/growth/execution" className="text-muted-foreground hover:text-foreground">
              Execution
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl px-6 pb-24 pt-6">
        {!tenantId && <p className="text-muted-foreground">Loading tenant…</p>}

        {tenantId && (!goal || !plan) && (
          <EmptyState hasGoal={!!goal} hasPlan={!!plan} />
        )}

        {blueprint && <BlueprintView blueprint={blueprint} />}
      </main>
    </div>
  );
}

function EmptyState({ hasGoal, hasPlan }: { hasGoal: boolean; hasPlan: boolean }) {
  return (
    <div className="mt-12 rounded-lg border border-border bg-card/70 p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        Lead Engine Blueprint
      </p>
      <h1 className="mt-2 font-display text-3xl text-foreground">
        Create a growth goal and masterplan before generating the blueprint.
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        The Blueprint compiles your goal, masterplan, page intelligence and market
        signals into one strategic document. Without the upstream inputs, there's
        nothing to compile.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/settings/growth-goal"
          className={`rounded-md px-4 py-2 text-sm font-semibold ${
            hasGoal
              ? "border border-border bg-card text-foreground hover:bg-secondary"
              : "bg-primary text-primary-foreground hover:opacity-90"
          }`}
        >
          {hasGoal ? "Edit growth goal" : "Set growth goal"}
        </Link>
        <Link
          to="/growth/masterplan"
          className={`rounded-md px-4 py-2 text-sm font-semibold ${
            hasPlan
              ? "border border-border bg-card text-foreground hover:bg-secondary"
              : "bg-primary text-primary-foreground hover:opacity-90"
          }`}
        >
          {hasPlan ? "Open masterplan" : "Generate masterplan"}
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blueprint rendering
// ---------------------------------------------------------------------------

function BlueprintView({ blueprint }: { blueprint: LeadEngineBlueprint }) {
  const sectionByType = Object.fromEntries(
    blueprint.sections.map((s) => [s.type, s]),
  ) as Record<BlueprintSection["type"], BlueprintSection | undefined>;

  return (
    <article className="space-y-10">
      <Hero blueprint={blueprint} />
      <Scoreboard scores={blueprint.scores} />

      <Section section={sectionByType.goal} accent="primary" />
      <Section section={sectionByType.current_situation} />
      <Section section={sectionByType.growth_gap} accent="warning" />

      <MarketIntelligenceBlock
        section={sectionByType.market_intelligence}
        tenantId={blueprint.tenantId ?? null}
        growthGoalId={blueprint.growthGoalId ?? null}
      />


      <CompetitiveBlock
        section={sectionByType.competitive_position}
        tenantId={blueprint.tenantId ?? null}
        growthGoalId={blueprint.growthGoalId ?? null}
      />

      <PageDiagnostics section={sectionByType.page_diagnostics} />
      <Section section={sectionByType.strategy} accent="primary" />

      <Roadmap section={sectionByType.roadmap} />
      <LeadEngineMapBlock blueprint={blueprint} />
      <TrackingPlan section={sectionByType.tracking_plan} />
      <FinancialModelBlock blueprint={blueprint} />

      <ClientInputs section={sectionByType.client_inputs} />
      <Section section={sectionByType.risks_assumptions} />
      <NextActions section={sectionByType.next_actions} blueprint={blueprint} />

      <DataAvailabilityBlock blueprint={blueprint} />
    </article>
  );
}

// ---------- Hero ----------

function Hero({ blueprint }: { blueprint: LeadEngineBlueprint }) {
  const date = new Date(blueprint.generatedAt);
  const dateLabel = isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "—";
  return (
    <header className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card/80 to-card/40 p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
        Lead Engine Blueprint
      </p>
      <h1 className="mt-3 font-display text-4xl leading-tight text-foreground md:text-5xl">
        {blueprint.title}
      </h1>
      <p className="mt-4 max-w-3xl text-base text-muted-foreground">{blueprint.summary}</p>
      <div className="mt-6 flex flex-wrap items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
        <Badge variant="primary">{blueprint.status}</Badge>
        <span>Generated {dateLabel}</span>
        <span>·</span>
        <span>Confidence {(blueprint.confidence * 100).toFixed(0)}%</span>
        <span>·</span>
        <span>Schema v{blueprint.schemaVersion}</span>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          to="/growth/masterplan"
          className="rounded-md border border-border bg-background/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          View masterplan →
        </Link>
        <Link
          to="/growth/execution"
          className="rounded-md border border-border bg-background/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          View execution board →
        </Link>
      </div>
    </header>
  );
}

// ---------- Scoreboard ----------

function Scoreboard({ scores }: { scores: LeadEngineBlueprint["scores"] }) {
  const cards = [
    { key: "leadEngineScore", title: "Lead Engine Score", suffix: "/100", score: scores.leadEngineScore },
    {
      key: "conversionReadinessScore",
      title: "Conversion Readiness",
      suffix: "/100",
      score: scores.conversionReadinessScore,
    },
    {
      key: "demandCoverageIndex",
      title: "Demand Coverage",
      suffix: "/100",
      score: scores.demandCoverageIndex,
    },
    {
      key: "growthVelocityModel",
      title: "Growth Velocity",
      suffix: " leads / 12 mo",
      score: scores.growthVelocityModel,
    },
    {
      key: "financialImpact",
      title: "Financial Impact",
      suffix: " /mo (mid scenario)",
      score: scores.financialImpact,
    },
  ];
  return (
    <section>
      <SectionHeading title="Scoreboard" subtitle="Five lenses on engine health" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <ScoreCard
            key={c.key}
            title={c.title}
            suffix={c.suffix}
            score={c.score}
          />
        ))}
      </div>
    </section>
  );
}

function ScoreCard({
  title,
  suffix,
  score,
}: {
  title: string;
  suffix: string;
  score: LeadEngineBlueprint["scores"]["leadEngineScore"];
}) {
  const value = score.value;
  const display =
    value == null
      ? "—"
      : typeof value === "number"
        ? Math.round(value).toLocaleString()
        : String(value);
  const reasons = score.reasoning.slice(0, 3);
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card/70 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-display text-3xl text-foreground">{display}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{suffix}</span>
      </div>
      <p className="mt-1 text-xs capitalize text-primary">{score.label}</p>
      {reasons.length > 0 && (
        <ul className="mt-3 space-y-1 text-[11px] leading-snug text-muted-foreground">
          {reasons.map((r, i) => (
            <li key={i} className="flex gap-1">
              <span
                className={
                  r.kind === "affirmative"
                    ? "text-emerald-500"
                    : r.kind === "penalty"
                      ? "text-destructive"
                      : "text-muted-foreground"
                }
              >
                {r.kind === "affirmative" ? "+" : r.kind === "penalty" ? "−" : "·"}
              </span>
              <span>{r.message}</span>
            </li>
          ))}
        </ul>
      )}
      {score.missingInputs.length > 0 && (
        <p className="mt-3 text-[10px] uppercase tracking-wide text-amber-500">
          Missing: {score.missingInputs.join(", ")}
        </p>
      )}
      <p className="mt-3 text-[10px] uppercase tracking-wide text-muted-foreground">
        Confidence {(score.confidence * 100).toFixed(0)}%
      </p>
    </div>
  );
}

// ---------- Generic Section ----------

function Section({
  section,
  accent,
}: {
  section: BlueprintSection | undefined;
  accent?: "primary" | "warning";
}) {
  if (!section) return null;
  const border =
    accent === "primary"
      ? "border-primary/30 bg-primary/5"
      : accent === "warning"
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-border bg-card/70";
  return (
    <section className={`rounded-xl border p-6 ${border}`}>
      <SectionHeading title={section.title} subtitle={section.summary} />
      {section.metrics && section.metrics.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {section.metrics.map((m, i) => (
            <div
              key={i}
              className="rounded-md border border-border bg-background/40 p-3"
            >
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {m.label}
              </p>
              <p className="font-display text-xl text-foreground">
                {m.value == null ? "—" : String(m.value)}
                {m.unit ? <span className="ml-1 text-xs text-muted-foreground">{m.unit}</span> : null}
              </p>
            </div>
          ))}
        </div>
      )}
      {section.items && section.items.length > 0 && (
        <ul className="mt-5 space-y-3">
          {section.items.map((item, i) => (
            <li key={i} className="rounded-md border border-border/60 bg-background/30 p-3">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              {item.detail && (
                <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                  {item.detail}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {section.warnings && section.warnings.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-amber-500">
          {section.warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Placeholder section (Market / Competitive) ----------

function PlaceholderSection({ section }: { section: BlueprintSection | undefined }) {
  if (!section) return null;
  if (!section.placeholder) {
    return <Section section={section} />;
  }
  return (
    <section className="relative overflow-hidden rounded-xl border border-dashed border-primary/30 bg-card/40 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading title={section.title} subtitle={section.summary} />
        <Badge variant="pending">
          {section.type === "market_intelligence"
            ? "Pending market scan"
            : section.type === "competitive_position"
              ? "Pending competitor scan"
              : "Pending intelligence"}
        </Badge>
      </div>
      {section.pendingDataFrom && (
        <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          Will be filled by: {section.pendingDataFrom}
        </p>
      )}
      {section.items && section.items.length > 0 && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {section.items.map((item, i) => (
            <li
              key={i}
              className="rounded-md border border-border/60 bg-background/30 px-3 py-2"
            >
              <p className="text-sm text-foreground">{item.title}</p>
              {item.detail && (
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {section.warnings && section.warnings.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">{section.warnings.join(" · ")}</p>
      )}
    </section>
  );
}

// ---------- Market Intelligence (rich) ----------

function MarketIntelligenceBlock({
  section,
  tenantId,
  growthGoalId,
}: {
  section: BlueprintSection | undefined;
  tenantId: string | null;
  growthGoalId: string | null;
}) {
  const queryClient = useQueryClient();
  const runScan = useServerFn(runDataForSeoMarketScan);
  const [scanError, setScanError] = useState<string | null>(null);

  const scanMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No active tenant");
      return await runScan({
        data: { tenantId, growthGoalId: growthGoalId ?? null },
      });
    },
    onSuccess: () => {
      setScanError(null);
      queryClient.invalidateQueries({ queryKey: ["market-summary"] });
    },
    onError: (err: unknown) => {
      setScanError(err instanceof Error ? err.message : "Scan failed");
    },
  });

  const ScanButton = (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => scanMutation.mutate()}
        disabled={!tenantId || scanMutation.isPending}
        className="rounded-md border border-primary/40 bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
      >
        {scanMutation.isPending ? "Running scan…" : "Run market scan"}
      </button>
      {scanError && (
        <p className="max-w-xs text-right text-[11px] text-amber-500">⚠ {scanError}</p>
      )}
    </div>
  );

  if (!section) return null;
  if (section.placeholder) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-card/40 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading title={section.title} subtitle={section.summary} />
          {ScanButton}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          No completed market scan yet. Run a DataForSEO scan to populate demand clusters.
        </p>
        {section.warnings && section.warnings.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">{section.warnings.join(" · ")}</p>
        )}
      </section>
    );
  }

  const items = section.items ?? [];
  const clusters = items.filter((i) => (i.meta?.kind ?? "") === "cluster");
  const genericClusters = items.filter((i) => (i.meta?.kind ?? "") === "generic_cluster");
  const topServices = items.filter((i) => (i.meta?.kind ?? "") === "top_service");

  const topLocations = items.filter((i) => (i.meta?.kind ?? "") === "top_location");
  const intents = items.filter((i) => (i.meta?.kind ?? "") === "intent_breakdown");

  const sourceMetric = section.metrics?.find((m) => m.label === "Source");
  const isSyntheticOrManual =
    typeof sourceMetric?.value === "string" &&
    (sourceMetric.value === "Synthetic fixture" || sourceMetric.value === "Manual entry");

  type ClusterItem = NonNullable<BlueprintSection["items"]>[number];
  const renderClusterCard = (
    c: ClusterItem,
    i: number,
    opts: { dimmed?: boolean } = {},
  ) => {
    const meta = c.meta ?? {};
    const intent = meta.intent ? String(meta.intent) : null;
    const priority = meta.priority ? String(meta.priority) : null;
    const opp =
      typeof meta.opportunityScore === "number" ? meta.opportunityScore : null;
    const volume =
      typeof meta.totalVolume === "number" ? meta.totalVolume : null;
    const localityType = meta.localityType ? String(meta.localityType) : null;
    const keywords =
      typeof meta.representativeKeywords === "string"
        ? meta.representativeKeywords
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    return (
      <li
        key={i}
        className={`rounded-md border p-3 ${
          opts.dimmed
            ? "border-border/40 bg-background/20"
            : "border-border/60 bg-background/40"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">
            {i + 1}. {c.title}
          </p>
          {opp != null && (
            <Badge variant={opp >= 65 ? "success" : opp >= 45 ? "primary" : "muted"}>
              Opp {Math.round(opp)}
            </Badge>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          {intent && <Badge variant="muted">Intent: {intent}</Badge>}
          {priority && <Badge variant="muted">{priority}</Badge>}
          {volume != null && <Badge variant="muted">{volume.toLocaleString()} vol/mo</Badge>}
          {localityType === "mixed" && <Badge variant="warning">Mixed</Badge>}
        </div>
        {keywords.length > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">Keywords:</span>{" "}
            {keywords.join(", ")}
          </p>
        )}
      </li>
    );
  };

  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading title={section.title} subtitle={section.summary} />
        <div className="flex flex-col items-end gap-2">
          {sourceMetric && (
            <Badge variant={isSyntheticOrManual ? "warning" : "success"}>
              {String(sourceMetric.value)}
            </Badge>
          )}
          {ScanButton}
        </div>
      </div>


      {section.metrics && section.metrics.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {section.metrics.map((m, i) => (
            <div
              key={i}
              className="rounded-md border border-border bg-background/40 p-3"
            >
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {m.label}
              </p>
              <p className="font-display text-lg text-foreground">
                {m.value == null || m.value === "" ? "—" : String(m.value)}
              </p>
            </div>
          ))}
        </div>
      )}

      {clusters.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Top local opportunity clusters
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Local demand for the client's declared service area. Roadmap and
            page priorities are driven from this list.
          </p>
          <ol className="mt-3 grid gap-3 md:grid-cols-2">
            {clusters.map((c, i) => renderClusterCard(c, i))}
          </ol>
        </div>
      )}

      {genericClusters.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Generic demand reference
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Useful as a category-demand signal, but not treated as local
            opportunity — these keywords have no city intent.
          </p>
          <ol className="mt-3 grid gap-3 md:grid-cols-2">
            {genericClusters.map((c, i) => renderClusterCard(c, i, { dimmed: true }))}
          </ol>
        </div>
      )}


      {(topServices.length > 0 || topLocations.length > 0) && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {topServices.length > 0 && (
            <PivotList title="Top services by demand" items={topServices} />
          )}
          {topLocations.length > 0 && (
            <PivotList title="Top locations by demand" items={topLocations} />
          )}
        </div>
      )}

      {intents.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Intent breakdown
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {intents.map((i, idx) => (
              <Badge key={idx} variant="muted">
                {i.title}: {String(i.meta?.count ?? 0)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {section.warnings && section.warnings.length > 0 && (
        <ul className="mt-5 space-y-1 text-xs text-amber-500">
          {section.warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CompetitiveBlock({
  section,
  tenantId,
  growthGoalId,
}: {
  section: BlueprintSection | undefined;
  tenantId: string | null;
  growthGoalId: string | null;
}) {
  const queryClient = useQueryClient();
  const runScan = useServerFn(runCompetitorScanFn);
  const fetchSummary = useServerFn(summarizeLatestCompetitorScan);
  const [scanError, setScanError] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ["competitor-summary", tenantId, growthGoalId],
    queryFn: async () => {
      if (!tenantId)
        return { summary: null, config: { dataForSeo: false, firecrawl: false } };
      return await fetchSummary({ data: { tenantId, growthGoalId: growthGoalId ?? null } });
    },
    enabled: !!tenantId,
  });
  const config = configQuery.data?.config ?? { dataForSeo: false, firecrawl: false };
  const configReady = config.dataForSeo && config.firecrawl;

  const scanMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No active tenant");
      return await runScan({
        data: { tenantId, growthGoalId: growthGoalId ?? null },
      });
    },
    onSuccess: () => {
      setScanError(null);
      queryClient.invalidateQueries({ queryKey: ["competitor-summary"] });
    },
    onError: (err: unknown) => {
      setScanError(err instanceof Error ? err.message : "Scan failed");
    },
  });

  const ScanButton = (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => scanMutation.mutate()}
        disabled={!tenantId || !configReady || scanMutation.isPending}
        className="rounded-md border border-primary/40 bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        title={
          !configReady
            ? "Requires DataForSEO and Firecrawl API keys"
            : "Run a SERP + scrape competitor scan"
        }
      >
        {scanMutation.isPending ? "Running competitor scan…" : "Run competitor scan"}
      </button>
      {!configReady && (
        <p className="max-w-xs text-right text-[11px] text-muted-foreground">
          Missing keys: {!config.dataForSeo && "DataForSEO"}
          {!config.dataForSeo && !config.firecrawl && " · "}
          {!config.firecrawl && "Firecrawl"}
        </p>
      )}
      {scanError && (
        <p className="max-w-xs text-right text-[11px] text-amber-500">⚠ {scanError}</p>
      )}
    </div>
  );

  if (!section) return null;

  if (section.placeholder) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-card/40 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading title={section.title} subtitle={section.summary} />
          {ScanButton}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          No competitor scan yet. Run a scan to compare your domain against the
          local SERP winners on reviews, page depth, trust signals, and SERP
          presence.
        </p>
        {section.warnings && section.warnings.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {section.warnings.join(" · ")}
          </p>
        )}
      </section>
    );
  }

  const items = section.items ?? [];
  const selfItem = items.find((i) => i.meta?.isSelf);
  const competitorItems = items.filter((i) => !i.meta?.isSelf);
  const directItems = competitorItems.filter((i) => i.meta?.isIntermediary !== true);
  const intermediaryItems = competitorItems.filter((i) => i.meta?.isIntermediary === true);

  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading title={section.title} subtitle={section.summary} />
        {ScanButton}
      </div>

      {section.metrics && section.metrics.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {section.metrics.map((m, i) => (
            <div key={i} className="rounded-md border border-border bg-background/40 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {m.label}
              </p>
              <p className="font-display text-lg text-foreground">
                {m.value == null || m.value === "" ? "—" : String(m.value)}
                {m.unit ? <span className="ml-1 text-xs text-muted-foreground">{m.unit}</span> : null}
              </p>
            </div>
          ))}
        </div>
      )}

      {selfItem && (() => {
        const mode = selfItem.meta?.identityMode as string | undefined;
        const isBaseline =
          mode === "profile_baseline" ||
          mode === "unknown_baseline" ||
          mode === "connected_site";
        const notFound = selfItem.meta?.rankingPresence === "not_found";
        const isTemp = selfItem.meta?.temporaryDomain === true;
        return (
          <div className="mt-6 rounded-md border border-primary/40 bg-background/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                Your site
              </p>
              {isBaseline && (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                  Baseline
                </span>
              )}
              {notFound && (
                <span className="rounded-full border border-muted-foreground/30 bg-background/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Not found in SERP
                </span>
              )}
              {isTemp && (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                  Temporary domain
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-semibold text-foreground">{selfItem.title}</p>
            {selfItem.detail && (
              <p className="mt-1 text-xs text-muted-foreground">{selfItem.detail}</p>
            )}
            {(() => {
              const m = selfItem.meta ?? {};
              const es = m.existingServicePages as number | undefined;
              const ps = m.plannedServicePages as number | undefined;
              const el = m.existingLocationPages as number | undefined;
              const pl = m.plannedLocationPages as number | undefined;
              if (es == null && ps == null && el == null && pl == null) return null;
              return (
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide">
                  <span className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-muted-foreground">
                    Service: {es ?? 0} existing · {ps ?? 0} planned
                  </span>
                  <span className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-muted-foreground">
                    Location: {el ?? 0} existing · {pl ?? 0} planned
                  </span>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {directItems.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Direct competitors
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Local businesses competing for the same service demand. Drives gap scoring.
          </p>
          <ul className="mt-3 space-y-2">
            {directItems.map((c, i) => {
              const m = c.meta ?? {};
              const localMatched = m.localPackMatched === true;
              const hasReviewData = m.hasReviewData === true;
              const lpConf = typeof m.localPackMatchConfidence === "number"
                ? (m.localPackMatchConfidence as number)
                : null;
              const depthLimited = m.pageDepthLimited === true;
              const classifierNoise = m.classifierNoise === true || m.locationCountNeedsValidation === true;
              const svcConf = typeof m.servicePagesConfidence === "string"
                ? (m.servicePagesConfidence as "high" | "medium" | "low")
                : null;
              const locConf = typeof m.locationPagesConfidence === "string"
                ? (m.locationPagesConfidence as "high" | "medium" | "low")
                : null;
              const lowDepth = svcConf === "low" || locConf === "low";
              const svcSamples = typeof m.servicePageSamples === "string" && m.servicePageSamples
                ? (m.servicePageSamples as string).split(" | ").slice(0, 2)
                : [];
              const locSamples = typeof m.locationPageSamples === "string" && m.locationPageSamples
                ? (m.locationPageSamples as string).split(" | ").slice(0, 2)
                : [];
              // Match label logic (Phase B2):
              // - If review data exists → "Review data matched"
              // - Else if local-pack confirmed but weak → "Weak local-pack match"
              // - Else if local-pack confirmed → "Local-pack matched"
              // - Else → "No local-pack match"
              let matchBadge: { label: string; tone: "ok" | "weak" | "none" } = {
                label: "No local-pack match",
                tone: "none",
              };
              if (hasReviewData) {
                matchBadge = { label: "Review data matched", tone: "ok" };
              } else if (localMatched && lpConf != null && lpConf < 0.6) {
                matchBadge = { label: "Weak local-pack match", tone: "weak" };
              } else if (localMatched) {
                matchBadge = { label: "Local-pack matched", tone: "ok" };
              }
              return (
                <li
                  key={i}
                  className="rounded-md border border-border/60 bg-background/40 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {i + 1}. {c.title}
                    </p>
                    <CompetitorTypeBadge type={c.meta?.competitorType as string | undefined} />
                    <span
                      className={
                        matchBadge.tone === "ok"
                          ? "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600"
                          : matchBadge.tone === "weak"
                            ? "rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600"
                            : "rounded-full border border-muted-foreground/30 bg-background/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                      }
                    >
                      {matchBadge.label}
                    </span>
                    {depthLimited && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                        Crawl limited
                      </span>
                    )}
                    {(classifierNoise || lowDepth) && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                        Page-depth noisy
                      </span>
                    )}
                  </div>
                  {c.detail && (
                    <p className="mt-1 text-xs text-muted-foreground">{c.detail}</p>
                  )}
                  {(svcSamples.length > 0 || locSamples.length > 0) && (
                    <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                      {svcSamples.length > 0 && (
                        <p className="truncate">
                          <span className="font-semibold text-foreground/80">Service pages:</span>{" "}
                          {svcSamples.join(", ")}
                        </p>
                      )}
                      {locSamples.length > 0 && (
                        <p className="truncate">
                          <span className="font-semibold text-foreground/80">Location pages:</span>{" "}
                          {locSamples.join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {intermediaryItems.length > 0 && (
        <div className="mt-6 rounded-md border border-dashed border-border/60 bg-background/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            SERP intermediaries
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Directories, aggregators, and listicles that capture search demand. Not
            direct service providers — excluded from direct competitor scoring.
          </p>
          <ul className="mt-3 space-y-2">
            {intermediaryItems.map((c, i) => (
              <li
                key={i}
                className="rounded-md border border-border/40 bg-background/40 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground/90">
                    {c.title}
                  </p>
                  <CompetitorTypeBadge type={c.meta?.competitorType as string | undefined} />
                </div>
                {c.detail && (
                  <p className="mt-1 text-[11px] text-muted-foreground">{c.detail}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {section.evidence && section.evidence.length > 0 && (
        <ul className="mt-5 space-y-1 text-[11px] text-muted-foreground">
          {section.evidence.map((e, i) => (
            <li key={i}>· {e}</li>
          ))}
        </ul>
      )}

      {section.warnings && section.warnings.length > 0 && (
        <ul className="mt-5 space-y-1 text-xs text-amber-500">
          {section.warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CompetitorTypeBadge({ type }: { type: string | undefined }) {
  if (!type) return null;
  const label =
    type === "local_business"
      ? "Local business"
      : type === "franchise"
        ? "Franchise"
        : type === "directory"
          ? "Directory"
          : type === "aggregator"
            ? "Aggregator"
            : type === "content"
              ? "Content"
              : "Unknown";
  const cls =
    type === "local_business"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
      : type === "franchise"
        ? "border-primary/40 bg-primary/10 text-primary"
        : type === "directory" || type === "aggregator"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
          : type === "content"
            ? "border-blue-500/40 bg-blue-500/10 text-blue-600"
            : "border-muted-foreground/30 bg-background/40 text-muted-foreground";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}



function PivotList({
  title,
  items,
}: {
  title: string;
  items: NonNullable<BlueprintSection["items"]>;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
        {title}
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-foreground">{it.title}</span>
            <span className="text-muted-foreground">
              {typeof it.meta?.totalVolume === "number"
                ? `${it.meta.totalVolume.toLocaleString()} vol`
                : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Page diagnostics ----------

function PageDiagnostics({ section }: { section: BlueprintSection | undefined }) {
  if (!section) return null;
  if (section.placeholder || !section.items?.length) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-card/40 p-6">
        <SectionHeading title={section.title} subtitle={section.summary} />
        <p className="mt-3 text-xs text-muted-foreground">
          Open <Link to="/sites" className="text-primary underline">Sites</Link> and run an audit on the connected site to populate per-page diagnostics. Scores will sharpen as soon as page intelligence lands.
        </p>
        {section.warnings && section.warnings.length > 0 && (
          <ul className="mt-3 space-y-1 text-[11px] text-amber-500">
            {section.warnings.map((w, i) => (<li key={i}>⚠ {w}</li>))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card/70 p-6">
      <SectionHeading title={section.title} subtitle={section.summary} />
      <div className="mt-4 overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-background/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Page</th>
              <th className="px-3 py-2 text-left">Role</th>
              <th className="px-3 py-2 text-left">Main gaps</th>
              <th className="px-3 py-2 text-left">Next action</th>
            </tr>
          </thead>
          <tbody>
            {section.items.map((item, i) => {
              const meta = (item.meta ?? {}) as Record<string, unknown>;
              return (
                <tr key={i} className="border-t border-border/60">
                  <td className="px-3 py-2 align-top text-foreground">
                    {item.title}
                    {typeof meta.url === "string" && (
                      <p className="text-[10px] text-muted-foreground">{meta.url}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                    {(meta.role as string | null) ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                    {item.detail ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                    {(meta.nextAction as string | null) ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------- Roadmap ----------

function Roadmap({ section }: { section: BlueprintSection | undefined }) {
  if (!section) return null;
  const items = section.items ?? [];
  return (
    <section className="rounded-xl border border-border bg-card/70 p-6">
      <SectionHeading title={section.title} subtitle={section.summary} />
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {items.map((phase, i) => {
          const count = Number((phase.meta ?? {}).itemCount ?? 0);
          return (
            <div
              key={i}
              className="flex flex-col rounded-lg border border-border bg-background/40 p-4"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                Phase {i + 1}
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">{phase.title}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {count} item{count === 1 ? "" : "s"}
              </p>
              <p className="mt-3 whitespace-pre-line text-xs text-muted-foreground">
                {phase.detail}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------- Lead Engine Map ----------

const LAYER_LABELS: Record<string, string> = {
  trafficSources: "Traffic sources",
  landingAssets: "Landing assets",
  conversionPaths: "Conversion paths",
  trustBuilders: "Trust builders",
  measurementLayer: "Measurement layer",
};

function LeadEngineMapBlock({ blueprint }: { blueprint: LeadEngineBlueprint }) {
  const map = blueprint.leadEngineMap;
  const cols = [
    { key: "trafficSources", nodes: map.trafficSources },
    { key: "landingAssets", nodes: map.landingAssets },
    { key: "conversionPaths", nodes: map.conversionPaths },
    { key: "trustBuilders", nodes: map.trustBuilders },
    { key: "measurementLayer", nodes: map.measurementLayer },
  ];
  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-6">
      <SectionHeading
        title="Lead Engine Map"
        subtitle="Traffic → landing → conversion → trust → measurement."
      />
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cols.map((col) => (
          <div
            key={col.key}
            className="flex flex-col rounded-lg border border-border bg-background/50 p-4"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              {LAYER_LABELS[col.key]}
            </p>
            <ul className="mt-3 space-y-2">
              {col.nodes.map((node, i) => (
                <li
                  key={i}
                  className="rounded-md border border-border/60 bg-background/40 p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground">{node.name}</p>
                    <StatusDot status={node.status} />
                  </div>
                  {node.detail && (
                    <p className="mt-1 text-[10px] text-muted-foreground">{node.detail}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    active: { color: "bg-emerald-500", label: "Active" },
    planned: { color: "bg-primary", label: "Planned" },
    missing: { color: "bg-destructive", label: "Missing" },
    unknown: { color: "bg-muted-foreground", label: "Unknown" },
  };
  const v = map[status] ?? map.unknown;
  return (
    <span className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${v.color}`} />
      {v.label}
    </span>
  );
}

// ---------- Tracking plan ----------

function TrackingPlan({ section }: { section: BlueprintSection | undefined }) {
  if (!section) return null;
  const leading = (section.items ?? []).filter(
    (i) => (i.meta?.kind ?? "") === "leading",
  );
  const lagging = (section.items ?? []).filter(
    (i) => (i.meta?.kind ?? "") === "lagging",
  );
  return (
    <section className="rounded-xl border border-border bg-card/70 p-6">
      <SectionHeading title={section.title} subtitle={section.summary} />
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Column title="Leading indicators" items={leading} />
        <Column title="Lagging indicators" items={lagging} />
      </div>
      {section.warnings && section.warnings.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-amber-500">
          {section.warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Column({
  title,
  items,
}: {
  title: string;
  items: BlueprintSection["items"];
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
        {title}
      </p>
      <ul className="mt-3 space-y-2">
        {(items ?? []).map((item, i) => (
          <li key={i} className="rounded border border-border/50 bg-background/40 p-2">
            <p className="text-sm font-medium text-foreground">{item.title}</p>
            {item.detail && (
              <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Financial model ----------

function FinancialModelBlock({ blueprint }: { blueprint: LeadEngineBlueprint }) {
  const fm = blueprint.financialModel;
  const scenarios = [fm.conservative, fm.expected, fm.aggressive];
  return (
    <section className="rounded-xl border border-border bg-card/70 p-6">
      <SectionHeading
        title="Financial Impact"
        subtitle={
          fm.available
            ? "Scenario revenue model — not a guarantee."
            : "Scenario shapes shown. Provide close rate + average lead value for revenue projection."
        }
      />
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {scenarios.map((s) => (
          <div
            key={s.label}
            className={`flex flex-col rounded-lg border p-4 ${
              s.label === "expected"
                ? "border-primary/40 bg-primary/5"
                : "border-border bg-background/40"
            }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              {s.label}
            </p>
            <p className="mt-2 font-display text-2xl text-foreground">
              {s.estimatedMonthlyRevenue != null
                ? `${Math.round(s.estimatedMonthlyRevenue).toLocaleString()} / mo`
                : "—"}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {s.estimatedAnnualRevenue != null
                ? `${Math.round(s.estimatedAnnualRevenue).toLocaleString()} / yr`
                : "Revenue pending inputs"}
            </p>
            <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
              <li>
                Leads / mo:{" "}
                <span className="text-foreground">
                  {s.monthlyLeads != null ? Math.round(s.monthlyLeads) : "—"}
                </span>
              </li>
              <li>
                New clients / mo:{" "}
                <span className="text-foreground">
                  {s.newClientsPerMonth != null
                    ? s.newClientsPerMonth.toFixed(1)
                    : "—"}
                </span>
              </li>
            </ul>
            <ul className="mt-3 space-y-1 text-[10px] text-muted-foreground">
              {s.assumptions.map((a, i) => (
                <li key={i}>· {a}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {fm.notes.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
          {fm.notes.map((n, i) => (
            <li key={i}>· {n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Client inputs ----------

function ClientInputs({ section }: { section: BlueprintSection | undefined }) {
  if (!section) return null;
  return (
    <section className="rounded-xl border border-border bg-card/70 p-6">
      <SectionHeading title={section.title} subtitle={section.summary} />
      <ul className="mt-4 space-y-3">
        {(section.items ?? []).map((item, i) => {
          const required = !!item.meta?.required;
          const category = String(item.meta?.category ?? "other");
          return (
            <li
              key={i}
              className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border/60 bg-background/30 p-3"
            >
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                {item.detail && (
                  <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant={required ? "warning" : "muted"}>
                  {required ? "Required" : "Optional"}
                </Badge>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {category.replace("_", " ")}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------- Next actions ----------

function NextActions({
  section,
  blueprint,
}: {
  section: BlueprintSection | undefined;
  blueprint: LeadEngineBlueprint;
}) {
  if (!section) return null;
  const actions = blueprint.nextActions;
  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-6">
      <SectionHeading title={section.title} subtitle={section.summary} />
      {actions.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No first-30-days items yet. Populate Phase 1 in the masterplan.
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {actions.map((a, i) => (
            <li
              key={a.id}
              className="rounded-md border border-border/60 bg-background/40 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {i + 1}. {a.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{a.why}</p>
                </div>
                <span className="rounded bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {a.type}
                </span>
              </div>
              {a.sourceMasterplanItemId && (
                <Link
                  to="/growth/masterplan/$itemId/proposals"
                  params={{ itemId: a.sourceMasterplanItemId }}
                  className="mt-2 inline-block text-[11px] font-medium text-primary hover:underline"
                >
                  Open in masterplan →
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ---------- Data availability ----------

function DataAvailabilityBlock({ blueprint }: { blueprint: LeadEngineBlueprint }) {
  const rows: { key: string; label: string; state: DataAvailabilityState }[] = [
    { key: "audit", label: "Site audit", state: blueprint.dataAvailability.audit },
    {
      key: "pageIntelligence",
      label: "Page intelligence",
      state: blueprint.dataAvailability.pageIntelligence,
    },
    { key: "trackingData", label: "Tracking", state: blueprint.dataAvailability.trackingData },
    { key: "gbpData", label: "Google Business Profile", state: blueprint.dataAvailability.gbpData },
    { key: "marketData", label: "Market scan", state: blueprint.dataAvailability.marketData },
    {
      key: "competitorData",
      label: "Competitor scan",
      state: blueprint.dataAvailability.competitorData,
    },
    { key: "rankingData", label: "Ranking baseline", state: blueprint.dataAvailability.rankingData },
  ];
  return (
    <section className="rounded-xl border border-border bg-card/50 p-6">
      <SectionHeading
        title="Data availability"
        subtitle="What this blueprint already knows and what's still pending."
      />
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => (
          <li
            key={r.key}
            className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2"
          >
            <span className="text-xs text-foreground">{r.label}</span>
            <AvailabilityBadge state={r.state} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function AvailabilityBadge({ state }: { state: DataAvailabilityState }) {
  if (state === "available") return <Badge variant="success">Available</Badge>;
  if (state === "partial") return <Badge variant="warning">Partial</Badge>;
  if (state === "placeholder") return <Badge variant="pending">Placeholder</Badge>;
  return <Badge variant="muted">Missing</Badge>;
}

// ---------- Primitives ----------

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="font-display text-2xl text-foreground">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function Badge({
  children,
  variant = "muted",
}: {
  children: React.ReactNode;
  variant?: "primary" | "warning" | "success" | "pending" | "muted";
}) {
  const cls =
    variant === "primary"
      ? "bg-primary/15 text-primary"
      : variant === "warning"
        ? "bg-amber-500/15 text-amber-500"
        : variant === "success"
          ? "bg-emerald-500/15 text-emerald-500"
          : variant === "pending"
            ? "bg-primary/10 text-primary border border-primary/30"
            : "bg-secondary text-muted-foreground";
  return (
    <span
      className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {children}
    </span>
  );
}
