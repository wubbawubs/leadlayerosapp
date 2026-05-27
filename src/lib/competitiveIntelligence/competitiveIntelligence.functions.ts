/**
 * Competitive Intelligence — Server functions (Ticket 4).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  runCompetitorScan,
  type RunCompetitorScanResult,
} from "./runCompetitorScan.server";
import {
  competitorScanSchema,
  competitorSchema,
  type Competitor,
  type CompetitorMatrixSummary,
  type CompetitorScan,
} from "@/lib/shared/competitiveIntelligence/schemas";
import { buildCompetitorMatrixSummary } from "@/lib/shared/competitiveIntelligence/summarize";
import {
  isDataForSeoConfigured,
} from "@/lib/marketIntelligence/dataForSeoAuth.server";
import { isFirecrawlConfigured } from "./firecrawl.server";

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

function mapScanRow(row: Record<string, unknown>): CompetitorScan {
  return competitorScanSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    growthGoalId: row.growth_goal_id ?? null,
    marketScanId: row.market_scan_id ?? null,
    status: row.status,
    source: row.source ?? null,
    clustersScanned: row.clusters_scanned ?? null,
    serpResultsCollected: row.serp_results_collected ?? null,
    scanStartedAt: row.scan_started_at ?? null,
    scanCompletedAt: row.scan_completed_at ?? null,
    errorMessage: row.error_message ?? null,
    summary: (row.summary as Record<string, unknown>) ?? {},
    confidence: row.confidence != null ? Number(row.confidence) : null,
    partial: !!row.partial,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapCompetitorRow(row: Record<string, unknown>): Competitor {
  return competitorSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    competitorScanId: row.competitor_scan_id,
    domain: row.domain,
    displayName: row.display_name ?? null,
    isSelf: !!row.is_self,
    serpAppearanceCount: row.serp_appearance_count ?? 0,
    clustersAppearedIn: Array.isArray(row.clusters_appeared_in)
      ? (row.clusters_appeared_in as string[])
      : [],
    gbpName: row.gbp_name ?? null,
    gbpRating: row.gbp_rating != null ? Number(row.gbp_rating) : null,
    gbpReviewCount: row.gbp_review_count ?? null,
    gbpCategory: row.gbp_category ?? null,
    servicePagesCount: row.service_pages_count ?? null,
    locationPagesCount: row.location_pages_count ?? null,
    servicePagesSample: Array.isArray(row.service_pages_sample)
      ? (row.service_pages_sample as string[])
      : [],
    locationPagesSample: Array.isArray(row.location_pages_sample)
      ? (row.location_pages_sample as string[])
      : [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trustSignals: (row.trust_signals as any) ?? {
      phone: false,
      address: false,
      emergency: false,
      licensing: false,
      certifications: [],
      rawMatches: [],
    },
    competitorScore:
      row.competitor_score != null ? Number(row.competitor_score) : null,
    scoreBreakdown: (row.score_breakdown as Record<string, unknown>) ?? {},
    scoreConfidence:
      row.score_confidence != null ? Number(row.score_confidence) : null,
    dataCompleteness:
      row.data_completeness != null ? Number(row.data_completeness) : null,
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

const runInput = z.object({
  tenantId: z.string().uuid(),
  growthGoalId: z.string().uuid().nullable().optional(),
  marketScanId: z.string().uuid().nullable().optional(),
  maxClusters: z.number().int().min(1).max(20).optional(),
  maxCompetitors: z.number().int().min(1).max(20).optional(),
  forceRefresh: z.boolean().optional(),
});

export const runCompetitorScanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => runInput.parse(input))
  .handler(async ({ data, context }): Promise<RunCompetitorScanResult> => {
    const { supabase, userId } = context;
    const role = await assertMember(supabase, userId, data.tenantId);
    assertOperator(role);

    if (!isDataForSeoConfigured()) {
      throw new Error(
        "DataForSEO is not configured. Add DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD.",
      );
    }
    // Firecrawl optional but recommended — orchestrator handles its absence.
    return runCompetitorScan({
      tenantId: data.tenantId,
      growthGoalId: data.growthGoalId ?? null,
      marketScanId: data.marketScanId ?? null,
      maxClusters: data.maxClusters ?? 5,
      maxCompetitors: data.maxCompetitors ?? 5,
      forceRefresh: data.forceRefresh,
    });
  });

const tenantOnly = z.object({
  tenantId: z.string().uuid(),
  growthGoalId: z.string().uuid().nullable().optional(),
});

export const getLatestCompetitorScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => tenantOnly.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    let q = supabase
      .from("competitor_scans")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data.growthGoalId) q = q.eq("growth_goal_id", data.growthGoalId);
    const { data: rows, error } = await q;
    if (error) throw error;
    const scanRow = rows?.[0];
    if (!scanRow) return { scan: null, competitors: [] as Competitor[] };

    const scan = mapScanRow(scanRow);
    const { data: compRows, error: compErr } = await supabase
      .from("competitors")
      .select("*")
      .eq("competitor_scan_id", scan.id)
      .order("competitor_score", { ascending: false, nullsFirst: false });
    if (compErr) throw compErr;
    return {
      scan,
      competitors: (compRows ?? []).map((r: Record<string, unknown>) =>
        mapCompetitorRow(r),
      ),
    };
  });

export const listCompetitorScans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);
    const { data: rows, error } = await supabase
      .from("competitor_scans")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return { scans: (rows ?? []).map((r: Record<string, unknown>) => mapScanRow(r)) };
  });

export const summarizeLatestCompetitorScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => tenantOnly.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      summary: CompetitorMatrixSummary;
      config: { dataForSeo: boolean; firecrawl: boolean };
    }> => {
      const { supabase, userId } = context;
      await assertMember(supabase, userId, data.tenantId);

      let q = supabase
        .from("competitor_scans")
        .select("*")
        .eq("tenant_id", data.tenantId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (data.growthGoalId) q = q.eq("growth_goal_id", data.growthGoalId);
      const { data: rows, error } = await q;
      if (error) throw error;
      const scanRow = rows?.[0];

      const config = {
        dataForSeo: isDataForSeoConfigured(),
        firecrawl: isFirecrawlConfigured(),
      };

      if (!scanRow) {
        return {
          summary: buildCompetitorMatrixSummary(null, [], []),
          config,
        };
      }
      const scan = mapScanRow(scanRow);
      // Prefer persisted summary if available.
      const persisted = scan.summary as unknown as CompetitorMatrixSummary;
      if (persisted && (persisted as { available?: boolean }).available) {
        return { summary: persisted, config };
      }
      // Rebuild from rows.
      const { data: compRows } = await supabase
        .from("competitors")
        .select("*")
        .eq("competitor_scan_id", scan.id);
      const competitors = (compRows ?? []).map((r: Record<string, unknown>) =>
        mapCompetitorRow(r),
      );
      return {
        summary: buildCompetitorMatrixSummary(scan, competitors, []),
        config,
      };
    },
  );

// Re-export supabaseAdmin to silence unused warning in some bundlers.
void supabaseAdmin;
