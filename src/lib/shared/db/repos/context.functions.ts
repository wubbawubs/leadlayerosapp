/**
 * Context Layer repo — server functions for business profile,
 * brand voice profile, and page intelligence. Used by the
 * /settings/business-profile UI and by the future context-aware
 * proposal engine (see src/lib/shared/proposals/context.server.ts).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  BusinessProfileInputSchema,
  type BusinessProfileInput,
} from "./context.schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertOperator(supabase: any, userId: string, tenantId: string) {
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
}

// ============= Business Profile =============

export const getBusinessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);
    const { data: row, error } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (error) throw error;
    return { profile: row };
  });

export const upsertBusinessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: BusinessProfileInput) =>
    BusinessProfileInputSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const row = {
      tenant_id: data.tenantId,
      business_name: data.businessName ?? null,
      industry: data.industry ?? null,
      primary_offer: data.primaryOffer ?? null,
      secondary_offers: data.secondaryOffers ?? [],
      target_audience: data.targetAudience ?? [],
      service_areas: data.serviceAreas ?? [],
      unique_value_proposition: data.uniqueValueProposition ?? null,
      main_promise: data.mainPromise ?? null,
      proof_points: data.proofPoints ?? [],
      avoid_claims: data.avoidClaims ?? [],
      preferred_cta: data.preferredCta ?? null,
      tone_preference: data.tonePreference ?? null,
      language: data.language ?? "nl",
    };

    const { data: saved, error } = await supabaseAdmin
      .from("business_profiles")
      .upsert(row, { onConflict: "tenant_id" })
      .select("*")
      .single();
    if (error) throw error;
    return { profile: saved };
  });

// ============= Brand Voice Profile =============

export const getBrandVoiceProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);
    const { data: row, error } = await supabase
      .from("brand_voice_profiles")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (error) throw error;
    return { profile: row };
  });

// ============= Page Intelligence =============

export const listPageIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { auditId: string }) =>
    z.object({ auditId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: audit, error: aErr } = await supabase
      .from("audits")
      .select("id, tenant_id")
      .eq("id", data.auditId)
      .maybeSingle();
    if (aErr) throw aErr;
    if (!audit) throw new Error("Audit not found");
    await assertMember(supabase, userId, audit.tenant_id);

    const { data: pages, error: pErr } = await supabase
      .from("audit_pages")
      .select("id")
      .eq("audit_id", data.auditId);
    if (pErr) throw pErr;
    const ids = (pages ?? []).map((p) => p.id);
    if (ids.length === 0) return { rows: [] };

    const { data: rows, error } = await supabase
      .from("page_intelligence")
      .select("*")
      .in("audit_page_id", ids);
    if (error) throw error;
    return { rows: rows ?? [] };
  });
