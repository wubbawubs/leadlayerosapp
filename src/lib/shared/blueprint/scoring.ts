/**
 * Lead Engine Blueprint — Scoring Framework (Ticket 1a).
 *
 * Pure functions only. No I/O, no DB, no API calls, no randomness.
 * Same inputs → same outputs.
 *
 * Every score object carries a `reasoning` array containing BOTH
 * affirmative signals (positive context) and negative factors
 * (penalties / missing data), so the Blueprint and Masterplan can
 * explain themselves without re-deriving the math.
 *
 * Inputs are intentionally loose (Partial<…> / structural) so callers
 * can pass placeholder/partial data while later intelligence modules
 * (Market, Competitive, GBP, Ranking) are still being built. Missing
 * data degrades the score — it never throws.
 *
 * Version: 1.0.0
 *
 * See: docs/LEAD_ENGINE_BLUEPRINT_ROADMAP.md §5
 */

export const SCORING_FRAMEWORK_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Input contracts
// ---------------------------------------------------------------------------

export interface AuditSummary {
  /** Overall site/audit health 0..100 if available. */
  overallScore?: number | null;
  /** Counts by severity from the most recent audit. */
  issueCounts?: {
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
  };
  /** Crawled URL count, used as coverage proxy. */
  crawledPages?: number | null;
}

export interface PageIntelligenceSummary {
  /** Number of pages with a clear primary CTA. */
  pagesWithCta?: number;
  /** Total analyzed pages. */
  totalPages?: number;
  /** Pages flagged as thin / low-intent. */
  thinPages?: number;
  /** Pages with structured trust signals (reviews, certs, proof). */
  pagesWithTrust?: number;
}

export interface MasterplanSummary {
  /** Total masterplan items. */
  itemCount?: number;
  /** Items in first_30_days phase. */
  firstPhaseCount?: number;
  /** Overall masterplan confidence (0..1). */
  confidence?: number | null;
  /** Specific services explicitly prioritized by the goal. */
  prioritizedServices?: string[];
  /** Specific locations explicitly prioritized by the goal. */
  prioritizedLocations?: string[];
}

export interface BusinessProfileSummary {
  hasVertical?: boolean;
  hasPrimaryOffer?: boolean;
  hasIcp?: boolean;
  hasPrimaryCta?: boolean;
  hasProofPoints?: boolean;
  /** Operator confidence on the BP itself (0..10). */
  confidence?: number | null;
}

export interface GoalSummary {
  targetType?: string | null;
  targetCount?: number | null;
  currentCount?: number | null;
  closeRate?: number | null;
  leadValue?: number | null;
  timeframeMonths?: number | null;
  serviceFocusCount?: number;
  locationCount?: number;
  hasTracking?: boolean;
}

export interface MarketDataPlaceholder {
  /** Estimated addressable monthly search demand across target services × locations. */
  totalAddressableVolume?: number | null;
  /** Demand currently captured (organic + GBP impressions, etc). */
  capturedVolume?: number | null;
  /** Number of demand clusters identified. */
  clusterCount?: number;
  /** Number of clusters where the business currently ranks in top 10. */
  clustersCovered?: number;
}

export interface ScoringInputs {
  audit?: AuditSummary;
  pageIntelligence?: PageIntelligenceSummary;
  masterplan?: MasterplanSummary;
  businessProfile?: BusinessProfileSummary;
  goal?: GoalSummary;
  /** Optional. Manual/placeholder until Ticket 3 (DataForSEO) lands. */
  marketData?: MarketDataPlaceholder;
}

// ---------------------------------------------------------------------------
// Output contracts
// ---------------------------------------------------------------------------

export interface ScoreReason {
  kind: "affirmative" | "penalty" | "info";
  message: string;
  /** Optional delta this reason applied to the score, for transparency. */
  delta?: number;
}

export interface BaseScore {
  /** 0..100 normalized. */
  score: number;
  /** Confidence in the score given the data quality (0..1). */
  confidence: number;
  /** Affirmative + negative + info reasons (always populated). */
  reasoning: ScoreReason[];
  /** Framework version that produced this score. */
  version: string;
}

