/**
 * Proposal context fetcher — server-only.
 *
 * Returns the business profile, brand voice and page intelligence for a
 * given tenant/page so the proposal engine can produce context-aware
 * suggestions. Used by generator.server.ts.
 *
 * TODO(S4c): Full prompt rewrite + quality gate. For now we expose the
 * context and let the existing prompt optionally inject it.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface ProposalContext {
  businessProfile: Record<string, unknown> | null;
  brandVoiceProfile: Record<string, unknown> | null;
  pageIntelligence: Record<string, unknown> | null;
}

export async function getProposalContext(
  tenantId: string,
  auditPageId: string | null,
): Promise<ProposalContext> {
  const [bp, bv, pi] = await Promise.all([
    supabaseAdmin
      .from("business_profiles")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabaseAdmin
      .from("brand_voice_profiles")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    auditPageId
      ? supabaseAdmin
          .from("page_intelligence")
          .select("*")
          .eq("audit_page_id", auditPageId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    businessProfile: (bp as { data: Record<string, unknown> | null }).data ?? null,
    brandVoiceProfile: (bv as { data: Record<string, unknown> | null }).data ?? null,
    pageIntelligence: (pi as { data: Record<string, unknown> | null }).data ?? null,
  };
}

export function renderContextForPrompt(ctx: ProposalContext): string {
  const parts: string[] = [];
  if (ctx.businessProfile) {
    const bp = ctx.businessProfile;
    parts.push(
      "Business context:",
      `- Naam: ${bp.business_name ?? "?"}`,
      `- Primair aanbod: ${bp.primary_offer ?? "?"}`,
      `- Doelgroep: ${JSON.stringify(bp.target_audience ?? [])}`,
      `- Belofte: ${bp.main_promise ?? "?"}`,
      `- Bewijspunten: ${JSON.stringify(bp.proof_points ?? [])}`,
      `- Te vermijden claims: ${JSON.stringify(bp.avoid_claims ?? [])}`,
      `- Voorkeurs-CTA: ${bp.preferred_cta ?? "?"}`,
      `- Toon: ${bp.tone_preference ?? "?"}`,
    );
  }
  if (ctx.brandVoiceProfile) {
    const bv = ctx.brandVoiceProfile;
    parts.push(
      "",
      "Brand voice:",
      `- Toon: ${bv.tone_summary ?? "?"}`,
      `- Voorkeurswoorden: ${JSON.stringify(bv.preferred_words ?? [])}`,
      `- Verboden woorden: ${JSON.stringify(bv.forbidden_words ?? [])}`,
    );
  }
  if (ctx.pageIntelligence) {
    const pi = ctx.pageIntelligence;
    parts.push(
      "",
      "Page intelligence:",
      `- Type: ${pi.page_type ?? "?"}`,
      `- Intent: ${pi.intent ?? "?"}`,
      `- Commerciële prioriteit: ${pi.commercial_priority ?? "?"}`,
      `- Doelactie: ${pi.desired_action ?? "?"}`,
      `- Samenvatting: ${pi.summary ?? "?"}`,
    );
  }
  return parts.length > 0 ? parts.join("\n") : "";
}
