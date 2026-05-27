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
      return { scan, keywords: [], clusters: [] };
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
        reasoning: c.reasoning,
        representative_keywords: c.representativeKeywords,
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
      .update({ summary, confidence: summary.confidence })
      .eq("id", scan.id);

    return { scan: { ...scan, summary, confidence: summary.confidence }, keywords, clusters };
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