export interface LeadEngineScore extends BaseScore {
  components: {
    site: number;
    pages: number;
    plan: number;
    profile: number;
    market: number;
  };
}

export interface ConversionReadinessScore extends BaseScore {
  pagesEvaluated: number;
  pagesWithCta: number;
  pagesWithTrust: number;
  thinPages: number;
}

export interface DemandCoverageIndex extends BaseScore {
  totalAddressableVolume: number | null;
  capturedVolume: number | null;
  clustersCovered: number;
  clusterCount: number;
  /** True when no real market data was supplied. */
  isPlaceholder: boolean;
}

export interface GrowthVelocityModel {
  version: string;
  confidence: number;
  reasoning: ScoreReason[];
  /** Index 0 = month 1. Each entry is projected new leads that month. */
  monthlyLeads: number[];
  /** Cumulative leads at the end of each month. */
  cumulativeLeads: number[];
  /** Baseline monthly leads used as the start point. */
  baselineMonthly: number;
  /** Assumed compounding growth rate per month (e.g. 0.07 = 7%). */
  monthlyGrowthRate: number;
  /** Horizon length (months). */
  horizonMonths: number;
}

export interface FinancialScenario {
  label: "low" | "mid" | "high";
  monthlyLeads: number;
  monthlyClients: number;
  monthlyRevenue: number;
  annualRevenue: number;
  /** Percentage of the lead gap this scenario closes (0..1). */
  gapClosureRate: number;
}

