/**
 * Lead Engine Blueprint — Generator (Ticket 1b).
 *
 * Pure function that assembles a structured LeadEngineBlueprint from:
 *  - Scoring framework (Ticket 1a)
 *  - Growth Goal
 *  - Business Profile
 *  - Masterplan (+ items)
 *  - Page Intelligence
 *  - Audit summary
 *  - Optional placeholder market / competitor / GBP / ranking / tracking data
 *
 * Rules (see docs/LEAD_ENGINE_BLUEPRINT_GENERATOR.md):
 *  - Deterministic. Same inputs → same outputs.
 *  - No DB, no API, no side effects.
 *  - Safe defaults when data is missing.
 *  - Placeholders are explicit; never invent search volumes, competitors,
 *    GBP/review counts, or guarantees.
 *  - Reads from existing structured sources — does not fork Masterplan logic.
 */

import {
  calculateConversionReadinessScore,
  calculateDemandCoverageIndex,
  calculateFinancialImpactScenarios,
  calculateGrowthVelocityModel,
  calculateLeadEngineScore,
  type ScoringInputs,
} from "./scoring";
import {
  BLUEPRINT_SCHEMA_VERSION,
  type BlueprintAssumption,
  type BlueprintScore,
  type BlueprintScores,
  type BlueprintSection,
  type BlueprintSectionItem,
  type ClientQuestion,
  type DataAvailability,
  type DataAvailabilityState,
  type FinancialModel,
  type BlueprintFinancialScenario,
  type GrowthVelocityScore,
  type LeadEngineBlueprint,
  type LeadEngineMap,
  type LeadEngineNode,
  type NextAction,
} from "./schemas";

// ---------------------------------------------------------------------------
// Input contract (intentionally loose / structural)
// ---------------------------------------------------------------------------

export interface GeneratorGrowthGoal {
  id?: string;
  targetType?: string | null;
  targetCount?: number | null;
  currentCount?: number | null;
  closeRate?: number | null;
  leadValue?: number | null;
  timeframeMonths?: number | null;
  serviceFocus?: string[];
  locations?: string[];
  language?: string | null;
  hasTracking?: boolean;
  trackingNotes?: string | null;
}

export interface GeneratorBusinessProfile {
  businessName?: string | null;
  vertical?: string | null;
  primaryOffer?: string | null;
  icp?: string | null;
  primaryCta?: string | null;
  proofPoints?: string[];
  language?: string | null;
  confidence?: number | null;
  serviceHours?: string | null;
  emergencyAvailable?: boolean | null;
  licenses?: string[];
  reviewSummary?: { count?: number | null; rating?: number | null } | null;
}

export interface GeneratorToneProfile {
  voice?: string | null;
  doNotSay?: string[];
}

export interface GeneratorMasterPlan {
  id?: string;
  confidence?: number | null;
  language?: string | null;
}

export interface GeneratorMasterplanItem {
  id: string;
  title: string;
  description?: string | null;
  phase?: "first_30_days" | "days_31_60" | "days_61_90" | "months_4_6" | "months_7_12" | string | null;
  type?: string | null;
  priority?: number | null;
  service?: string | null;
  location?: string | null;
  rationale?: string | null;
}

export interface GeneratorPage {
  id?: string;
  url?: string | null;
  title?: string | null;
  role?: string | null;
  hasCta?: boolean | null;
  hasTrustSignals?: boolean | null;
  isThin?: boolean | null;
  issues?: string[];
  recommendation?: string | null;
}

export interface GeneratorAuditSummary {
  overallScore?: number | null;
  crawledPages?: number | null;
  issueCounts?: { critical?: number; high?: number; medium?: number; low?: number };
  topIssues?: Array<{ title: string; severity?: string; detail?: string }>;
}

export interface GeneratorMarketData {
  totalAddressableVolume?: number | null;
  capturedVolume?: number | null;
  clusterCount?: number;
  clustersCovered?: number;
  source?: string;
}

export interface GeneratorCompetitorData {
  competitors?: Array<{ name: string; note?: string }>;
  source?: string;
}

export interface GeneratorGbpData {
  connected?: boolean;
  reviewsCount?: number | null;
  averageRating?: number | null;
  postsLast30Days?: number | null;
  photosCount?: number | null;
  categories?: string[];
}

export interface GeneratorRankingData {
  keywordsTracked?: number;
  inTop10?: number;
  inLocalPack?: number;
}

export interface GeneratorTrackingData {
  hasAnalytics?: boolean;
  hasCallTracking?: boolean;
  hasFormTracking?: boolean;
  hasConversionsConfigured?: boolean;
}

