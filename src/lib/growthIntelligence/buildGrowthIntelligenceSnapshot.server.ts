/**
 * Growth Intelligence Snapshot — Builder (server-only).
 *
 * Single normalizer that reads every existing intelligence source and
 * returns one `GrowthIntelligenceSnapshot`. No new data producers.
 *
 * Server-only: uses supabaseAdmin. Callers MUST validate tenant membership
 * before invoking.
 *
 * See: docs/GROWTH_INTELLIGENCE_SNAPSHOT.md
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { rowToGrowthGoal } from "@/lib/shared/growthGoals/schemas";
import { summarizeMarketScan } from "@/lib/shared/marketIntelligence/cluster";
import { buildCompetitorMatrixSummary } from "@/lib/shared/competitiveIntelligence/summarize";
import { summarizeGbpProfile } from "@/lib/shared/gbpIntelligence/scoring";
import { rowToGbpProfile } from "@/lib/shared/gbpIntelligence/schemas";

import {
  GROWTH_INTELLIGENCE_SCHEMA_VERSION,
  type BusinessSlice,
  type CompetitorsSlice,
  type DataAvailabilityEntry,
  type GbpSlice,
  type GoalSlice,
  type GrowthIntelligenceSnapshot,
  type MasterplanSlice,
  type MarketSlice,
  type MissingContextItem,
  type ModuleStatus,
  type PagesSlice,
  type RankingSlice,
  type ToneSlice,
  type TrackingSlice,
  type WebsiteSlice,
  type WordpressSlice,
} from "@/lib/shared/growthIntelligence/schemas";
import {
  aggregateConfidence,
  calculateReadinessScore,
  deriveOverallStatus,
} from "@/lib/shared/growthIntelligence/readiness";
import { deriveNextActions } from "@/lib/shared/growthIntelligence/nextBestAction";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

const TEMP_DOMAIN_HINTS = [".lovable.app", ".lovableproject.com", "localhost"];

export interface BuildSnapshotInput {
  tenantId: string;
  growthGoalId?: string | null;
  siteId?: string | null;
}

export async function buildGrowthIntelligenceSnapshot(
  input: BuildSnapshotInput,
): Promise<GrowthIntelligenceSnapshot> {
  const { tenantId } = input;

  const [goal, bpRow, toneRow, siteConnRows, audit, piStats, marketBundle, competitorBundle, gbpProfile, masterplan, wordpressBundle, leadCounts] =
    await Promise.all([
      loadActiveGoal(tenantId, input.growthGoalId ?? null),
      loadBusinessProfile(tenantId),
      loadToneProfile(tenantId),
      loadSiteConnections(tenantId),
      loadLatestAudit(tenantId),
      loadPageIntelligenceStats(tenantId),
      loadLatestMarket(tenantId, input.growthGoalId ?? null),
      loadLatestCompetitor(tenantId, input.growthGoalId ?? null),
      loadLatestGbp(tenantId, input.growthGoalId ?? null),
      loadActiveMasterplan(tenantId),
      loadWordpressReadiness(tenantId),
      loadLeadCounts(tenantId),
    ]);

  // -------- goal slice --------
  const goalSlice = buildGoalSlice(goal);

  // -------- business slice --------
  const businessSlice = buildBusinessSlice(bpRow);

  // -------- tone slice --------
  const toneSlice = buildToneSlice(toneRow);

  // -------- website slice --------
  const websiteSlice = buildWebsiteSlice(siteConnRows, audit);

  // -------- pages slice --------
  const pagesSlice = buildPagesSlice(piStats, !!audit);

  // -------- market slice --------
  const marketSlice = buildMarketSlice(marketBundle);

  // -------- competitor slice --------
  const competitorsSlice = buildCompetitorsSlice(competitorBundle);

  // -------- GBP slice --------
  const gbpSlice = buildGbpSlice(gbpProfile);

  // -------- tracking slice --------
  const trackingSlice = buildTrackingSlice(goal, leadCounts);

  // -------- ranking slice (placeholder) --------
  const rankingSlice: RankingSlice = {
    status: "missing",
    confidence: 0,
    missing: ["ranking_baseline_not_started"],
    clustersTracked: 0,
    rankingBaselineAvailable: false,
  };

  // -------- masterplan slice --------
  const masterplanSlice = buildMasterplanSlice(masterplan);

  // -------- wordpress slice --------
  const wordpressSlice = buildWordpressSlice(wordpressBundle);

  const slices = {
    goal: goalSlice,
    business: businessSlice,
    tone: toneSlice,
    website: websiteSlice,
    pages: pagesSlice,
    market: marketSlice,
    competitors: competitorsSlice,
    gbp: gbpSlice,
    masterplan: masterplanSlice,
    tracking: trackingSlice,
  };
  const readiness = calculateReadinessScore(slices);
  const confidence = aggregateConfidence(slices);
  const { primary, secondary } = deriveNextActions(slices);
  const overall = deriveOverallStatus(readiness.score, slices);

  const dataAvailability = buildAvailabilityMatrix({
    ...slices,
    ranking: rankingSlice,
    wordpress: wordpressSlice,
  });
  const missingContext = buildMissingContext(slices, rankingSlice);
  const warnings = buildWarnings(slices);

  return {
    tenantId,
    siteId: input.siteId ?? null,
    growthGoalId: goal?.id ?? null,
    generatedAt: new Date().toISOString(),
    schemaVersion: GROWTH_INTELLIGENCE_SCHEMA_VERSION,
    status: {
      overall,
      readinessScore: readiness.score,
      confidence,
      nextBestAction: primary,
    },
    goal: goalSlice,
    business: businessSlice,
    tone: toneSlice,
    website: websiteSlice,
    pages: pagesSlice,
    market: marketSlice,
    competitors: competitorsSlice,
    gbp: gbpSlice,
    tracking: trackingSlice,
    ranking: rankingSlice,
    masterplan: masterplanSlice,
    wordpress: wordpressSlice,
    dataAvailability,
    missingContext,
    warnings,
    nextActions: [primary, ...secondary],
  };
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

async function loadActiveGoal(tenantId: string, goalId: string | null) {
  let q = admin.from("growth_goals").select("*").eq("tenant_id", tenantId);
  q = goalId ? q.eq("id", goalId) : q.eq("status", "active");
  const { data: row } = await q.maybeSingle();
  return row ? rowToGrowthGoal(row) : null;
}

async function loadBusinessProfile(tenantId: string) {
  const { data } = await admin
    .from("business_profiles_v2")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data ?? null;
}

async function loadToneProfile(tenantId: string) {
  const { data } = await admin
    .from("tone_profiles")
    .select("id, status, language, locale, profile, confidence_score, analyzed_at, updated_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data ?? null;
}

async function loadSiteConnections(tenantId: string) {
  const { data } = await admin
    .from("site_connections")
    .select("id, type, base_url, status, last_probe_at, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  return (data as Array<Record<string, unknown>>) ?? [];
}

async function loadLatestAudit(tenantId: string) {
  const { data: rows } = await admin
    .from("audits")
    .select("id, status, summary, finished_at, started_at, created_at")
    .eq("tenant_id", tenantId)
    .order("finished_at", { ascending: false, nullsFirst: false })
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(1);
  return (rows?.[0] as Record<string, unknown> | undefined) ?? null;
}

async function loadPageIntelligenceStats(tenantId: string) {
  // Lightweight stats — count + CTA/trust/thin heuristics.
  const { data: rows } = await admin
    .from("page_intelligence")
    .select(
      "id, recommended_cta, intent, commercial_priority, risk_flags, page_type, confidence, analyzed_at",
    )
    .eq("tenant_id", tenantId);
  return (rows as Array<Record<string, unknown>>) ?? [];
}

async function loadLatestMarket(tenantId: string, goalId: string | null) {
  let q = admin
    .from("market_scans")
    .select("*")
    .eq("tenant_id", tenantId)
    .in("status", ["completed", "stale"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (goalId) q = q.eq("growth_goal_id", goalId);
  const { data: rows } = await q;
  const scanRow = rows?.[0];
  if (!scanRow) return null;
  const [kwRes, clRes] = await Promise.all([
    admin.from("market_keywords").select("*").eq("market_scan_id", scanRow.id),
    admin.from("market_demand_clusters").select("*").eq("market_scan_id", scanRow.id),
  ]);
  // Coerce rows -> the lightweight shape `summarizeMarketScan` expects via summary.
  // Easier: persisted summary already lives on scanRow.summary.
  return { scanRow, keywords: kwRes.data ?? [], clusters: clRes.data ?? [] };
}

async function loadLatestCompetitor(tenantId: string, goalId: string | null) {
  let q = admin
    .from("competitor_scans")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (goalId) q = q.eq("growth_goal_id", goalId);
  const { data: rows } = await q;
  const scanRow = rows?.[0];
  if (!scanRow) return null;
  return { scanRow };
}

async function loadLatestGbp(tenantId: string, goalId: string | null) {
  let q = admin
    .from("gbp_profiles")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (goalId) q = q.eq("growth_goal_id", goalId);
  const { data: rows } = await q;
  const row = rows?.[0];
  return row ? rowToGbpProfile(row) : null;
}

async function loadActiveMasterplan(tenantId: string) {
  const { data: planRow } = await admin
    .from("master_plans")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .maybeSingle();
  if (!planRow) return null;
  const { data: items } = await admin
    .from("masterplan_items")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("master_plan_id", planRow.id);
  return {
    plan: planRow as Record<string, unknown>,
    items: (items as Array<Record<string, unknown>>) ?? [],
  };
}

async function loadWordpressReadiness(tenantId: string) {
  const { data: conn } = await admin
    .from("wordpress_connections")
    .select("id, status, kind, base_url, capabilities, last_checked_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conn) return null;

  const [invResult, mappingResult] = await Promise.all([
    admin
      .from("wordpress_site_inventory")
      .select("id", { count: "exact", head: true })
      .eq("wordpress_connection_id", conn.id),
    admin
      .from("wordpress_page_mappings")
      .select("id, mapping_type", { count: "exact" })
      .eq("wordpress_connection_id", conn.id),
  ]);

  const inventoryCount = (invResult.count as number | null) ?? 0;
  const mappings = (mappingResult.data as Array<{ mapping_type: string }> | null) ?? [];
  const missingPageCount = mappings.filter((m) => m.mapping_type === "missing_page").length;
  const lastSyncedRaw = await admin
    .from("wordpress_site_inventory")
    .select("last_synced_at")
    .eq("wordpress_connection_id", conn.id)
    .order("last_synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    conn: conn as Record<string, unknown>,
    inventoryCount,
    mappingCount: mappings.length,
    missingPageCount,
    lastSyncedAt: (lastSyncedRaw.data?.last_synced_at as string | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Slice builders
// ---------------------------------------------------------------------------

function buildGoalSlice(
  goal: ReturnType<typeof rowToGrowthGoal> | null,
): GoalSlice {
  if (!goal) {
    return {
      status: "missing",
      confidence: 0,
      missing: ["goal"],
      targetSummary: null,
      targetType: null,
      targetCount: null,
      timeframeMonths: null,
      closeRate: null,
      leadValue: null,
      requiredLeadsPerMonth: null,
      currentLeadsPerMonth: null,
      serviceFocus: [],
      locations: [],
    };
  }
  const missing: string[] = [];
  if (goal.targetCount == null) missing.push("target_count");
  if (goal.closeRate == null) missing.push("close_rate");
  if (goal.leadValue == null) missing.push("lead_value");
  if (goal.timeframeMonths == null) missing.push("timeframe_months");
  if ((goal.serviceFocus ?? []).length === 0) missing.push("service_focus");
  if ((goal.locations ?? []).length === 0) missing.push("locations");
  const requiredPerMonth =
    goal.requiredLeads != null && goal.timeframeMonths
      ? Math.ceil(goal.requiredLeads / goal.timeframeMonths)
      : null;
  const confidence = Math.max(0, 1 - missing.length / 6);
  const targetSummary =
    goal.targetCount != null
      ? `${goal.targetCount} ${goal.targetType}${goal.timeframeMonths ? ` / ${goal.timeframeMonths} mo` : ""}`
      : null;
  return {
    status: missing.length === 0 ? "available" : missing.length <= 2 ? "partial" : "placeholder",
    confidence,
    missing,
    targetSummary,
    targetType: goal.targetType,
    targetCount: goal.targetCount ?? null,
    timeframeMonths: goal.timeframeMonths ?? null,
    closeRate: goal.closeRate ?? null,
    leadValue: goal.leadValue ?? null,
    requiredLeadsPerMonth: requiredPerMonth,
    currentLeadsPerMonth: goal.currentCount ?? null,
    serviceFocus: goal.serviceFocus ?? [],
    locations: goal.locations ?? [],
  };
}

function buildBusinessSlice(bp: Record<string, unknown> | null): BusinessSlice {
  if (!bp) {
    return {
      status: "missing",
      confidence: 0,
      missing: ["business_profile"],
      businessName: null,
      brandName: null,
      vertical: null,
      primaryOffer: null,
      icpSummary: null,
      services: [],
      locations: [],
      claimGuardrailsPresent: false,
      proofStatus: "missing",
    };
  }
  const identity = (bp.business_identity as Record<string, unknown> | null) ?? {};
  const offer = (bp.offer_profile as Record<string, unknown> | null) ?? {};
  const icp = (bp.icp_profile as Record<string, unknown> | null) ?? {};
  const location = (bp.location_profile as Record<string, unknown> | null) ?? {};
  const proof = (bp.proof_profile as Record<string, unknown> | null) ?? {};
  const guardrails = (bp.claim_guardrails as Record<string, unknown> | null) ?? {};
  const status = String(bp.status ?? "draft");

  const services = [
    ...asStringArray(offer.highValueOffers),
    ...asStringArray(offer.secondaryOffers),
  ];
  const locations = [
    ...asStringArray(location.serviceAreas),
    typeof location.primaryLocation === "string" && location.primaryLocation ? location.primaryLocation : "",
  ].filter(Boolean);
  const missing: string[] = [];
  if (!identity.businessName) missing.push("business_name");
  if (!identity.vertical) missing.push("vertical");
  if (!offer.primaryOffer) missing.push("primary_offer");
  if (asStringArray(icp.bestFitSegments).length === 0 && asStringArray(icp.idealCustomers).length === 0)
    missing.push("icp");
  if (locations.length === 0) missing.push("locations");
  const verifiedProof = asStringArray(proof.verifiedProofPoints);
  const unverifiedProof = asStringArray(proof.unverifiedProofPoints);
  const proofStatus: "missing" | "partial" | "verified" =
    verifiedProof.length > 0
      ? "verified"
      : unverifiedProof.length > 0
        ? "partial"
        : "missing";
  const guardrailsPresent =
    asStringArray(guardrails.allowedClaims).length > 0 ||
    asStringArray(guardrails.forbiddenClaims).length > 0;
  const confidence = Math.max(0, Math.min(1, Number(bp.confidence_score ?? 0) / 10));
  const moduleStatus: ModuleStatus =
    status === "approved" || status === "locked"
      ? "reviewed"
      : status === "review_ready"
        ? "available"
        : missing.length > 3
          ? "placeholder"
          : "partial";
  return {
    status: moduleStatus,
    confidence,
    missing,
    businessName: (identity.businessName as string | null) || null,
    brandName: (identity.brandName as string | null) || null,
    vertical: (identity.vertical as string | null) || null,
    primaryOffer: (offer.primaryOffer as string | null) || null,
    icpSummary:
      asStringArray(icp.bestFitSegments).slice(0, 2).join(", ") ||
      asStringArray(icp.idealCustomers).slice(0, 2).join(", ") ||
      null,
    services: dedupe(services).slice(0, 12),
    locations: dedupe(locations).slice(0, 12),
    claimGuardrailsPresent: guardrailsPresent,
    proofStatus,
  };
}

function buildToneSlice(row: Record<string, unknown> | null): ToneSlice {
  if (!row || !row.profile) {
    return {
      status: "missing",
      confidence: 0,
      missing: ["tone_profile"],
      summary: null,
      language: null,
      country: null,
      commercialIntensity: null,
      preferredWordsCount: 0,
      forbiddenWordsCount: 0,
    };
  }
  const profile = row.profile as Record<string, unknown>;
  const voice = (profile.voiceIdentity as Record<string, unknown> | null) ?? {};
  const vocab = (profile.vocabulary as Record<string, unknown> | null) ?? {};
  const locale = (profile.localeTone as Record<string, unknown> | null) ?? {};
  const status = String(row.status ?? "draft");
  const summary = (voice.summary as string | null) || null;
  const isAnalyzed = !!summary && !/nog niet geanalyseerd/i.test(summary);
  const confidence = Math.max(0, Math.min(1, Number(row.confidence_score ?? 0) / 10));
  const intensity = (voice.commercialIntensity as string | null) || null;
  const intensityTyped: ToneSlice["commercialIntensity"] =
    intensity === "low" || intensity === "medium" || intensity === "high" ? intensity : null;
  const moduleStatus: ModuleStatus = !isAnalyzed
    ? "placeholder"
    : status === "approved" || status === "locked"
      ? "reviewed"
      : "available";
  const localeCode = ((locale.locale as string | null) ?? (row.locale as string | null)) || null;
  const country = localeCode ? localeCode.split(/[-_]/)[1] ?? null : null;
  return {
    status: moduleStatus,
    confidence,
    missing: isAnalyzed ? [] : ["tone_analysis"],
    summary,
    language: (row.language as string | null) || null,
    country,
    commercialIntensity: intensityTyped,
    preferredWordsCount: asStringArray(vocab.preferred).length,
    forbiddenWordsCount: asStringArray(vocab.forbidden).length,
  };
}

function buildWebsiteSlice(
  conns: Array<Record<string, unknown>>,
  audit: Record<string, unknown> | null,
): WebsiteSlice {
  const conn = conns[0];
  const baseUrl = (conn?.base_url as string | null) ?? null;
  const domain = baseUrl ? hostnameOf(baseUrl) : null;
  const isTemp = !!domain && TEMP_DOMAIN_HINTS.some((h) => domain.includes(h));
  const auditSummary =
    audit && typeof audit.summary === "object" && audit.summary
      ? (audit.summary as Record<string, unknown>)
      : null;
  const auditScore =
    auditSummary && typeof auditSummary.overallScore === "number"
      ? (auditSummary.overallScore as number)
      : null;
  const pagesCrawled =
    auditSummary && typeof auditSummary.crawledPages === "number"
      ? (auditSummary.crawledPages as number)
      : null;
  const missing: string[] = [];
  if (!conn) missing.push("site_connection");
  if (!audit) missing.push("audit");
  if (isTemp) missing.push("permanent_domain");

  let status: ModuleStatus = "missing";
  if (audit) status = auditSummary ? "available" : "partial";
  else if (conn) status = "partial";
  let confidence = 0;
  if (audit) confidence = isTemp ? 0.5 : 0.85;
  else if (conn) confidence = 0.3;
  return {
    status,
    confidence,
    missing,
    siteUrl: baseUrl,
    connectedDomain: domain,
    isTemporaryDomain: isTemp,
    latestAuditId: (audit?.id as string | null) ?? null,
    auditStatus: (audit?.status as string | null) ?? null,
    auditScore,
    pagesCrawled,
    siteAuditAvailable: !!audit,
  };
}

function buildPagesSlice(
  rows: Array<Record<string, unknown>>,
  hasAudit: boolean,
): PagesSlice {
  const pagesAnalyzed = rows.length;
  if (pagesAnalyzed === 0) {
    return {
      status: hasAudit ? "placeholder" : "missing",
      confidence: 0,
      missing: ["page_intelligence"],
      pagesAnalyzed: 0,
      keyPagesCount: 0,
      averageConversionReadiness: null,
      thinPagesCount: 0,
      pagesWithCta: 0,
      pagesWithTrust: 0,
    };
  }
  let pagesWithCta = 0;
  let pagesWithTrust = 0;
  let keyPages = 0;
  let thin = 0;
  let confSum = 0;
  for (const r of rows) {
    const cta = r.recommended_cta;
    const intent = String(r.intent ?? "");
    if (typeof cta === "string" && cta.trim() || intent === "commercial" || intent === "transactional")
      pagesWithCta++;
    const risks = asStringArray(r.risk_flags);
    if (risks.length === 0) pagesWithTrust++;
    const prio = String(r.commercial_priority ?? "").toLowerCase();
    if (prio === "critical" || prio === "high") keyPages++;
    const pageType = String(r.page_type ?? "").toLowerCase();
    if (pageType === "other" || pageType === "") thin++;
    confSum += typeof r.confidence === "number" ? r.confidence : 0;
  }
  const confidence = pagesAnalyzed ? confSum / pagesAnalyzed : 0;
  const avgReadiness = null; // detailed readiness requires the page-diagnostics fetcher; left null in V1.
  return {
    status: pagesAnalyzed >= 3 ? "available" : "partial",
    confidence: Math.max(0, Math.min(1, confidence)),
    missing: [],
    pagesAnalyzed,
    keyPagesCount: keyPages,
    averageConversionReadiness: avgReadiness,
    thinPagesCount: thin,
    pagesWithCta,
    pagesWithTrust,
  };
}

function buildMarketSlice(
  bundle: {
    scanRow: Record<string, unknown>;
    keywords: Array<Record<string, unknown>>;
    clusters: Array<Record<string, unknown>>;
  } | null,
): MarketSlice {
  if (!bundle) {
    return {
      status: "missing",
      confidence: 0,
      missing: ["market_scan"],
      source: null,
      scanCompletedAt: null,
      localClustersCount: 0,
      localDemandVolume: null,
      genericReferenceDemandVolume: null,
      topService: null,
      topLocation: null,
      volumeCoveragePercent: null,
    };
  }
  // Prefer persisted summary; fall back to recompute.
  const persisted = (bundle.scanRow.summary as Record<string, unknown> | null) ?? null;
  let summary: ReturnType<typeof summarizeMarketScan> | null = null;
  if (persisted && (persisted as { available?: boolean }).available !== undefined) {
    summary = persisted as unknown as ReturnType<typeof summarizeMarketScan>;
  } else {
    try {
      // Re-summarize from raw rows. Coerce shapes only as far as the function
      // needs (this is a best-effort fallback).
      summary = summarizeMarketScan(
        bundle.scanRow as never,
        bundle.keywords as never,
        bundle.clusters as never,
      );
    } catch {
      summary = null;
    }
  }
  if (!summary || !summary.available) {
    return {
      status: "partial",
      confidence: 0.3,
      missing: ["market_summary"],
      source: (bundle.scanRow.source as string | null) ?? null,
      scanCompletedAt: (bundle.scanRow.scan_completed_at as string | null) ?? null,
      localClustersCount: 0,
      localDemandVolume: null,
      genericReferenceDemandVolume: null,
      topService: null,
      topLocation: null,
      volumeCoveragePercent: null,
    };
  }
  const local = summary.localityBreakdown;
  return {
    status: "available",
    confidence: summary.confidence,
    missing: [],
    source: summary.source ?? (bundle.scanRow.source as string | null) ?? null,
    scanCompletedAt: summary.scanCompletedAt,
    localClustersCount: summary.topClusters?.length ?? 0,
    localDemandVolume: local?.localDemandVolume ?? summary.totalAddressableVolume ?? null,
    genericReferenceDemandVolume: local?.genericReferenceDemandVolume ?? null,
    topService: summary.topServices?.[0]?.name ?? null,
    topLocation: summary.topLocations?.[0]?.name ?? null,
    volumeCoveragePercent: local?.volumeCoveragePercent ?? null,
  };
}

function buildCompetitorsSlice(
  bundle: { scanRow: Record<string, unknown> } | null,
): CompetitorsSlice {
  if (!bundle) {
    return {
      status: "missing",
      confidence: 0,
      missing: ["competitor_scan"],
      source: null,
      scanStatus: null,
      scanCompletedAt: null,
      directCompetitorsCount: 0,
      intermediariesCount: 0,
      medianDirectCompetitorScore: null,
      selfScore: null,
      topGap: null,
      warnings: [],
    };
  }
  const persisted = (bundle.scanRow.summary as Record<string, unknown> | null) ?? null;
  const summary = persisted && (persisted as { available?: boolean }).available
    ? (persisted as unknown as ReturnType<typeof buildCompetitorMatrixSummary>)
    : null;
  const scanStatus = (bundle.scanRow.status as string | null) ?? null;
  const isPartial = !!bundle.scanRow.partial || scanStatus === "partial";
  if (!summary) {
    return {
      status: isPartial ? "partial" : scanStatus === "completed" ? "partial" : "placeholder",
      confidence: 0.3,
      missing: ["competitor_summary"],
      source: (bundle.scanRow.source as string | null) ?? "dataforseo",
      scanStatus,
      scanCompletedAt: (bundle.scanRow.scan_completed_at as string | null) ?? null,
      directCompetitorsCount: 0,
      intermediariesCount: 0,
      medianDirectCompetitorScore: null,
      selfScore: null,
      topGap: null,
      warnings: [],
    };
  }
  const status: ModuleStatus = summary.partial || isPartial ? "partial" : "available";
  return {
    status,
    confidence: Math.max(0, Math.min(1, Number(bundle.scanRow.confidence ?? 0.7))),
    missing: [],
    source: summary.source,
    scanStatus,
    scanCompletedAt: summary.scanCompletedAt,
    directCompetitorsCount: summary.directCompetitorCount ?? 0,
    intermediariesCount: summary.intermediaryCount ?? 0,
    medianDirectCompetitorScore: summary.medianDirectCompetitorScore ?? null,
    selfScore: summary.selfScore ?? null,
    topGap: summary.gaps?.[0]?.label ?? null,
    warnings: summary.warnings ?? [],
  };
}

function buildGbpSlice(
  profile: ReturnType<typeof rowToGbpProfile> | null,
): GbpSlice {
  const summary = summarizeGbpProfile(profile);
  if (!profile) {
    return {
      status: "missing",
      confidence: 0,
      missing: ["gbp_profile"],
      source: null,
      profileStatus: null,
      primaryCategory: null,
      rating: null,
      reviewCount: null,
      completenessScore: summary.completenessScore,
      trustScore: summary.trustScore,
      localVisibilityScore: summary.localVisibilityScore,
    };
  }
  const moduleStatus: ModuleStatus =
    profile.status === "reviewed"
      ? "reviewed"
      : profile.status === "connected"
        ? "connected"
        : profile.status === "manual_review"
          ? "partial"
          : "placeholder";
  const confidence =
    profile.status === "reviewed"
      ? 0.9
      : profile.status === "connected"
        ? 0.85
        : profile.status === "manual_review"
          ? 0.5
          : 0.2;
  return {
    status: moduleStatus,
    confidence,
    missing: summary.gaps.map((g) => g.code),
    source: profile.source,
    profileStatus: profile.status,
    primaryCategory: profile.primaryCategory,
    rating: profile.rating,
    reviewCount: profile.reviewCount,
    completenessScore: summary.completenessScore,
    trustScore: summary.trustScore,
    localVisibilityScore: summary.localVisibilityScore,
  };
}

function buildTrackingSlice(
  goal: ReturnType<typeof rowToGrowthGoal> | null,
  leadCounts: { last30Days: number; total: number },
): TrackingSlice {
  const hasManualLeads = leadCounts.last30Days > 0 || leadCounts.total > 0;
  const baseline = hasManualLeads
    ? leadCounts.last30Days
    : (goal?.currentCount ?? null);
  return {
    status: hasManualLeads ? "partial" : "missing",
    confidence: hasManualLeads ? 0.4 : 0,
    missing: hasManualLeads
      ? ["tracking_integration"]
      : ["tracking_integration", "lead_baseline"],
    callTracking: false,
    formTracking: false,
    analytics: false,
    attribution: false,
    currentLeadBaseline: baseline,
  };
}

async function loadLeadCounts(tenantId: string): Promise<{ last30Days: number; total: number }> {
  const { data, error } = await admin
    .from("leads")
    .select("created_at")
    .eq("tenant_id", tenantId);
  if (error || !data) return { last30Days: 0, total: 0 };
  const cutoff = Date.now() - 30 * 86_400_000;
  const last30Days = (data as Array<{ created_at: string }>).filter(
    (r) => new Date(r.created_at).getTime() >= cutoff,
  ).length;
  return { last30Days, total: data.length as number };
}

function buildWordpressSlice(
  bundle: {
    conn: Record<string, unknown>;
    inventoryCount: number;
    mappingCount: number;
    missingPageCount: number;
    lastSyncedAt: string | null;
  } | null,
): WordpressSlice {
  if (!bundle) {
    return {
      status: "missing",
      confidence: 0,
      missing: ["wordpress_connection"],
      connectionStatus: null,
      kind: null,
      baseUrl: null,
      inventoryCount: 0,
      mappingCount: 0,
      missingPageCount: 0,
      capabilitiesOk: null,
      lastCheckedAt: null,
      lastSyncedAt: null,
    };
  }
  const connStatus = String(bundle.conn.status ?? "not_connected");
  const caps = (bundle.conn.capabilities as Record<string, unknown> | null) ?? {};
  const capOk = typeof caps.ok === "boolean" ? caps.ok : null;
  const lastChecked = (bundle.conn.last_checked_at as string | null) ?? null;

  let moduleStatus: ModuleStatus;
  if (connStatus === "connected" && bundle.inventoryCount > 0) {
    moduleStatus = "connected";
  } else if (connStatus === "connected") {
    moduleStatus = "partial";
  } else if (connStatus === "failed" || connStatus === "revoked") {
    moduleStatus = "placeholder";
  } else {
    moduleStatus = "placeholder";
  }

  const missing: string[] = [];
  if (connStatus !== "connected") missing.push("wordpress_not_connected");
  if (bundle.inventoryCount === 0) missing.push("inventory_not_synced");

  const kind = bundle.conn.kind as "self_hosted" | "wordpress_com" | null;
  return {
    status: moduleStatus,
    confidence: connStatus === "connected" && bundle.inventoryCount > 0 ? 0.9 : 0.3,
    missing,
    connectionStatus: connStatus,
    kind: kind ?? null,
    baseUrl: (bundle.conn.base_url as string | null) ?? null,
    inventoryCount: bundle.inventoryCount,
    mappingCount: bundle.mappingCount,
    missingPageCount: bundle.missingPageCount,
    capabilitiesOk: capOk,
    lastCheckedAt: lastChecked,
    lastSyncedAt: bundle.lastSyncedAt,
  };
}

function buildMasterplanSlice(
  bundle: { plan: Record<string, unknown>; items: Array<Record<string, unknown>> } | null,
): MasterplanSlice {
  if (!bundle) {
    return {
      status: "missing",
      confidence: 0,
      missing: ["masterplan"],
      masterplanId: null,
      itemCount: 0,
      activeItems: 0,
    };
  }
  const items = bundle.items;
  const activeItems = items.filter((i) => {
    const s = String(i.status ?? "");
    return s === "approved" || s === "in_progress";
  }).length;
  const confidence = Math.max(0, Math.min(1, Number(bundle.plan.confidence ?? 0.6)));
  const status: ModuleStatus = activeItems > 0 ? "reviewed" : "available";
  return {
    status,
    confidence,
    missing: [],
    masterplanId: (bundle.plan.id as string | null) ?? null,
    itemCount: items.length,
    activeItems,
  };
}

// ---------------------------------------------------------------------------
// Data availability + missing context + warnings
// ---------------------------------------------------------------------------

const MODULE_LABELS: Record<string, string> = {
  goal: "Growth goal",
  business: "Business profile",
  tone: "Tone profile",
  website: "Website + audit",
  pages: "Page intelligence",
  market: "Market intelligence",
  competitors: "Competitive intelligence",
  gbp: "Google Business Profile",
  masterplan: "Masterplan",
  tracking: "Tracking",
  ranking: "Ranking baseline",
  wordpress: "WordPress delivery",
};

function buildAvailabilityMatrix(
  slices: Pick<
    GrowthIntelligenceSnapshot,
    | "goal"
    | "business"
    | "tone"
    | "website"
    | "pages"
    | "market"
    | "competitors"
    | "gbp"
    | "masterplan"
    | "tracking"
    | "ranking"
    | "wordpress"
  >,
): DataAvailabilityEntry[] {
  return (Object.keys(MODULE_LABELS) as Array<keyof typeof MODULE_LABELS>).map((k) => {
    const slice = (slices as Record<string, { status: ModuleStatus; missing: string[] }>)[k];
    return {
      module: k,
      status: slice.status,
      label: MODULE_LABELS[k],
      nextAction: slice.missing[0],
    };
  });
}

function buildMissingContext(
  slices: Pick<
    GrowthIntelligenceSnapshot,
    | "goal"
    | "business"
    | "tone"
    | "website"
    | "pages"
    | "market"
    | "competitors"
    | "gbp"
    | "masterplan"
    | "tracking"
  >,
  ranking: RankingSlice,
): MissingContextItem[] {
  const out: MissingContextItem[] = [];
  if (slices.goal.status === "missing") {
    out.push({
      key: "goal",
      severity: "critical",
      label: "No active growth goal",
      whyItMatters: "Every layer depends on a stated goal and lead math.",
      nextAction: "Create a growth goal",
    });
  }
  if (slices.business.status === "missing" || slices.business.status === "placeholder") {
    out.push({
      key: "business_profile",
      severity: "high",
      label: "Business profile incomplete",
      whyItMatters: "Without offer, ICP and locations the Blueprint stays generic.",
      nextAction: "Complete business profile",
    });
  }
  if (!slices.website.siteAuditAvailable) {
    out.push({
      key: "audit",
      severity: "high",
      label: "Site audit not available",
      whyItMatters: "Audit feeds page intelligence and scoring.",
      nextAction: "Connect site and run audit",
    });
  }
  if (slices.gbp.status === "missing" || slices.gbp.status === "placeholder") {
    out.push({
      key: "gbp",
      severity: "high",
      label: "Google Business Profile not reviewed",
      whyItMatters: "GBP is the main local visibility lever — completeness drives leads.",
      nextAction: "Review GBP profile",
    });
  }
  if (slices.tracking.status === "missing") {
    out.push({
      key: "tracking",
      severity: "high",
      label: "Tracking not configured",
      whyItMatters: "Without tracking the monthly loop cannot prove progress.",
      nextAction: "Set up call/form/analytics tracking",
    });
  }
  if (!ranking.rankingBaselineAvailable) {
    out.push({
      key: "ranking",
      severity: "low",
      label: "Ranking baseline not started",
      whyItMatters: "Ranking baseline lets us measure visibility improvements over time.",
      nextAction: "Plan ranking baseline (later sprint)",
    });
  }
  return out;
}

function buildWarnings(slices: {
  website: WebsiteSlice;
  competitors: CompetitorsSlice;
  market: MarketSlice;
}): string[] {
  const warnings: string[] = [];
  if (slices.website.isTemporaryDomain) {
    warnings.push(
      "Website is on a temporary domain — audit and competitor identity may be unreliable until a permanent domain is connected.",
    );
  }
  if (slices.competitors.warnings.length > 0) {
    warnings.push(...slices.competitors.warnings.slice(0, 3));
  }
  if (slices.market.volumeCoveragePercent != null && slices.market.volumeCoveragePercent < 50) {
    warnings.push(
      `Market scan resolved volume for only ${Math.round(slices.market.volumeCoveragePercent)}% of keywords — demand numbers may understate the opportunity.`,
    );
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Tiny utilities
// ---------------------------------------------------------------------------

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0]?.toLowerCase() ?? null;
  }
}