export interface FinancialImpactScenarios {
  version: string;
  confidence: number;
  reasoning: ScoreReason[];
  scenarios: FinancialScenario[];
  /** Echo the inputs we used so the Blueprint can show its working. */
  assumptions: {
    closeRate: number | null;
    leadValue: number | null;
    targetLeadsPerMonth: number | null;
    currentLeadsPerMonth: number | null;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp(n: number, lo = 0, hi = 100): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function round(n: number, decimals = 0): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function avg(parts: number[]): number {
  if (parts.length === 0) return 0;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function pct(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return clamp((part / whole) * 100);
}

// ---------------------------------------------------------------------------
// 1. Lead Engine Score (overall composite, 0..100)
// ---------------------------------------------------------------------------

export function calculateLeadEngineScore(inputs: ScoringInputs): LeadEngineScore {
  const reasoning: ScoreReason[] = [];

  // --- Site component (from audit) ---
  let site = 50;
  const audit = inputs.audit;
  if (audit?.overallScore != null && Number.isFinite(audit.overallScore)) {
    site = clamp(Number(audit.overallScore));
    reasoning.push({
      kind: "affirmative",
      message: `Site audit score available: ${round(site)}/100.`,
    });
  } else {
    reasoning.push({
      kind: "penalty",
      message: "No audit score available — site component defaulted to 50.",
      delta: -10,
    });
  }
  const critical = audit?.issueCounts?.critical ?? 0;
  const high = audit?.issueCounts?.high ?? 0;
  if (critical > 0) {
    const penalty = Math.min(20, critical * 5);
    site = clamp(site - penalty);
    reasoning.push({
      kind: "penalty",
      message: `${critical} critical audit issue${critical === 1 ? "" : "s"} reducing site score.`,
      delta: -penalty,
    });
  }
  if (high > 0) {
    const penalty = Math.min(10, high * 2);
    site = clamp(site - penalty);
    reasoning.push({
      kind: "penalty",
      message: `${high} high-severity audit issue${high === 1 ? "" : "s"} reducing site score.`,
      delta: -penalty,
    });
  }

  // --- Pages component (from page intelligence) ---
  const pi = inputs.pageIntelligence;
  const totalPages = pi?.totalPages ?? 0;
  let pages = 50;
  if (totalPages > 0) {
    const ctaShare = pct(pi?.pagesWithCta ?? 0, totalPages);
    const trustShare = pct(pi?.pagesWithTrust ?? 0, totalPages);
    const thinShare = pct(pi?.thinPages ?? 0, totalPages);
    pages = clamp(ctaShare * 0.5 + trustShare * 0.5 - thinShare * 0.25);
    reasoning.push({
      kind: "affirmative",
      message: `Page intelligence covers ${totalPages} pages (CTA: ${round(ctaShare)}%, trust: ${round(trustShare)}%, thin: ${round(thinShare)}%).`,
    });
  } else {
    reasoning.push({
      kind: "penalty",
      message: "No page intelligence yet — pages component defaulted to 50.",
      delta: -10,
    });
  }

  // --- Plan component (from masterplan) ---
  const mp = inputs.masterplan;
  let plan = 50;
  if (mp?.itemCount != null && mp.itemCount > 0) {
    const planConf = clamp((mp.confidence ?? 0.5) * 100);
    const phaseBonus = (mp.firstPhaseCount ?? 0) > 0 ? 10 : 0;
    plan = clamp(planConf + phaseBonus);
    reasoning.push({
      kind: "affirmative",
      message: `Masterplan has ${mp.itemCount} item${mp.itemCount === 1 ? "" : "s"} with confidence ${round(planConf)}/100.`,
    });
  } else {
    reasoning.push({
      kind: "penalty",
      message: "No masterplan items yet — plan component defaulted to 50.",
      delta: -15,
    });
  }

  // --- Profile component (from business profile) ---
  const bp = inputs.businessProfile;
  let profile = 0;
  const profileSignals: Array<[boolean | undefined, string, number]> = [
    [bp?.hasVertical, "vertical defined", 20],
    [bp?.hasPrimaryOffer, "primary offer defined", 20],
    [bp?.hasIcp, "ICP defined", 20],
    [bp?.hasPrimaryCta, "primary CTA defined", 20],
    [bp?.hasProofPoints, "proof points captured", 20],
  ];
  for (const [present, label, weight] of profileSignals) {
    if (present) {
      profile += weight;
      reasoning.push({ kind: "affirmative", message: `Business profile: ${label}.` });
    } else {
      reasoning.push({
        kind: "penalty",
        message: `Business profile missing: ${label}.`,
        delta: -weight / 2,
      });
    }
  }
  profile = clamp(profile);

  // --- Market component (placeholder-aware) ---
  const market = calculateDemandCoverageIndex(inputs).score;
  if (!inputs.marketData) {
    reasoning.push({
      kind: "info",
      message:
        "Market intelligence is a placeholder — score will sharpen once Ticket 3 (DataForSEO) lands.",
    });
  }

  // --- Composite ---
  const components = {
    site: round(site),
    pages: round(pages),
    plan: round(plan),
    profile: round(profile),
    market: round(market),
  };
  // Weighted: site 0.20, pages 0.20, plan 0.20, profile 0.15, market 0.25
  const weighted =
    components.site * 0.2 +
    components.pages * 0.2 +
    components.plan * 0.2 +
    components.profile * 0.15 +
    components.market * 0.25;
  const score = round(clamp(weighted));

  const confidence = computeInputConfidence(inputs);

  return {
    score,
    components,
    confidence,
    reasoning,
    version: SCORING_FRAMEWORK_VERSION,
  };
}

// ---------------------------------------------------------------------------
// 2. Conversion Readiness Score (0..100)
// ---------------------------------------------------------------------------

export function calculateConversionReadinessScore(
  inputs: ScoringInputs,
): ConversionReadinessScore {
  const reasoning: ScoreReason[] = [];
  const pi = inputs.pageIntelligence;
  const totalPages = pi?.totalPages ?? 0;
  const pagesWithCta = pi?.pagesWithCta ?? 0;
  const pagesWithTrust = pi?.pagesWithTrust ?? 0;
  const thinPages = pi?.thinPages ?? 0;

  if (totalPages === 0) {
    reasoning.push({
      kind: "penalty",
      message: "No pages have been analyzed yet — readiness defaulted to 0.",
    });
    return {
      score: 0,
      confidence: 0.1,
      reasoning,
      version: SCORING_FRAMEWORK_VERSION,
      pagesEvaluated: 0,
      pagesWithCta: 0,
      pagesWithTrust: 0,
      thinPages: 0,
    };
  }

  const ctaShare = pct(pagesWithCta, totalPages);
  const trustShare = pct(pagesWithTrust, totalPages);
  const thinShare = pct(thinPages, totalPages);

  // Weighted: CTA 50%, trust 35%, thin pages penalty 15%
  const raw = ctaShare * 0.5 + trustShare * 0.35 - thinShare * 0.15;
  const score = round(clamp(raw));

  reasoning.push({
    kind: ctaShare >= 70 ? "affirmative" : "penalty",
    message: `${round(ctaShare)}% of pages have a clear primary CTA.`,
    delta: ctaShare >= 70 ? undefined : -(70 - ctaShare) * 0.5,
  });
  reasoning.push({
    kind: trustShare >= 50 ? "affirmative" : "penalty",
    message: `${round(trustShare)}% of pages carry structured trust signals.`,
    delta: trustShare >= 50 ? undefined : -(50 - trustShare) * 0.35,
  });
  if (thinShare > 0) {
    reasoning.push({
      kind: "penalty",
      message: `${round(thinShare)}% of pages are thin / low-intent.`,
      delta: -thinShare * 0.15,
    });
  }
  // Goal-level CTA hint
  if (inputs.businessProfile?.hasPrimaryCta) {
    reasoning.push({
      kind: "affirmative",
      message: "Business profile declares a primary CTA — pages can be aligned to it.",
    });
  } else {
    reasoning.push({
      kind: "penalty",
      message: "No primary CTA declared in business profile — page CTAs may be inconsistent.",
      delta: -5,
    });
  }

  return {
    score,
    confidence: clamp01(totalPages >= 5 ? 0.8 : 0.4 + totalPages * 0.08),
    reasoning,
    version: SCORING_FRAMEWORK_VERSION,
    pagesEvaluated: totalPages,
    pagesWithCta,
    pagesWithTrust,
    thinPages,
  };
}

// ---------------------------------------------------------------------------
// 3. Demand Coverage Index (0..100)
// ---------------------------------------------------------------------------

export function calculateDemandCoverageIndex(inputs: ScoringInputs): DemandCoverageIndex {
  const reasoning: ScoreReason[] = [];
  const md = inputs.marketData;
  const hasReal =
    !!md &&
    (md.totalAddressableVolume != null ||
      md.capturedVolume != null ||
      (md.clusterCount ?? 0) > 0);

  if (!hasReal) {
    // Proxy: derive a soft coverage estimate from masterplan + goal coverage.
    const services = inputs.masterplan?.prioritizedServices?.length ?? 0;
    const locations = inputs.masterplan?.prioritizedLocations?.length ?? 0;
    const declaredServices = inputs.goal?.serviceFocusCount ?? services;
    const declaredLocations = inputs.goal?.locationCount ?? locations;

    const serviceCoverage =
      declaredServices > 0 ? pct(services, declaredServices) : 0;
    const locationCoverage =
      declaredLocations > 0 ? pct(locations, declaredLocations) : 0;

    const score = round(clamp(avg([serviceCoverage, locationCoverage]) * 0.6));
    reasoning.push({
      kind: "info",
      message:
        "Market intelligence pending — index uses a soft proxy from masterplan service/location coverage.",
    });
    if (services > 0 || locations > 0) {
      reasoning.push({
        kind: "affirmative",
        message: `Masterplan addresses ${services} service${services === 1 ? "" : "s"} × ${locations} location${locations === 1 ? "" : "s"}.`,
      });
    }
    return {
      score,
      confidence: 0.25,
      reasoning,
      version: SCORING_FRAMEWORK_VERSION,
      totalAddressableVolume: null,
      capturedVolume: null,
      clustersCovered: 0,
      clusterCount: 0,
      isPlaceholder: true,
    };
  }

  const total = md.totalAddressableVolume ?? null;
  const captured = md.capturedVolume ?? null;
  const clusterCount = md.clusterCount ?? 0;
  const clustersCovered = md.clustersCovered ?? 0;

  const volumeCoverage = total && captured ? pct(captured, total) : 0;
  const clusterCoverage = clusterCount > 0 ? pct(clustersCovered, clusterCount) : 0;

  const score = round(clamp(avg([volumeCoverage, clusterCoverage].filter((n) => n > 0))));

  if (total && captured) {
    reasoning.push({
      kind: "affirmative",
      message: `Capturing ${captured.toLocaleString()} of ${total.toLocaleString()} addressable monthly searches (${round(volumeCoverage)}%).`,
    });
  }
  if (clusterCount > 0) {
    reasoning.push({
      kind: clusterCoverage >= 50 ? "affirmative" : "penalty",
      message: `Ranking in ${clustersCovered}/${clusterCount} demand clusters (${round(clusterCoverage)}%).`,
    });
  }

  return {
    score,
    confidence: 0.7,
    reasoning,
    version: SCORING_FRAMEWORK_VERSION,
    totalAddressableVolume: total,
    capturedVolume: captured,
    clustersCovered,
    clusterCount,
    isPlaceholder: false,
  };
}

// ---------------------------------------------------------------------------
// 4. Growth Velocity Model (12-month projection)
// ---------------------------------------------------------------------------

export function calculateGrowthVelocityModel(inputs: ScoringInputs): GrowthVelocityModel {
  const reasoning: ScoreReason[] = [];
  const goal = inputs.goal;
  const horizonMonths = clampInt(goal?.timeframeMonths ?? 12, 1, 24);

  // Baseline: current monthly leads from goal, falling back to 0.
  const currentTotal = numericOrNull(goal?.currentCount);
  const baselineMonthly =
    currentTotal != null
      ? Math.max(0, round(currentTotal / Math.max(1, horizonMonths), 2))
      : 0;

  // Choose a monthly growth rate from masterplan + readiness signals.
  const mpConfidence = inputs.masterplan?.confidence ?? 0.5;
  const firstPhaseCount = inputs.masterplan?.firstPhaseCount ?? 0;
  const engineScore = calculateLeadEngineScore(inputs).score;

  // 3%–12% monthly compounding range based on engine health.
  const normalizedEngine = clamp01(engineScore / 100);
  let monthlyGrowthRate = 0.03 + normalizedEngine * 0.09;
  if (mpConfidence < 0.4) {
    monthlyGrowthRate -= 0.01;
    reasoning.push({
      kind: "penalty",
      message: "Masterplan confidence is low — projected growth rate reduced.",
      delta: -0.01,
    });
  }
  if (firstPhaseCount === 0) {
    monthlyGrowthRate = Math.max(0.01, monthlyGrowthRate - 0.02);
    reasoning.push({
      kind: "penalty",
      message: "No first-30-days items — early-month velocity dampened.",
      delta: -0.02,
    });
  }
  if (baselineMonthly === 0) {
    reasoning.push({
      kind: "penalty",
      message: "No baseline current lead volume — projection starts from a cold start of 1/mo.",
    });
  } else {
    reasoning.push({
      kind: "affirmative",
      message: `Baseline of ${baselineMonthly} leads/month derived from current goal counts.`,
    });
  }
  reasoning.push({
    kind: "info",
    message: `Projected monthly growth rate: ${(monthlyGrowthRate * 100).toFixed(1)}%.`,
  });

  const monthlyLeads: number[] = [];
  const cumulativeLeads: number[] = [];
  let cumulative = 0;
  const start = baselineMonthly || 1;
  for (let i = 0; i < horizonMonths; i++) {
    const m = round(start * Math.pow(1 + monthlyGrowthRate, i), 2);
    monthlyLeads.push(m);
    cumulative = round(cumulative + m, 2);
    cumulativeLeads.push(cumulative);
  }

  return {
    version: SCORING_FRAMEWORK_VERSION,
    confidence: clamp01(0.3 + normalizedEngine * 0.5 + (mpConfidence ?? 0) * 0.2),
    reasoning,
    monthlyLeads,
    cumulativeLeads,
    baselineMonthly,
    monthlyGrowthRate: round(monthlyGrowthRate, 4),
    horizonMonths,
  };
}

// ---------------------------------------------------------------------------
// 5. Financial Impact Scenarios (low / mid / high)
// ---------------------------------------------------------------------------

export function calculateFinancialImpactScenarios(
  inputs: ScoringInputs,
): FinancialImpactScenarios {
  const reasoning: ScoreReason[] = [];
  const goal = inputs.goal;
  const closeRate = numericOrNull(goal?.closeRate);
  const leadValue = numericOrNull(goal?.leadValue);

  // Goal math convention (Ticket 4c):
  //   `targetCount` represents the MONTHLY target. The growth-goal form labels
  //   it "Target per maand"; masterplan and reporting both treat it that way.
  //   Required leads/month = monthlyTarget / closeRate.
  //   `currentCount` is current MONTHLY volume (leads or clients depending on
  //   targetType; we treat it as monthly volume of the same unit).
  const monthlyTarget = numericOrNull(goal?.targetCount);
  const targetLeadsPerMonth =
    monthlyTarget != null && closeRate && closeRate > 0
      ? Math.ceil(monthlyTarget / closeRate)
      : null;
  const currentLeadsPerMonth =
    numericOrNull(goal?.currentCount) != null
      ? Math.max(0, round(goal!.currentCount as number, 2))
      : null;

  if (closeRate == null) {
    reasoning.push({
      kind: "penalty",
      message: "Close rate missing — scenarios use a conservative 20% default.",
    });
  } else {
    reasoning.push({
      kind: "affirmative",
      message: `Using close rate of ${round((closeRate ?? 0) * 100)}%.`,
    });
  }
  if (leadValue == null) {
    reasoning.push({
      kind: "penalty",
      message: "Lead value missing — revenue projection limited to lead/client counts.",
    });
  } else {
    reasoning.push({
      kind: "affirmative",
      message: `Using lead value of ${round(leadValue)}.`,
    });
  }
  if (currentLeadsPerMonth == null) {
    reasoning.push({
      kind: "info",
      message:
        "Current monthly lead baseline is unknown — scenarios model progress toward the full target gap.",
    });
  }

  const effectiveCloseRate = closeRate ?? 0.2;
  const effectiveLeadValue = leadValue ?? 0;

  // Gap = how many extra leads/month we need to hit target. When baseline is
  // unknown, treat the entire target as the gap so scenarios remain
  // target-aligned instead of starting cold from 0/1.
  const baselineForGap = currentLeadsPerMonth ?? 0;
  const gap =
    targetLeadsPerMonth != null
      ? Math.max(0, targetLeadsPerMonth - baselineForGap)
      : null;

  // Closure rates were 30/60/90 historically. Phase A keeps them but renames
  // semantically to conservative / expected / aggressive in the Blueprint.
  const closureRates: Array<{ label: FinancialScenario["label"]; rate: number }> = [
    { label: "low", rate: 0.25 },
    { label: "mid", rate: 0.6 },
    { label: "high", rate: 1.0 },
  ];

  const scenarios: FinancialScenario[] = closureRates.map(({ label, rate }) => {
    const incrementalLeads = gap != null ? gap * rate : 0;
    const monthlyLeads = baselineForGap + incrementalLeads;
    const monthlyClients = monthlyLeads * effectiveCloseRate;
    const monthlyRevenue = monthlyClients * effectiveLeadValue;
    return {
      label,
      monthlyLeads: round(monthlyLeads, 2),
      monthlyClients: round(monthlyClients, 2),
      monthlyRevenue: round(monthlyRevenue, 2),
      annualRevenue: round(monthlyRevenue * 12, 2),
      gapClosureRate: rate,
    };
  });

  const confidence = clamp01(
    0.2 +
      (closeRate != null ? 0.3 : 0) +
      (leadValue != null ? 0.3 : 0) +
      (gap != null ? 0.2 : 0),
  );

  return {
    version: SCORING_FRAMEWORK_VERSION,
    confidence,
    reasoning,
    scenarios,
    assumptions: {
      closeRate,
      leadValue,
      targetLeadsPerMonth,
      currentLeadsPerMonth,
    },
  };
}


// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function numericOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function computeInputConfidence(inputs: ScoringInputs): number {
  let signals = 0;
  let present = 0;
  const add = (cond: boolean) => {
    signals += 1;
    if (cond) present += 1;
  };
  add(!!inputs.audit?.overallScore);
  add((inputs.pageIntelligence?.totalPages ?? 0) > 0);
  add((inputs.masterplan?.itemCount ?? 0) > 0);
  add(!!inputs.businessProfile?.hasVertical);
  add(!!inputs.businessProfile?.hasPrimaryOffer);
  add(!!inputs.goal?.closeRate);
  add(!!inputs.goal?.leadValue);
  add(!!inputs.marketData);
  return clamp01(present / signals);
}