export interface GenerateBlueprintInput {
  tenantId?: string;
  growthGoal: GeneratorGrowthGoal;
  businessProfile?: GeneratorBusinessProfile;
  toneProfile?: GeneratorToneProfile;
  masterPlan: GeneratorMasterPlan;
  masterplanItems: GeneratorMasterplanItem[];
  pageIntelligence: GeneratorPage[];
  auditSummary?: GeneratorAuditSummary;
  marketData?: GeneratorMarketData;
  competitorData?: GeneratorCompetitorData;
  gbpData?: GeneratorGbpData;
  rankingData?: GeneratorRankingData;
  trackingData?: GeneratorTrackingData;
  /** Deterministic timestamp; defaults to a fixed epoch when omitted to keep snapshots stable in tests. */
  now?: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickLanguage(input: GenerateBlueprintInput): string {
  return (
    input.businessProfile?.language ||
    input.growthGoal.language ||
    input.masterPlan.language ||
    "en"
  );
}

function nonEmpty<T>(arr: T[] | undefined | null): T[] {
  return Array.isArray(arr) ? arr.filter((x) => x != null) : [];
}

function scoreLabel(score: number): string {
  if (score >= 90) return "market-leading engine";
  if (score >= 75) return "strong engine";
  if (score >= 60) return "solid foundation";
  if (score >= 40) return "developing engine";
  return "weak foundation";
}

function round(n: number, decimals = 0): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

// ---------------------------------------------------------------------------
// Scoring inputs adapter
// ---------------------------------------------------------------------------

function toScoringInputs(input: GenerateBlueprintInput): ScoringInputs {
  const pages = input.pageIntelligence ?? [];
  const totalPages = pages.length;
  const pagesWithCta = pages.filter((p) => p.hasCta).length;
  const pagesWithTrust = pages.filter((p) => p.hasTrustSignals).length;
  const thinPages = pages.filter((p) => p.isThin).length;

  const items = input.masterplanItems ?? [];
  const firstPhase = items.filter((i) => i.phase === "first_30_days").length;

  const bp = input.businessProfile;

  return {
    audit: input.auditSummary
      ? {
          overallScore: input.auditSummary.overallScore ?? null,
          issueCounts: input.auditSummary.issueCounts,
          crawledPages: input.auditSummary.crawledPages ?? null,
        }
      : undefined,
    pageIntelligence: totalPages
      ? { totalPages, pagesWithCta, pagesWithTrust, thinPages }
      : undefined,
    masterplan: {
      itemCount: items.length,
      firstPhaseCount: firstPhase,
      confidence: input.masterPlan.confidence ?? null,
      prioritizedServices: uniq(items.map((i) => i.service ?? "").filter(Boolean)),
      prioritizedLocations: uniq(items.map((i) => i.location ?? "").filter(Boolean)),
    },
    businessProfile: bp
      ? {
          hasVertical: !!bp.vertical,
          hasPrimaryOffer: !!bp.primaryOffer,
          hasIcp: !!bp.icp,
          hasPrimaryCta: !!bp.primaryCta,
          hasProofPoints: (bp.proofPoints?.length ?? 0) > 0,
          confidence: bp.confidence ?? null,
        }
      : undefined,
    goal: {
      targetType: input.growthGoal.targetType ?? null,
      targetCount: input.growthGoal.targetCount ?? null,
      currentCount: input.growthGoal.currentCount ?? null,
      closeRate: input.growthGoal.closeRate ?? null,
      leadValue: input.growthGoal.leadValue ?? null,
      timeframeMonths: input.growthGoal.timeframeMonths ?? null,
      serviceFocusCount: input.growthGoal.serviceFocus?.length ?? 0,
      locationCount: input.growthGoal.locations?.length ?? 0,
      hasTracking: !!input.growthGoal.hasTracking,
    },
    marketData: input.marketData
      ? {
          totalAddressableVolume: input.marketData.totalAddressableVolume ?? null,
          capturedVolume: input.marketData.capturedVolume ?? null,
          clusterCount: input.marketData.clusterCount ?? 0,
          clustersCovered: input.marketData.clustersCovered ?? 0,
        }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Scores → Blueprint scores
// ---------------------------------------------------------------------------

function buildScores(scoring: ScoringInputs): BlueprintScores {
  const engine = calculateLeadEngineScore(scoring);
  const conv = calculateConversionReadinessScore(scoring);
  const demand = calculateDemandCoverageIndex(scoring);
  const velocity = calculateGrowthVelocityModel(scoring);
  const fin = calculateFinancialImpactScenarios(scoring);

  const missing = (cond: boolean, msg: string): string[] => (cond ? [msg] : []);

  const engineScore: BlueprintScore = {
    value: engine.score,
    label: scoreLabel(engine.score),
    reasoning: engine.reasoning,
    missingInputs: [
      ...missing(!scoring.audit, "site audit"),
      ...missing(!scoring.pageIntelligence, "page intelligence"),
      ...missing(!scoring.marketData, "market data"),
    ],
    confidence: engine.confidence,
  };

  const convScore: BlueprintScore = {
    value: conv.score,
    label: scoreLabel(conv.score),
    reasoning: conv.reasoning,
    missingInputs: missing(conv.pagesEvaluated === 0, "page-level intelligence"),
    confidence: conv.confidence,
  };

  const demandScore: BlueprintScore = {
    value: demand.score,
    label: demand.isPlaceholder ? "pending market scan" : scoreLabel(demand.score),
    reasoning: demand.reasoning,
    missingInputs: missing(demand.isPlaceholder, "DataForSEO / market scan"),
    confidence: demand.confidence,
  };

  const velocityScore: GrowthVelocityScore = {
    value: velocity.cumulativeLeads.at(-1) ?? null,
    label: `${(velocity.monthlyGrowthRate * 100).toFixed(1)}% projected monthly growth`,
    reasoning: velocity.reasoning,
    missingInputs: missing(velocity.baselineMonthly === 0, "current monthly lead baseline"),
    confidence: velocity.confidence,
    monthlyLeads: velocity.monthlyLeads,
    cumulativeLeads: velocity.cumulativeLeads,
    baselineMonthly: velocity.baselineMonthly,
    monthlyGrowthRate: velocity.monthlyGrowthRate,
    horizonMonths: velocity.horizonMonths,
  };

  const finScore: BlueprintScore = {
    value: fin.scenarios.find((s) => s.label === "mid")?.monthlyRevenue ?? null,
    label: "scenario model",
    reasoning: fin.reasoning,
    missingInputs: [
      ...missing(fin.assumptions.closeRate == null, "close rate"),
      ...missing(fin.assumptions.leadValue == null, "average lead value"),
    ],
    confidence: fin.confidence,
  };

  return {
    leadEngineScore: engineScore,
    conversionReadinessScore: convScore,
    demandCoverageIndex: demandScore,
    growthVelocityModel: velocityScore,
    financialImpact: finScore,
  };
}

// ---------------------------------------------------------------------------
// Financial model
// ---------------------------------------------------------------------------

function buildFinancialModel(
  input: GenerateBlueprintInput,
  scoring: ScoringInputs,
): FinancialModel {
  const fin = calculateFinancialImpactScenarios(scoring);
  const closeRate = fin.assumptions.closeRate;
  const leadValue = fin.assumptions.leadValue;
  const available = closeRate != null && leadValue != null;

  const map: Record<"low" | "mid" | "high", BlueprintFinancialScenario["label"]> = {
    low: "conservative",
    mid: "expected",
    high: "aggressive",
  };

  const notes: string[] = [];
  if (!available) {
    notes.push(
      "Financial scenarios are partially modelled — provide close rate and average lead value for revenue projections.",
    );
  }
  notes.push("Scenario model only — not a guarantee of revenue or leads.");

  const buildScenario = (
    src: ReturnType<typeof calculateFinancialImpactScenarios>["scenarios"][number],
  ): BlueprintFinancialScenario => {
    const newClients = available ? src.monthlyClients : null;
    return {
      label: map[src.label],
      monthlyLeads: available ? src.monthlyLeads : null,
      closeRate,
      newClientsPerMonth: newClients,
      averageLeadValue: leadValue,
      estimatedMonthlyRevenue: available ? src.monthlyRevenue : null,
      estimatedAnnualRevenue: available ? src.annualRevenue : null,
      assumptions: [
        `Closes ${(src.gapClosureRate * 100).toFixed(0)}% of the lead gap`,
        closeRate != null
          ? `Close rate: ${(closeRate * 100).toFixed(0)}%`
          : "Close rate: missing — confirm with client",
        leadValue != null
          ? `Average lead value: ${leadValue}`
          : "Average lead value: missing — confirm with client",
      ],
    };
  };

  const [low, mid, high] = fin.scenarios;
  return {
    available,
    conservative: buildScenario(low),
    expected: buildScenario(mid),
    aggressive: buildScenario(high),
    notes,
  };
}

// ---------------------------------------------------------------------------
// Data availability
// ---------------------------------------------------------------------------

function buildDataAvailability(input: GenerateBlueprintInput): DataAvailability {
  const state = (
    real: boolean | undefined,
    placeholder: boolean,
  ): DataAvailabilityState => {
    if (real) return "available";
    if (placeholder) return "placeholder";
    return "missing";
  };

  return {
    marketData: state(!!input.marketData, true),
    competitorData: state(!!input.competitorData, true),
    gbpData: state(input.gbpData?.connected === true, !!input.gbpData),
    rankingData: state(
      !!input.rankingData && (input.rankingData.keywordsTracked ?? 0) > 0,
      !!input.rankingData,
    ),
    trackingData: state(
      input.trackingData?.hasAnalytics === true,
      !!input.trackingData || !!input.growthGoal.hasTracking,
    ),
    pageIntelligence: state(input.pageIntelligence.length > 0, false),
    audit: state(input.auditSummary?.overallScore != null, !!input.auditSummary),
  };
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function sectionGoal(input: GenerateBlueprintInput): BlueprintSection {
  const g = input.growthGoal;
  const horizon = g.timeframeMonths ?? 12;
  const targetCount = g.targetCount ?? null;
  const closeRate = g.closeRate ?? null;
  const currentCount = g.currentCount ?? null;

  const requiredLeads =
    targetCount != null && closeRate && closeRate > 0
      ? Math.ceil(targetCount / closeRate)
      : null;
  const requiredLeadsPerMonth =
    requiredLeads != null ? Math.ceil(requiredLeads / Math.max(1, horizon)) : null;
  const currentLeadsPerMonth =
    currentCount != null ? round(currentCount / Math.max(1, horizon), 2) : null;

  const warnings: string[] = [];
  if (closeRate != null && closeRate > 0.5) {
    warnings.push("Close rate above 50% — verify this is sustainable across the timeframe.");
  }
  if (closeRate == null) {
    warnings.push("Close rate not provided — lead math uses placeholder defaults.");
  }
  if (targetCount == null) {
    warnings.push("Target count not provided — goal math cannot be fully derived.");
  }

  const metrics = [
    { label: "Target", value: targetCount, unit: g.targetType ?? "new clients" },
    { label: "Timeframe", value: horizon, unit: "months" },
    {
      label: "Close rate",
      value: closeRate != null ? `${(closeRate * 100).toFixed(0)}%` : "missing",
    },
    {
      label: "Required leads / month",
      value: requiredLeadsPerMonth,
    },
    {
      label: "Current leads / month",
      value: currentLeadsPerMonth,
    },
  ];

  return {
    type: "goal",
    title: "Goal & Lead Math",
    summary:
      targetCount != null
        ? `Target ${targetCount} ${g.targetType ?? "new clients"} in ${horizon} months.`
        : "Growth target not fully specified — confirm with client.",
    metrics,
    warnings: warnings.length ? warnings : undefined,
  };
}

function sectionCurrentSituation(input: GenerateBlueprintInput): BlueprintSection {
  const pages = input.pageIntelligence;
  const items: BlueprintSectionItem[] = [];
  const servicePages = pages.filter((p) => (p.role ?? "").toLowerCase().includes("service"));
  const locationPages = pages.filter((p) => (p.role ?? "").toLowerCase().includes("location"));

  items.push({
    title: "Pages analyzed",
    detail: `${pages.length} page${pages.length === 1 ? "" : "s"} from page intelligence.`,
  });
  if (servicePages.length) {
    items.push({
      title: "Active service pages",
      detail: `${servicePages.length} service page${servicePages.length === 1 ? "" : "s"} detected.`,
    });
  }
  if (locationPages.length) {
    items.push({
      title: "Location coverage",
      detail: `${locationPages.length} location page${locationPages.length === 1 ? "" : "s"} detected.`,
    });
  }
  if (input.gbpData?.connected) {
    items.push({
      title: "Google Business Profile",
      detail: `Connected. ${input.gbpData.reviewsCount ?? "?"} reviews, rating ${input.gbpData.averageRating ?? "?"}.`,
    });
  } else {
    items.push({
      title: "Google Business Profile",
      detail: "Connection status unknown — pending integration (Ticket 5).",
    });
  }
  if (input.trackingData?.hasAnalytics) {
    items.push({ title: "Tracking", detail: "Analytics detected." });
  } else {
    items.push({
      title: "Tracking",
      detail: "Conversion tracking not yet verified.",
    });
  }

  const warnings: string[] = [];
  if (pages.length === 0) {
    warnings.push("No page intelligence yet — current state limited to high-level signals.");
  }

  return {
    type: "current_situation",
    title: "Current Lead Engine",
    summary: "What exists today across pages, profile presence, and tracking.",
    items,
    warnings: warnings.length ? warnings : undefined,
  };
}

function sectionGrowthGap(input: GenerateBlueprintInput, scores: BlueprintScores): BlueprintSection {
  const gaps: BlueprintSectionItem[] = [];
  if (!input.trackingData?.hasAnalytics) {
    gaps.push({
      title: "Tracking gap",
      detail: "Conversion tracking not validated — growth cannot be measured reliably.",
    });
  }
  const conv = scores.conversionReadinessScore.value ?? 0;
  if (conv < 60) {
    gaps.push({
      title: "Conversion gap",
      detail: `Conversion readiness at ${conv}/100 — pages need stronger CTAs and trust signals.`,
    });
  }
  const bp = input.businessProfile;
  if (!bp?.proofPoints?.length) {
    gaps.push({
      title: "Proof / trust gap",
      detail: "No structured proof points captured — claims and credibility are weak.",
    });
  }
  if (!input.gbpData?.connected) {
    gaps.push({
      title: "GBP gap",
      detail: "Google Business Profile not confirmed — likely largest local lead lever.",
    });
  }
  const serviceFocus = input.growthGoal.serviceFocus?.length ?? 0;
  const locations = input.growthGoal.locations?.length ?? 0;
  const items = input.masterplanItems;
  const servicesPlanned = uniq(items.map((i) => i.service ?? "").filter(Boolean)).length;
  const locationsPlanned = uniq(items.map((i) => i.location ?? "").filter(Boolean)).length;
  if (serviceFocus > servicesPlanned) {
    gaps.push({
      title: "Service coverage gap",
      detail: `${serviceFocus} priority service${serviceFocus === 1 ? "" : "s"} declared, ${servicesPlanned} addressed in plan.`,
    });
  }
  if (locations > locationsPlanned) {
    gaps.push({
      title: "Location coverage gap",
      detail: `${locations} priority location${locations === 1 ? "" : "s"} declared, ${locationsPlanned} addressed in plan.`,
    });
  }
  if (!input.rankingData) {
    gaps.push({
      title: "Reporting loop",
      detail: "Ranking baseline not yet captured (Ticket 6) — monthly loop incomplete.",
    });
  }

  return {
    type: "growth_gap",
    title: "Growth Gap",
    summary:
      gaps.length === 0
        ? "No structural gaps detected — focus on execution velocity."
        : `${gaps.length} structural gap${gaps.length === 1 ? "" : "s"} between current state and target.`,
    items: gaps,
  };
}

function sectionMarketIntelligence(input: GenerateBlueprintInput): BlueprintSection {
  if (!input.marketData) {
    const services = input.growthGoal.serviceFocus ?? [];
    const locations = input.growthGoal.locations ?? [];
    const intended = services.flatMap((s) =>
      locations.length ? locations.map((l) => `${s} — ${l}`) : [s],
    );
    return {
      type: "market_intelligence",
      title: "Market Intelligence",
      summary: "Market scan pending. Intended demand areas based on declared services × locations.",
      items: intended.slice(0, 12).map((label) => ({ title: label })),
      placeholder: true,
      pendingDataFrom: "Ticket 3 — DataForSEO Market Scan",
      warnings: [
        "No search volume or difficulty data shown until a real scan runs — placeholders only.",
      ],
    };
  }
  const md = input.marketData;
  return {
    type: "market_intelligence",
    title: "Market Intelligence",
    summary: "Demand landscape from latest market scan.",
    metrics: [
      { label: "Addressable monthly volume", value: md.totalAddressableVolume ?? null },
      { label: "Captured volume", value: md.capturedVolume ?? null },
      { label: "Clusters", value: md.clusterCount ?? 0 },
      { label: "Clusters covered", value: md.clustersCovered ?? 0 },
    ],
    evidence: md.source ? [`Source: ${md.source}`] : undefined,
  };
}

function sectionCompetitivePosition(input: GenerateBlueprintInput): BlueprintSection {
  if (!input.competitorData?.competitors?.length) {
    return {
      type: "competitive_position",
      title: "Competitive Position",
      summary: "Competitor scan pending.",
      items: [
        { title: "Reviews", detail: "Volume, velocity, and average rating vs. competitors." },
        { title: "Page depth", detail: "Service + location coverage compared." },
        { title: "GBP", detail: "Categories, services, posts, photos." },
        { title: "Tracking", detail: "Conversion measurement maturity." },
        { title: "Local coverage", detail: "Service-area saturation." },
        { title: "Rankings", detail: "Organic and local pack positions." },
      ],
      placeholder: true,
      pendingDataFrom: "Ticket 4 — Competitive Intelligence",
      warnings: ["No competitor names or counts shown until a real scan runs."],
    };
  }
  return {
    type: "competitive_position",
    title: "Competitive Position",
    summary: "Initial competitor set captured.",
    items: input.competitorData.competitors.map((c) => ({ title: c.name, detail: c.note })),
    evidence: input.competitorData.source ? [`Source: ${input.competitorData.source}`] : undefined,
  };
}

function sectionPageDiagnostics(input: GenerateBlueprintInput, scores: BlueprintScores): BlueprintSection {
  const pages = input.pageIntelligence;
  if (pages.length === 0) {
    return {
      type: "page_diagnostics",
      title: "Page Diagnostics",
      summary: "No page intelligence available yet.",
      placeholder: true,
      warnings: ["Run page intelligence to populate per-page diagnostics."],
    };
  }
  // Prioritise pages with most gaps.
  const ranked = [...pages].sort((a, b) => {
    const score = (p: GeneratorPage) =>
      (p.hasCta ? 0 : 2) + (p.hasTrustSignals ? 0 : 1) + (p.isThin ? 2 : 0);
    return score(b) - score(a);
  });
  const items: BlueprintSectionItem[] = ranked.slice(0, 8).map((p) => {
    const gaps: string[] = [];
    if (!p.hasCta) gaps.push("missing primary CTA");
    if (!p.hasTrustSignals) gaps.push("missing trust signals");
    if (p.isThin) gaps.push("thin content");
    nonEmpty(p.issues).forEach((i) => gaps.push(i));
    return {
      title: p.title || p.url || "Untitled page",
      detail: gaps.length ? gaps.join(", ") : "Healthy — keep monitoring.",
      meta: {
        url: p.url ?? null,
        role: p.role ?? null,
        nextAction: p.recommendation ?? null,
      },
    };
  });
  return {
    type: "page_diagnostics",
    title: "Page Diagnostics",
    summary: `Conversion readiness across ${pages.length} analyzed page${pages.length === 1 ? "" : "s"}.`,
    items,
    metrics: [
      {
        label: "Conversion readiness",
        value: scores.conversionReadinessScore.value,
        unit: "/100",
      },
    ],
  };
}

function sectionStrategy(): BlueprintSection {
  return {
    type: "strategy",
    title: "Strategy",
    summary: "Execution order is sequenced to compound — measurement first, then capture, then expansion.",
    items: [
      {
        title: "1. Measurement + high-intent pages",
        detail: "Validate tracking and fix the pages that already attract the highest-intent traffic.",
      },
      {
        title: "2. Service and local expansion",
        detail: "Add and strengthen service × location pages to capture uncovered demand.",
      },
      {
        title: "3. Trust, content depth, reporting",
        detail: "Layer in proof, content depth, and monthly reporting once the engine is measurable.",
      },
    ],
  };
}

function sectionRoadmap(input: GenerateBlueprintInput): BlueprintSection {
  const items = input.masterplanItems;
  const buckets: Record<string, GeneratorMasterplanItem[]> = {
    first_30_days: [],
    days_31_60: [],
    days_61_90: [],
    months_4_6: [],
    months_7_12: [],
  };
  for (const item of items) {
    const key = (item.phase ?? "first_30_days") as keyof typeof buckets;
    if (buckets[key]) buckets[key].push(item);
  }

  const labelMap: Record<string, string> = {
    first_30_days: "First 30 days",
    days_31_60: "Days 31–60",
    days_61_90: "Days 61–90",
    months_4_6: "Months 4–6",
    months_7_12: "Months 7–12",
  };

  const sectionItems: BlueprintSectionItem[] = Object.entries(buckets).map(([phase, list]) => {
    if (list.length === 0) {
      const isStrategic = phase === "months_4_6" || phase === "months_7_12";
      return {
        title: labelMap[phase],
        detail: isStrategic
          ? "Strategic extension — refined after Phase 1–3 execution data is in."
          : "No items planned in this phase yet.",
        meta: { itemCount: 0 },
      };
    }
    const top = list
      .slice(0, 5)
      .map((i) => `• ${i.title}`)
      .join("\n");
    return {
      title: labelMap[phase],
      detail: top + (list.length > 5 ? `\n…and ${list.length - 5} more` : ""),
      meta: { itemCount: list.length },
    };
  });

  return {
    type: "roadmap",
    title: "12-Month Roadmap",
    summary: "Phased execution drawn from the masterplan. Later phases stay strategic until Phase 1 data lands.",
    items: sectionItems,
  };
}

function sectionLeadEngineMap(map: LeadEngineMap): BlueprintSection {
  const fmt = (nodes: LeadEngineNode[]): BlueprintSectionItem[] =>
    nodes.map((n) => ({
      title: n.name,
      detail: n.detail,
      meta: { status: n.status },
    }));
  return {
    type: "lead_engine_map",
    title: "Lead Engine Map",
    summary: "Traffic → landing → conversion → trust → measurement.",
    items: [
      ...fmt(map.trafficSources).map((i) => ({ ...i, meta: { ...i.meta, layer: "traffic" } })),
      ...fmt(map.landingAssets).map((i) => ({ ...i, meta: { ...i.meta, layer: "landing" } })),
      ...fmt(map.conversionPaths).map((i) => ({ ...i, meta: { ...i.meta, layer: "conversion" } })),
      ...fmt(map.trustBuilders).map((i) => ({ ...i, meta: { ...i.meta, layer: "trust" } })),
      ...fmt(map.measurementLayer).map((i) => ({ ...i, meta: { ...i.meta, layer: "measurement" } })),
    ],
  };
}

function sectionTrackingPlan(input: GenerateBlueprintInput): BlueprintSection {
  const leading: BlueprintSectionItem[] = [
    { title: "Pages improved", detail: "Count of pages upgraded against the diagnostic checklist." },
    { title: "GBP actions", detail: "Posts, photos, services, and category changes per month." },
    { title: "Reviews requested / added", detail: "Track velocity, not just totals." },
    { title: "Rankings + indexing", detail: "Baseline + monthly delta once Ticket 6 lands." },
    { title: "Conversion paths improved", detail: "Forms, call buttons, lead handoff." },
  ];
  const lagging: BlueprintSectionItem[] = [
    { title: "Qualified leads", detail: "Forms + calls that match ICP." },
    { title: "Calls", detail: "Tracked phone calls from landing pages and GBP." },
    { title: "Forms", detail: "Form submissions with source attribution." },
    { title: "Close rate", detail: "Confirmed by client; refines the financial model." },
    { title: "Estimated revenue", detail: "Derived from leads × close rate × lead value." },
  ];
  const warnings: string[] = [];
  if (!input.trackingData?.hasAnalytics) {
    warnings.push("Tracking not verified — leading indicators must be re-checked once tracking is live.");
  }
  return {
    type: "tracking_plan",
    title: "Tracking & Measurement Framework",
    summary: "Leading indicators prove the engine is being built. Lagging indicators prove it works.",
    items: [
      ...leading.map((i) => ({ ...i, meta: { kind: "leading" } })),
      ...lagging.map((i) => ({ ...i, meta: { kind: "lagging" } })),
    ],
    warnings: warnings.length ? warnings : undefined,
  };
}

function sectionClientInputs(questions: ClientQuestion[]): BlueprintSection {
  return {
    type: "client_inputs",
    title: "Client Inputs Needed",
    summary: "Confirmations and access required from the client to sharpen the plan.",
    items: questions.map((q) => ({
      title: q.question,
      detail: q.why,
      meta: { category: q.category, required: q.required },
    })),
  };
}

function sectionRisksAssumptions(assumptions: BlueprintAssumption[]): BlueprintSection {
  return {
    type: "risks_assumptions",
    title: "Risks & Assumptions",
    summary: "What this plan depends on and where it can go wrong.",
    items: assumptions.map((a) => ({ title: a.label, detail: a.detail })),
  };
}

function sectionNextActions(actions: NextAction[]): BlueprintSection {
  return {
    type: "next_actions",
    title: "Next Actions",
    summary:
      actions.length === 0
        ? "No first-30-days items yet — masterplan needs Phase 1 population."
        : `${actions.length} action${actions.length === 1 ? "" : "s"} ready for execution.`,
    items: actions.map((a) => ({
      title: a.title,
      detail: a.why,
      meta: { type: a.type, sourceMasterplanItemId: a.sourceMasterplanItemId },
    })),
  };
}

// ---------------------------------------------------------------------------
// Lead Engine Map
// ---------------------------------------------------------------------------

function buildLeadEngineMap(input: GenerateBlueprintInput): LeadEngineMap {
  const pages = input.pageIntelligence;
  const trafficSources: LeadEngineNode[] = [
    {
      name: "Organic search",
      detail: "Service and location pages indexed by Google.",
      status: pages.length > 0 ? "active" : "planned",
    },
    {
      name: "Google Business Profile",
      detail: input.gbpData?.connected ? "Connected and feeding local pack." : "Not yet verified.",
      status: input.gbpData?.connected ? "active" : input.gbpData ? "planned" : "unknown",
    },
    {
      name: "Direct + referral",
      detail: "Word of mouth, existing clients, partnerships.",
      status: "active",
    },
  ];

  const landingAssets: LeadEngineNode[] = pages.slice(0, 8).map((p) => ({
    name: p.title || p.url || "Page",
    detail: p.role ?? undefined,
    status: p.hasCta ? "active" : "planned",
  }));
  if (landingAssets.length === 0) {
    landingAssets.push({
      name: "Service + location pages",
      detail: "To be inventoried via page intelligence.",
      status: "missing",
    });
  }

  const conversionPaths: LeadEngineNode[] = [
    { name: "Contact form", detail: "Primary form on service pages.", status: "planned" },
    { name: "Click-to-call", detail: "Mobile-first phone CTA.", status: "planned" },
    {
      name: "Quote / estimate request",
      detail: "Higher-intent conversion path.",
      status: "planned",
    },
  ];

  const trustBuilders: LeadEngineNode[] = [];
  const proof = input.businessProfile?.proofPoints ?? [];
  if (proof.length) {
    proof.slice(0, 5).forEach((p) =>
      trustBuilders.push({ name: p, status: "active" }),
    );
  } else {
    trustBuilders.push({
      name: "Reviews + ratings",
      detail: "GBP + on-site testimonials.",
      status: input.gbpData?.reviewsCount ? "active" : "missing",
    });
    trustBuilders.push({
      name: "Licensing / certifications",
      detail: "Display on every service page.",
      status: input.businessProfile?.licenses?.length ? "active" : "missing",
    });
  }

  const measurementLayer: LeadEngineNode[] = [
    {
      name: "Analytics",
      detail: "Site analytics with conversion events.",
      status: input.trackingData?.hasAnalytics ? "active" : "missing",
    },
    {
      name: "Call tracking",
      detail: "Track inbound calls per source.",
      status: input.trackingData?.hasCallTracking ? "active" : "missing",
    },
    {
      name: "Form tracking",
      detail: "Server-confirmed lead submissions.",
      status: input.trackingData?.hasFormTracking ? "active" : "missing",
    },
    {
      name: "Ranking baseline",
      detail: "Established in Ticket 6.",
      status: input.rankingData ? "active" : "planned",
    },
  ];

  return { trafficSources, landingAssets, conversionPaths, trustBuilders, measurementLayer };
}

// ---------------------------------------------------------------------------
// Assumptions, questions, next actions
// ---------------------------------------------------------------------------

function buildAssumptions(input: GenerateBlueprintInput, scores: BlueprintScores): BlueprintAssumption[] {
  const a: BlueprintAssumption[] = [
    {
      label: "No guaranteed rankings or leads",
      detail: "Search engines and ad platforms do not offer guarantees. Projections are scenario-based.",
    },
    {
      label: "Scenario model is not revenue",
      detail: "Conservative / expected / aggressive scenarios depend on inputs that may change.",
    },
  ];
  if (input.growthGoal.closeRate == null) {
    a.push({
      label: "Close rate is an estimate",
      detail: "Confirm with client. Until then a 20% placeholder is used in scoring.",
    });
  }
  if (!input.businessProfile?.proofPoints?.length) {
    a.push({
      label: "Proof gap limits claims",
      detail: "Without verified reviews / licensing, content cannot make strong credibility claims.",
    });
  }
  if (!input.marketData) {
    a.push({
      label: "Market data pending",
      detail: "Demand sizing will be replaced by real data once Ticket 3 (DataForSEO) is live.",
    });
  }
  if (!input.competitorData) {
    a.push({
      label: "Competitor data pending",
      detail: "Comparative scoring will sharpen once Ticket 4 (Competitive Intelligence) is live.",
    });
  }
  if (!input.trackingData?.hasAnalytics) {
    a.push({
      label: "Tracking must be validated",
      detail: "Until conversion tracking is verified, results cannot be attributed reliably.",
    });
  }
  return a;
}

function buildClientQuestions(input: GenerateBlueprintInput): ClientQuestion[] {
  const q: ClientQuestion[] = [];
  if (input.growthGoal.closeRate == null) {
    q.push({
      id: "close_rate",
      question: "What close rate do you see on qualified leads today?",
      why: "Drives the financial model and required lead volume.",
      category: "lead_math",
      required: true,
    });
  }
  if (input.growthGoal.leadValue == null) {
    q.push({
      id: "lead_value",
      question: "What is the average revenue per closed client?",
      why: "Anchors conservative / expected / aggressive revenue scenarios.",
      category: "lead_math",
      required: true,
    });
  }
  if (!input.gbpData?.connected) {
    q.push({
      id: "gbp_access",
      question: "Can we get access to your Google Business Profile?",
      why: "GBP is often the largest local lead lever.",
      category: "gbp",
      required: true,
    });
  }
  if (!input.businessProfile?.reviewSummary?.count) {
    q.push({
      id: "reviews",
      question: "Where are your verified reviews currently published?",
      why: "Required before we can cite review counts in copy.",
      category: "proof",
      required: false,
    });
  }
  if (!input.businessProfile?.licenses?.length) {
    q.push({
      id: "licensing",
      question: "Which licenses or certifications can we cite?",
      why: "Needed for credibility on service pages.",
      category: "proof",
      required: false,
    });
  }
  if (!input.businessProfile?.serviceHours) {
    q.push({
      id: "service_hours",
      question: "What are your current service hours?",
      why: "Surfaces emergency availability and influences CTAs.",
      category: "operations",
      required: false,
    });
  }
  if (input.businessProfile?.emergencyAvailable == null) {
    q.push({
      id: "emergency",
      question: "Do you offer 24/7 or emergency service?",
      why: "Emergency intent is a high-converting cluster.",
      category: "operations",
      required: false,
    });
  }
  q.push({
    id: "capacity",
    question: "How many new clients per month can you comfortably serve?",
    why: "Caps the aggressive scenario and prevents over-promising.",
    category: "operations",
    required: false,
  });
  if ((input.growthGoal.serviceFocus?.length ?? 0) === 0) {
    q.push({
      id: "priority_services",
      question: "Which 2–3 services should we prioritize first?",
      why: "Concentrates execution where revenue per lead is highest.",
      category: "services",
      required: true,
    });
  }
  if (!input.trackingData?.hasAnalytics) {
    q.push({
      id: "tracking",
      question: "What tools do you currently use to track leads?",
      why: "Determines whether we install or extend an existing tracking layer.",
      category: "tracking",
      required: true,
    });
  }
  return q;
}

function buildNextActions(input: GenerateBlueprintInput): NextAction[] {
  const phase1 = input.masterplanItems.filter((i) => i.phase === "first_30_days");
  return phase1.slice(0, 8).map((item) => ({
    id: `next-${item.id}`,
    title: item.title,
    why:
      item.rationale ||
      item.description ||
      "First-30-days priority pulled from the masterplan.",
    type: item.type ?? "execution",
    sourceMasterplanItemId: item.id,
  }));
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export function generateLeadEngineBlueprint(
  input: GenerateBlueprintInput,
): LeadEngineBlueprint {
  const language = pickLanguage(input);
  const now = (input.now ?? new Date(0)).toISOString();

  const scoringInputs = toScoringInputs(input);
  const scores = buildScores(scoringInputs);
  const financialModel = buildFinancialModel(input, scoringInputs);
  const dataAvailability = buildDataAvailability(input);
  const leadEngineMap = buildLeadEngineMap(input);
  const assumptions = buildAssumptions(input, scores);
  const clientQuestions = buildClientQuestions(input);
  const nextActions = buildNextActions(input);

  const sections: BlueprintSection[] = [
    sectionGoal(input),
    sectionCurrentSituation(input),
    sectionGrowthGap(input, scores),
    sectionMarketIntelligence(input),
    sectionCompetitivePosition(input),
    sectionPageDiagnostics(input, scores),
    sectionStrategy(),
    sectionRoadmap(input),
    sectionLeadEngineMap(leadEngineMap),
    sectionTrackingPlan(input),
    sectionClientInputs(clientQuestions),
    sectionRisksAssumptions(assumptions),
    sectionNextActions(nextActions),
  ];

  const businessName =
    input.businessProfile?.businessName?.trim() ||
    input.growthGoal.targetType ||
    "your business";
  const engineValue = scores.leadEngineScore.value ?? 0;
  const title = `Lead Engine Blueprint for ${businessName}`;
  const summary = `${scoreLabel(engineValue)} at ${engineValue}/100 across site, pages, plan, profile, and market signals.`;

  const confidenceParts = [
    scores.leadEngineScore.confidence,
    scores.conversionReadinessScore.confidence,
    scores.demandCoverageIndex.confidence,
    scores.growthVelocityModel.confidence,
    scores.financialImpact.confidence,
  ];
  const confidence =
    confidenceParts.reduce((a, b) => a + b, 0) / confidenceParts.length;

  return {
    id: undefined,
    tenantId: input.tenantId,
    masterPlanId: input.masterPlan.id,
    growthGoalId: input.growthGoal.id,
    language,
    title,
    summary,
    status: "draft",
    generatedAt: now,
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    scores,
    sections,
    leadEngineMap,
    financialModel,
    assumptions,
    clientQuestions,
    nextActions,
    dataAvailability,
    confidence: Math.round(confidence * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Dallas regression fixture (development reference, not a test)
// ---------------------------------------------------------------------------

/**
 * Minimal Dallas Comfort Air-shaped input used as a smoke fixture.
 *
 * Expected output highlights:
 *  - title === "Lead Engine Blueprint for Dallas Comfort Air"
 *  - market_intelligence section is placeholder
 *  - competitive_position section is placeholder
 *  - financial model is `available` because closeRate + leadValue are set
 *  - roadmap uses first_30_days / days_31_60 / days_61_90 buckets
 *  - no fabricated search volumes or competitor names appear
 */
export const DALLAS_FIXTURE_INPUT: GenerateBlueprintInput = {
  tenantId: "tenant-dallas",
  growthGoal: {
    id: "goal-dallas",
    targetType: "new clients",
    targetCount: 60,
    currentCount: 12,
    closeRate: 0.3,
    leadValue: 850,
    timeframeMonths: 12,
    serviceFocus: ["Emergency HVAC repair", "AC install", "Furnace repair"],
    locations: ["Dallas", "Irving", "Garland"],
    language: "en",
    hasTracking: false,
  },
  businessProfile: {
    businessName: "Dallas Comfort Air",
    vertical: "HVAC",
    primaryOffer: "Emergency HVAC repair",
    icp: "Homeowners in Dallas metro",
    primaryCta: "Call now",
    proofPoints: ["TACLB Licensed", "20+ years experience"],
    language: "en",
    licenses: ["TACLB"],
    reviewSummary: { count: null, rating: null },
  },
  masterPlan: { id: "mp-dallas", confidence: 0.65, language: "en" },
  masterplanItems: [
    {
      id: "mp-1",
      title: "Rebuild Emergency HVAC Repair Dallas page",
      phase: "first_30_days",
      type: "page",
      service: "Emergency HVAC repair",
      location: "Dallas",
      rationale: "Highest-intent service in the priority city.",
    },
    {
      id: "mp-2",
      title: "Install conversion tracking baseline",
      phase: "first_30_days",
      type: "tracking",
      rationale: "Without tracking the engine cannot be measured.",
    },
    {
      id: "mp-3",
      title: "Launch Irving location page",
      phase: "days_31_60",
      type: "page",
      service: "AC install",
      location: "Irving",
    },
    {
      id: "mp-4",
      title: "Garland service area expansion",
      phase: "days_61_90",
      type: "page",
      service: "Furnace repair",
      location: "Garland",
    },
  ],
  pageIntelligence: [
    {
      url: "https://example.com/emergency-hvac-dallas",
      title: "Emergency HVAC Dallas",
      role: "Service page — Dallas",
      hasCta: true,
      hasTrustSignals: false,
      isThin: false,
      issues: ["Missing license badge"],
      recommendation: "Add license badge + review block above the fold.",
    },
    {
      url: "https://example.com/ac-install",
      title: "AC Install",
      role: "Service page",
      hasCta: false,
      hasTrustSignals: false,
      isThin: true,
      recommendation: "Rebuild with full service detail + CTA.",
    },
  ],
  auditSummary: {
    overallScore: 62,
    crawledPages: 24,
    issueCounts: { critical: 1, high: 3, medium: 8 },
  },
  // No marketData → placeholder section.
  // No competitorData → placeholder section.
  // No gbpData → placeholder / missing.
  trackingData: { hasAnalytics: false },
  now: new Date("2026-01-01T00:00:00Z"),
};
