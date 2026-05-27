/**
 * Market Intelligence — Server functions (Ticket 2).
 *
 * - createMarketScan: operator/owner creates a scan + (optional) seed keywords + clusters.
 * - getLatestMarketScan: latest completed/non-failed scan for tenant (optionally by growth goal).
 * - listMarketScans: recent scans for a tenant.
 * - summarizeLatestMarketScan: returns MarketDemandSummary for Blueprint integration.
 *
 * Rules:
 *  - All calls require auth + tenant membership (RLS-backed; admin client for writes).
 *  - No external APIs (DataForSEO etc.) — Ticket 3.
 *  - Synthetic / manual scans are allowed but must carry their source label.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  clusterMarketKeywords,
  inferKeywordIntent,
  normalizeKeyword,
  summarizeMarketScan,
} from "@/lib/shared/marketIntelligence/cluster";
import {
  createMarketScanInputSchema,
  marketDemandClusterSchema,
  marketKeywordSchema,
  marketScanSchema,
  type MarketDemandCluster,
  type MarketKeyword,
  type MarketScan,
} from "@/lib/shared/marketIntelligence/schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertMember(supabase: any, userId: string, tenantId: string) {
  const { data, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: not a member of this tenant");
  return data.role as string;
}

function assertOperator(role: string) {
  if (role !== "owner" && role !== "operator") {
    throw new Error("Forbidden: requires operator or owner role");
  }
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapScanRow(row: any): MarketScan {
  return marketScanSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id ?? null,
    growthGoalId: row.growth_goal_id ?? null,
    status: row.status,
    language: row.language ?? null,
    country: row.country ?? null,
    region: row.region ?? null,
    vertical: row.vertical ?? null,
    services: Array.isArray(row.services) ? row.services : [],
    locations: Array.isArray(row.locations) ? row.locations : [],
    source: row.source,
    scanStartedAt: row.scan_started_at ?? null,
    scanCompletedAt: row.scan_completed_at ?? null,
    summary: row.summary ?? {},
    confidence: row.confidence ?? null,
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapKeywordRow(row: any): MarketKeyword {
  return marketKeywordSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    marketScanId: row.market_scan_id,
    service: row.service ?? null,
    location: row.location ?? null,
    keyword: row.keyword,
    normalizedKeyword: row.normalized_keyword ?? null,
    intent: row.intent ?? null,
    volume: row.volume ?? null,
    difficulty: row.difficulty != null ? Number(row.difficulty) : null,
    competition: row.competition != null ? Number(row.competition) : null,
    cpc: row.cpc != null ? Number(row.cpc) : null,
    source: row.source,
    confidence: row.confidence != null ? Number(row.confidence) : null,
    raw: row.raw ?? {},
    createdAt: row.created_at,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapClusterRow(row: any): MarketDemandCluster {
  return marketDemandClusterSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    marketScanId: row.market_scan_id,
    clusterName: row.cluster_name,
    service: row.service ?? null,
    location: row.location ?? null,
    intent: row.intent ?? null,
    totalVolume: row.total_volume ?? null,
    keywordCount: row.keyword_count ?? null,
    averageDifficulty: row.average_difficulty != null ? Number(row.average_difficulty) : null,
    averageCompetition:
      row.average_competition != null ? Number(row.average_competition) : null,
    opportunityScore: row.opportunity_score != null ? Number(row.opportunity_score) : null,
    priority: row.priority ?? null,
    reasoning: Array.isArray(row.reasoning) ? row.reasoning : [],
    representativeKeywords: Array.isArray(row.representative_keywords)
      ? row.representative_keywords
      : [],
    createdAt: row.created_at,
  });
}

// ---------------------------------------------------------------------------
// createMarketScan
// ---------------------------------------------------------------------------

export const createMarketScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createMarketScanInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await assertMember(supabase, userId, data.tenantId);
    assertOperator(role);

    const now = new Date().toISOString();
    const isCompleted = data.keywords.length > 0;

    const { data: scanRow, error: scanErr } = await supabaseAdmin
      .from("market_scans")
      .insert({
        tenant_id: data.tenantId,
        growth_goal_id: data.growthGoalId ?? null,
        site_id: data.siteId ?? null,
        status: isCompleted ? "completed" : data.status,
        language: data.language ?? "en",
        country: data.country ?? null,
        region: data.region ?? null,
        vertical: data.vertical ?? null,
        services: data.services,
        locations: data.locations,
        source: data.source,
        scan_started_at: isCompleted ? now : null,
        scan_completed_at: isCompleted ? now : null,
      })
      .select("*")
      .single();
    if (scanErr) throw scanErr;
    const scan = mapScanRow(scanRow);

    if (data.keywords.length === 0) {
      return { scan, summary: summarizeMarketScan(scan, [], []), keywords: [], clusters: [] };
    }

    // Insert keywords (with normalization + intent inference if missing)
    const keywordRows = data.keywords.map((k) => {
      const intent = k.intent ?? inferKeywordIntent(k.keyword);
      return {
        tenant_id: data.tenantId,
        market_scan_id: scan.id,
        keyword: k.keyword,
        normalized_keyword: normalizeKeyword(k.keyword),
        service: k.service ?? null,
        location: k.location ?? null,
        intent,
        volume: k.volume ?? null,
        difficulty: k.difficulty ?? null,
        competition: k.competition ?? null,
        cpc: k.cpc ?? null,
        source: data.source,
        confidence: k.confidence ?? null,
        raw: (k.raw ?? {}) as never,
      };
    });

    const { data: kwRows, error: kwErr } = await supabaseAdmin
      .from("market_keywords")
      .insert(keywordRows)
      .select("*");
    if (kwErr) throw kwErr;
    const keywords = (kwRows ?? []).map(mapKeywordRow);

    // Build clusters
    const drafts = clusterMarketKeywords(
      keywords.map((k) => ({
        keyword: k.keyword,
        service: k.service ?? null,
        location: k.location ?? null,
        intent: k.intent ?? null,
        volume: k.volume ?? null,
        difficulty: k.difficulty ?? null,
        competition: k.competition ?? null,
      })),
    );

    let clusters: MarketDemandCluster[] = [];
    if (drafts.length > 0) {
      const clusterRows = drafts.map((c) => ({
        tenant_id: data.tenantId,
        market_scan_id: scan.id,
        cluster_name: c.clusterName,
        service: c.service ?? null,
        location: c.location ?? null,
        intent: c.intent ?? null,
        total_volume: c.totalVolume ?? null,
        keyword_count: c.keywordCount ?? null,
        average_difficulty: c.averageDifficulty ?? null,
        average_competition: c.averageCompetition ?? null,
        opportunity_score: c.opportunityScore ?? null,
        priority: c.priority ?? null,
        reasoning: c.reasoning as never,
        representative_keywords: c.representativeKeywords as never,
      }));
      const { data: clRows, error: clErr } = await supabaseAdmin
        .from("market_demand_clusters")
        .insert(clusterRows)
        .select("*");
      if (clErr) throw clErr;
      clusters = (clRows ?? []).map(mapClusterRow);
    }

    // Write summary back onto scan for fast reads
    const summary = summarizeMarketScan(scan, keywords, clusters);
    await supabaseAdmin
      .from("market_scans")
      .update({ summary: summary as never, confidence: summary.confidence })
      .eq("id", scan.id);

    return { scan, summary, keywords, clusters };
  });

// ---------------------------------------------------------------------------
// listMarketScans
// ---------------------------------------------------------------------------

export const listMarketScans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    const { data: rows, error } = await supabase
      .from("market_scans")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return { scans: (rows ?? []).map(mapScanRow) };
  });

// ---------------------------------------------------------------------------
// getLatestMarketScan
// ---------------------------------------------------------------------------

export const getLatestMarketScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; growthGoalId?: string | null }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        growthGoalId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    let query = supabase
      .from("market_scans")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .in("status", ["completed", "stale"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (data.growthGoalId) query = query.eq("growth_goal_id", data.growthGoalId);

    const { data: scanRows, error } = await query;
    if (error) throw error;
    const scanRow = scanRows?.[0];
    if (!scanRow) return { scan: null, keywords: [], clusters: [] };

    const scan = mapScanRow(scanRow);

    const [kwRes, clRes] = await Promise.all([
      supabase
        .from("market_keywords")
        .select("*")
        .eq("market_scan_id", scan.id)
        .order("volume", { ascending: false, nullsFirst: false }),
      supabase
        .from("market_demand_clusters")
        .select("*")
        .eq("market_scan_id", scan.id)
        .order("opportunity_score", { ascending: false, nullsFirst: false }),
    ]);
    if (kwRes.error) throw kwRes.error;
    if (clRes.error) throw clRes.error;

    return {
      scan,
      keywords: (kwRes.data ?? []).map(mapKeywordRow),
      clusters: (clRes.data ?? []).map(mapClusterRow),
    };
  });

// ---------------------------------------------------------------------------
// summarizeLatestMarketScan
// ---------------------------------------------------------------------------

export const summarizeLatestMarketScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; growthGoalId?: string | null }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        growthGoalId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    let query = supabase
      .from("market_scans")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .in("status", ["completed", "stale"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (data.growthGoalId) query = query.eq("growth_goal_id", data.growthGoalId);

    const { data: scanRows, error } = await query;
    if (error) throw error;
    const scanRow = scanRows?.[0];
    if (!scanRow) {
      return { summary: summarizeMarketScan(null, [], []) };
    }
    const scan = mapScanRow(scanRow);

    const [kwRes, clRes] = await Promise.all([
      supabase.from("market_keywords").select("*").eq("market_scan_id", scan.id),
      supabase.from("market_demand_clusters").select("*").eq("market_scan_id", scan.id),
    ]);
    if (kwRes.error) throw kwRes.error;
    if (clRes.error) throw clRes.error;

    const keywords = (kwRes.data ?? []).map(mapKeywordRow);
    const clusters = (clRes.data ?? []).map(mapClusterRow);
    return { summary: summarizeMarketScan(scan, keywords, clusters) };
  });

// ---------------------------------------------------------------------------
// runDataForSeoMarketScan (Ticket 3)
// ---------------------------------------------------------------------------

import { fetchKeywordMetricsForMarket } from "./dataForSeo.server";
import { generateMarketKeywordSeeds } from "@/lib/shared/marketIntelligence/seeds";

const runScanInputSchema = z.object({
  tenantId: z.string().uuid(),
  growthGoalId: z.string().uuid().nullable().optional(),
  services: z.array(z.string().min(1).max(120)).max(50).optional(),
  locations: z.array(z.string().min(1).max(120)).max(50).optional(),
  country: z.string().max(64).optional(),
  language: z.string().max(8).optional(),
  locationName: z.string().max(120).optional(),
  maxKeywords: z.number().int().min(1).max(500).optional(),
});

export const runDataForSeoMarketScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => runScanInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await assertMember(supabase, userId, data.tenantId);
    assertOperator(role);

    // 1. Resolve services / locations from input or active growth goal.
    let services = data.services ?? [];
    let locations = data.locations ?? [];
    let resolvedGoalId = data.growthGoalId ?? null;

    if (services.length === 0 || locations.length === 0 || !resolvedGoalId) {
      let goalQ = supabase
        .from("growth_goals")
        .select("id, service_focus, locations, status")
        .eq("tenant_id", data.tenantId)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (data.growthGoalId) goalQ = goalQ.eq("id", data.growthGoalId);
      const { data: goalRows, error: goalErr } = await goalQ;
      if (goalErr) throw goalErr;
      const goal = goalRows?.[0];
      if (goal) {
        resolvedGoalId = resolvedGoalId ?? goal.id;
        if (services.length === 0 && Array.isArray(goal.service_focus)) {
          services = goal.service_focus.filter(
            (s: unknown): s is string => typeof s === "string" && s.trim().length > 0,
          );
        }
        if (locations.length === 0 && Array.isArray(goal.locations)) {
          locations = goal.locations.filter(
            (l: unknown): l is string => typeof l === "string" && l.trim().length > 0,
          );
        }
      }
    }

    if (services.length === 0 || locations.length === 0) {
      throw new Error(
        "needs_context: market scan requires at least one service and one location. " +
          "Add service focus + locations to the active growth goal first.",
      );
    }

    const country = (data.country ?? "US").toUpperCase();
    const language = (data.language ?? "en").toLowerCase();
    const locationName = data.locationName ?? "United States";

    // 2. Generate seeds.
    const seedResult = generateMarketKeywordSeeds({
      services,
      locations,
      country,
      language,
      maxKeywords: data.maxKeywords ?? 100,
    });
    if (seedResult.seeds.length === 0) {
      throw new Error("Seed generation produced no keywords.");
    }

    // 3. Create running scan row.
    const startedAt = new Date().toISOString();
    const { data: scanRow, error: scanErr } = await supabaseAdmin
      .from("market_scans")
      .insert({
        tenant_id: data.tenantId,
        growth_goal_id: resolvedGoalId,
        status: "running",
        language,
        country,
        services,
        locations,
        source: "dataforseo",
        scan_started_at: startedAt,
      })
      .select("*")
      .single();
    if (scanErr) throw scanErr;
    const scan = mapScanRow(scanRow);

    try {
      // 4. Call DataForSEO.
      const metrics = await fetchKeywordMetricsForMarket({
        keywords: seedResult.seeds.map((s) => s.keyword),
        locationName,
        languageCode: language,
      });

      const metricByKeyword = new Map(
        metrics.map((m) => [m.keyword.toLowerCase(), m]),
      );

      // 5. Insert keywords.
      const keywordRows = seedResult.seeds.map((seed) => {
        const m = metricByKeyword.get(seed.keyword.toLowerCase());
        const intent = inferKeywordIntent(seed.keyword);
        return {
          tenant_id: data.tenantId,
          market_scan_id: scan.id,
          keyword: seed.keyword,
          normalized_keyword: normalizeKeyword(seed.keyword),
          service: seed.service,
          location: seed.location,
          intent,
          volume: m?.volume ?? null,
          difficulty: m?.difficulty ?? null,
          competition: m?.competition ?? null,
          cpc: m?.cpc ?? null,
          source: "dataforseo" as const,
          confidence: m?.volume != null ? 0.9 : 0.3,
          raw: (m?.raw ?? {}) as never,
        };
      });

      const { data: kwRows, error: kwErr } = await supabaseAdmin
        .from("market_keywords")
        .insert(keywordRows)
        .select("*");
      if (kwErr) throw kwErr;
      const keywords = (kwRows ?? []).map(mapKeywordRow);

      // 6. Cluster.
      const drafts = clusterMarketKeywords(
        keywords.map((k) => ({
          keyword: k.keyword,
          service: k.service ?? null,
          location: k.location ?? null,
          intent: k.intent ?? null,
          volume: k.volume ?? null,
          difficulty: k.difficulty ?? null,
          competition: k.competition ?? null,
        })),
      );

      let clusters: MarketDemandCluster[] = [];
      if (drafts.length > 0) {
        const clusterRows = drafts.map((c) => ({
          tenant_id: data.tenantId,
          market_scan_id: scan.id,
          cluster_name: c.clusterName,
          service: c.service ?? null,
          location: c.location ?? null,
          intent: c.intent ?? null,
          total_volume: c.totalVolume ?? null,
          keyword_count: c.keywordCount ?? null,
          average_difficulty: c.averageDifficulty ?? null,
          average_competition: c.averageCompetition ?? null,
          opportunity_score: c.opportunityScore ?? null,
          priority: c.priority ?? null,
          reasoning: c.reasoning as never,
          representative_keywords: c.representativeKeywords as never,
        }));
        const { data: clRows, error: clErr } = await supabaseAdmin
          .from("market_demand_clusters")
          .insert(clusterRows)
          .select("*");
        if (clErr) throw clErr;
        clusters = (clRows ?? []).map(mapClusterRow);
      }

      // 7. Finalise scan.
      const summary = summarizeMarketScan(scan, keywords, clusters);
      const summaryWithSeedStats = {
        ...summary,
        seedStats: {
          generated: seedResult.totalGenerated,
          kept: seedResult.totalKept,
          skipped: seedResult.skipped,
        },
      };

      const completedAt = new Date().toISOString();
      const { data: updated, error: updErr } = await supabaseAdmin
        .from("market_scans")
        .update({
          status: "completed",
          scan_completed_at: completedAt,
          summary: summaryWithSeedStats as never,
          confidence: summary.confidence,
        })
        .eq("id", scan.id)
        .select("*")
        .single();
      if (updErr) throw updErr;

      return {
        scan: mapScanRow(updated),
        summary: summaryWithSeedStats,
        keywordCount: keywords.length,
        clusterCount: clusters.length,
        seedStats: summaryWithSeedStats.seedStats,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown scan error";
      await supabaseAdmin
        .from("market_scans")
        .update({
          status: "failed",
          error_message: message.slice(0, 500),
          scan_completed_at: new Date().toISOString(),
        })
        .eq("id", scan.id);
      throw new Error(message);
    }
  });
