import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { Logo } from "@/components/brand/Logo";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import { getGrowthIntelligenceSnapshot } from "@/lib/growthIntelligence/growthIntelligence.functions";
import type {
  DataAvailabilityEntry,
  GrowthIntelligenceSnapshot,
  ModuleStatus,
} from "@/lib/shared/growthIntelligence/schemas";

export const Route = createFileRoute("/_authenticated/growth/intelligence")({
  component: IntelligencePage,
  head: () => ({
    meta: [{ title: "Growth Intelligence — LeadLayer" }],
  }),
});

function IntelligencePage() {
  const fetchTenants = useServerFn(listMyTenants);
  const fetchSnapshot = useServerFn(getGrowthIntelligenceSnapshot);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });
  const tenantId = tenantsQuery.data?.tenants[0]?.id ?? null;

  const snapshotQuery = useQuery({
    queryKey: ["growth-intelligence-snapshot", tenantId],
    queryFn: async () =>
      tenantId ? await fetchSnapshot({ data: { tenantId } }) : { snapshotJson: null },
    enabled: !!tenantId,
  });

  const snapshot: GrowthIntelligenceSnapshot | null = useMemo(() => {
    const raw = snapshotQuery.data?.snapshotJson;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as GrowthIntelligenceSnapshot;
    } catch {
      return null;
    }
  }, [snapshotQuery.data]);

  return (
    <div className="min-h-screen bg-background bg-blueprint">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/app" className="text-muted-foreground hover:text-foreground">Dashboard</Link>
            <Link to="/settings/growth-goal" className="text-muted-foreground hover:text-foreground">Goal</Link>
            <span className="font-medium text-foreground">Intelligence</span>
            <Link to="/growth/blueprint" className="text-muted-foreground hover:text-foreground">Blueprint</Link>
            <Link to="/growth/masterplan" className="text-muted-foreground hover:text-foreground">Masterplan</Link>
            <Link to="/growth/execution" className="text-muted-foreground hover:text-foreground">Execution</Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl px-6 pb-24 pt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Growth Intelligence Snapshot
        </p>
        <h1 className="mt-2 font-display text-4xl text-foreground">
          The brainstem of the operating system.
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
          One normalized view of every intelligence module — goal, business profile, tone, audit,
          pages, market, competitors, GBP, masterplan, tracking and ranking. Feeds Blueprint,
          Masterplan and (soon) Execution and WordPress delivery.
        </p>

        {snapshotQuery.isLoading && (
          <p className="mt-8 text-sm text-muted-foreground">Building snapshot…</p>
        )}

        {snapshot && <SnapshotView snapshot={snapshot} />}
      </main>
    </div>
  );
}

