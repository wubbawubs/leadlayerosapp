import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { Logo } from "@/components/brand/Logo";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import { getActiveGrowthGoal } from "@/lib/shared/growthGoals/repo.functions";
import {
  getActiveMasterplan,
  listMasterplanItems,
} from "@/lib/shared/masterplan/repo.functions";
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

  const goal = goalQuery.data?.goal ?? null;
  const plan = planQuery.data?.plan ?? null;
  const items = itemsQuery.data?.items ?? [];

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
      pageIntelligence: [],
      now: new Date(),
    };
    return generateLeadEngineBlueprint(input);
  }, [goal, plan, items, tenantId]);

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

      <PlaceholderSection section={sectionByType.market_intelligence} />
      <PlaceholderSection section={sectionByType.competitive_position} />

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

// ---------- Page diagnostics ----------

function PageDiagnostics({ section }: { section: BlueprintSection | undefined }) {
  if (!section) return null;
  if (section.placeholder || !section.items?.length) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-card/40 p-6">
        <SectionHeading title={section.title} subtitle={section.summary} />
        <p className="mt-3 text-xs text-muted-foreground">
          Run a site audit to populate per-page diagnostics.
        </p>
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
