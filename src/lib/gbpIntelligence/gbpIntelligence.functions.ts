/**
 * GBP Intelligence V1 — server functions.
 *
 * - getGbpProfile: latest profile for tenant (+ optional growthGoalId).
 * - upsertGbpProfile: create or update with operator/owner role.
 * - summarizeGbpProfileFn: returns GbpSummary used by the Blueprint.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CreateOrUpdateGbpProfileInputSchema,
  rowToGbpProfile,
  type GbpProfile,
} from "@/lib/shared/gbpIntelligence/schemas";
import {
  calculateGbpCompletenessScore,
  calculateGbpLocalVisibilityScore,
  calculateGbpTrustScore,
  summarizeGbpProfile,
} from "@/lib/shared/gbpIntelligence/scoring";

// gbp_profiles table is not yet in generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

async function assertOperator(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  tenantId: string,
) {
  const { data, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: not a member of this tenant");
  if (data.role !== "owner" && data.role !== "operator") {
    throw new Error("Forbidden: requires operator or owner role");
  }
}

async function fetchLatestProfile(
  tenantId: string,
  growthGoalId: string | null,
): Promise<GbpProfile | null> {
  let q = admin
    .from("gbp_profiles")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (growthGoalId) q = q.eq("growth_goal_id", growthGoalId);
  const { data, error } = await q;
  if (error) throw error;
  const row = (data ?? [])[0];
  return row ? rowToGbpProfile(row) : null;
}

export const getGbpProfile = createServerFn({ method: "POST" })
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
    const { data: membership, error } = await supabase
      .from("memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!membership) return { profile: null as GbpProfile | null };
    const profile = await fetchLatestProfile(data.tenantId, data.growthGoalId ?? null);
    return { profile };
  });

export const summarizeGbpProfileFn = createServerFn({ method: "POST" })
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
    const { data: membership, error } = await supabase
      .from("memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!membership) return { summary: summarizeGbpProfile(null) };
    const profile = await fetchLatestProfile(data.tenantId, data.growthGoalId ?? null);
    return { summary: summarizeGbpProfile(profile) };
  });

export const upsertGbpProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    CreateOrUpdateGbpProfileInputSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const existing = await fetchLatestProfile(
      data.tenantId,
      data.growthGoalId ?? null,
    );

    const draft: GbpProfile = {
      id: existing?.id ?? "",
      tenantId: data.tenantId,
      siteId: existing?.siteId ?? null,
      growthGoalId: data.growthGoalId ?? existing?.growthGoalId ?? null,
      status: data.status,
      source: data.source,
      businessName: data.businessName ?? null,
      profileUrl: data.profileUrl ?? null,
      primaryCategory: data.primaryCategory ?? null,
      secondaryCategories: data.secondaryCategories ?? [],
      rating: data.rating ?? null,
      reviewCount: data.reviewCount ?? null,
      reviewVelocity: existing?.reviewVelocity ?? {},
      services: data.services ?? [],
      serviceArea: data.serviceArea ?? [],
      address: data.address ?? null,
      phone: data.phone ?? null,
      websiteUrl: data.websiteUrl ?? null,
      photosStatus: data.photosStatus ?? "unknown",
      postsStatus: data.postsStatus ?? "unknown",
      napConsistency: data.napConsistency ?? "unknown",
      completenessScore: null,
      trustScore: null,
      localVisibilityScore: null,
      gaps: [],
      recommendations: [],
      notes: data.notes ?? null,
      lastReviewedAt: new Date().toISOString(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const summary = summarizeGbpProfile(draft);

    const row = {
      tenant_id: data.tenantId,
      growth_goal_id: data.growthGoalId ?? null,
      status: data.status,
      source: data.source,
      business_name: data.businessName ?? null,
      profile_url: data.profileUrl ?? null,
      primary_category: data.primaryCategory ?? null,
      secondary_categories: data.secondaryCategories ?? [],
      rating: data.rating ?? null,
      review_count: data.reviewCount ?? null,
      services: data.services ?? [],
      service_area: data.serviceArea ?? [],
      address: data.address ?? null,
      phone: data.phone ?? null,
      website_url: data.websiteUrl ?? null,
      photos_status: data.photosStatus ?? "unknown",
      posts_status: data.postsStatus ?? "unknown",
      nap_consistency: data.napConsistency ?? "unknown",
      completeness_score: calculateGbpCompletenessScore(draft),
      trust_score: calculateGbpTrustScore(draft),
      local_visibility_score: calculateGbpLocalVisibilityScore(draft),
      gaps: summary.gaps,
      recommendations: summary.recommendations,
      notes: data.notes ?? null,
      last_reviewed_at: new Date().toISOString(),
    };

    if (existing) {
      const { data: updated, error } = await admin
        .from("gbp_profiles")
        .update(row)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw error;
      return { profile: rowToGbpProfile(updated), summary };
    } else {
      const { data: inserted, error } = await admin
        .from("gbp_profiles")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      return { profile: rowToGbpProfile(inserted), summary };
    }
  });