function SnapshotView({ snapshot }: { snapshot: GrowthIntelligenceSnapshot }) {
  return (
    <div className="mt-8 space-y-8">
      <ReadinessHero snapshot={snapshot} />
      <ModuleGrid snapshot={snapshot} />
      {snapshot.warnings.length > 0 && (
        <Section title="Warnings">
          <ul className="space-y-1 text-sm text-amber-500">
            {snapshot.warnings.map((w, i) => (
              <li key={i}>· {w}</li>
            ))}
          </ul>
        </Section>
      )}
      {snapshot.missingContext.length > 0 && (
        <Section title="Missing critical context">
          <ul className="space-y-2 text-sm">
            {snapshot.missingContext.map((m) => (
              <li key={m.key} className="rounded border border-border bg-card/60 p-3">
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={m.severity} />
                  <span className="font-medium text-foreground">{m.label}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{m.whyItMatters}</p>
                <p className="mt-1 text-xs text-primary">→ {m.nextAction}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Next actions">
        <ol className="space-y-2 text-sm">
          {snapshot.nextActions.map((a, i) => (
            <li
              key={a.type + i}
              className="flex items-start justify-between gap-3 rounded border border-border bg-card/60 p-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={a.priority} />
                  <span className="font-medium text-foreground">{a.label}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{a.reason}</p>
              </div>
              {a.href && (
                <Link
                  to={a.href}
                  className="shrink-0 rounded-md border border-border bg-background/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                >
                  Open →
                </Link>
              )}
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

function ReadinessHero({ snapshot }: { snapshot: GrowthIntelligenceSnapshot }) {
  const { status } = snapshot;
  return (
    <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card/80 to-card/40 p-6">
      <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span>Overall: <span className="text-foreground">{status.overall}</span></span>
        <span>·</span>
        <span>Confidence {(status.confidence * 100).toFixed(0)}%</span>
        <span>·</span>
        <span>Schema v{snapshot.schemaVersion}</span>
      </div>
      <div className="mt-4 flex items-end gap-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Readiness</p>
          <p className="font-display text-6xl text-foreground">{status.readinessScore}<span className="text-xl text-muted-foreground">/100</span></p>
        </div>
        <div className="flex-1 rounded-lg border border-border bg-background/40 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Primary next action</p>
          <p className="mt-1 font-medium text-foreground">{status.nextBestAction.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{status.nextBestAction.reason}</p>
          {status.nextBestAction.href && (
            <Link
              to={status.nextBestAction.href}
              className="mt-3 inline-flex rounded-md border border-border bg-background/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
            >
              Go →
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function ModuleGrid({ snapshot }: { snapshot: GrowthIntelligenceSnapshot }) {
  const cards: Array<{
    module: string;
    label: string;
    entry: DataAvailabilityEntry;
    metric: string;
    detail: string;
    confidence: number;
    href?: string;
    missing: string[];
  }> = [
    {
      module: "goal",
      label: "Growth goal",
      entry: byModule(snapshot, "goal"),
      metric: snapshot.goal.targetSummary ?? "—",
      detail: snapshot.goal.requiredLeadsPerMonth
        ? `${snapshot.goal.requiredLeadsPerMonth} req. leads/mo`
        : "No lead math yet",
      confidence: snapshot.goal.confidence,
      href: "/settings/growth-goal",
      missing: snapshot.goal.missing,
    },
    {
      module: "business",
      label: "Business profile",
      entry: byModule(snapshot, "business"),
      metric: snapshot.business.primaryOffer ?? snapshot.business.businessName ?? "—",
      detail: `${snapshot.business.services.length} services · proof ${snapshot.business.proofStatus}`,
      confidence: snapshot.business.confidence,
      href: "/settings/business-profile",
      missing: snapshot.business.missing,
    },
    {
      module: "tone",
      label: "Tone profile",
      entry: byModule(snapshot, "tone"),
      metric: snapshot.tone.commercialIntensity ?? "—",
      detail: `${snapshot.tone.preferredWordsCount} preferred · ${snapshot.tone.forbiddenWordsCount} forbidden`,
      confidence: snapshot.tone.confidence,
      href: "/settings/tone-profile",
      missing: snapshot.tone.missing,
    },
    {
      module: "website",
      label: "Website + audit",
      entry: byModule(snapshot, "website"),
      metric: snapshot.website.connectedDomain ?? "—",
      detail: snapshot.website.siteAuditAvailable
        ? `Audit ${snapshot.website.auditScore ?? "—"} · ${snapshot.website.pagesCrawled ?? 0} pages`
        : "No audit",
      confidence: snapshot.website.confidence,
      href: "/sites",
      missing: snapshot.website.missing,
    },
    {
      module: "pages",
      label: "Page intelligence",
      entry: byModule(snapshot, "pages"),
      metric: `${snapshot.pages.pagesAnalyzed} pages`,
      detail: `${snapshot.pages.pagesWithCta} CTA · ${snapshot.pages.pagesWithTrust} trust · ${snapshot.pages.thinPagesCount} thin`,
      confidence: snapshot.pages.confidence,
      href: "/growth/blueprint",
      missing: snapshot.pages.missing,
    },
    {
      module: "market",
      label: "Market intelligence",
      entry: byModule(snapshot, "market"),
      metric: snapshot.market.localDemandVolume
        ? `${snapshot.market.localDemandVolume.toLocaleString()} local vol`
        : "—",
      detail: `${snapshot.market.localClustersCount} clusters · ${snapshot.market.topService ?? "—"}`,
      confidence: snapshot.market.confidence,
      href: "/growth/blueprint",
      missing: snapshot.market.missing,
    },
    {
      module: "competitors",
      label: "Competitive intelligence",
      entry: byModule(snapshot, "competitors"),
      metric: `${snapshot.competitors.directCompetitorsCount} direct`,
      detail: snapshot.competitors.topGap ?? `${snapshot.competitors.intermediariesCount} intermediaries`,
      confidence: snapshot.competitors.confidence,
      href: "/growth/blueprint",
      missing: snapshot.competitors.missing,
    },
    {
      module: "gbp",
      label: "Google Business Profile",
      entry: byModule(snapshot, "gbp"),
      metric: snapshot.gbp.profileStatus ?? "not connected",
      detail: `Completeness ${snapshot.gbp.completenessScore} · Trust ${snapshot.gbp.trustScore}`,
      confidence: snapshot.gbp.confidence,
      href: "/growth/gbp",
      missing: snapshot.gbp.missing,
    },
    {
      module: "masterplan",
      label: "Masterplan",
      entry: byModule(snapshot, "masterplan"),
      metric: `${snapshot.masterplan.itemCount} items`,
      detail: `${snapshot.masterplan.activeItems} active`,
      confidence: snapshot.masterplan.confidence,
      href: "/growth/masterplan",
      missing: snapshot.masterplan.missing,
    },
    {
      module: "tracking",
      label: "Tracking",
      entry: byModule(snapshot, "tracking"),
      metric: snapshot.tracking.currentLeadBaseline != null
        ? `${snapshot.tracking.currentLeadBaseline} leads baseline`
        : "—",
      detail: "Not yet integrated",
      confidence: snapshot.tracking.confidence,
      missing: snapshot.tracking.missing,
    },
    {
      module: "ranking",
      label: "Ranking baseline",
      entry: byModule(snapshot, "ranking"),
      metric: `${snapshot.ranking.clustersTracked} clusters`,
      detail: "Planned for later sprint",
      confidence: snapshot.ranking.confidence,
      missing: snapshot.ranking.missing,
    },
  ];

  return (
    <section>
      <SectionHeader title="Modules" subtitle="Status, key metric, missing context" />
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <article key={c.module} className="rounded-lg border border-border bg-card/70 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{c.label}</h3>
              <StatusBadge status={c.entry.status} />
            </div>
            <p className="mt-3 font-display text-xl text-foreground">{c.metric}</p>
            <p className="text-xs text-muted-foreground">{c.detail}</p>
            <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              Confidence {(c.confidence * 100).toFixed(0)}%
            </p>
            {c.missing.length > 0 && (
              <p className="mt-2 text-[11px] text-amber-500">
                Missing: {c.missing.slice(0, 3).join(", ")}
              </p>
            )}
            {c.href && (
              <Link
                to={c.href}
                className="mt-3 inline-flex rounded-md border border-border bg-background/40 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary"
              >
                Open →
              </Link>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function byModule(s: GrowthIntelligenceSnapshot, m: string): DataAvailabilityEntry {
  return (
    s.dataAvailability.find((d) => d.module === m) ?? {
      module: m,
      status: "missing",
      label: m,
    }
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <SectionHeader title={title} />
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="font-display text-2xl text-foreground">{title}</h2>
      {subtitle && <p className="text-xs uppercase tracking-widest text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

const STATUS_COLOR: Record<ModuleStatus, string> = {
  missing: "bg-destructive/20 text-destructive",
  placeholder: "bg-amber-500/20 text-amber-500",
  partial: "bg-amber-500/15 text-amber-500",
  available: "bg-emerald-500/20 text-emerald-500",
  reviewed: "bg-primary/20 text-primary",
  connected: "bg-primary/20 text-primary",
};

function StatusBadge({ status }: { status: ModuleStatus }) {
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_COLOR[status]}`}>
      {status}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: "low" | "medium" | "high" | "critical" }) {
  const map: Record<string, string> = {
    low: "bg-secondary text-muted-foreground",
    medium: "bg-amber-500/15 text-amber-500",
    high: "bg-amber-500/25 text-amber-500",
    critical: "bg-destructive/20 text-destructive",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${map[severity]}`}>
      {severity}
    </span>
  );
}
