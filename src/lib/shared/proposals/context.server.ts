/**
 * Proposal context fetcher — server-only.
 *
 * Now backed by tone_profiles (V1) instead of brand_voice_profiles.
 * brand_voice_profiles is deprecated; left in DB but not read here anymore.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ToneProfileSchema, type ToneProfile } from "@/lib/shared/tone/schemas";

export interface ProposalContext {
  businessProfile: Record<string, unknown> | null;
  toneProfile: ToneProfile | null;
  toneStatus: string | null;
  pageIntelligence: Record<string, unknown> | null;
}

export async function getProposalContext(
  tenantId: string,
  auditPageId: string | null,
): Promise<ProposalContext> {
  const [bp, tp, pi] = await Promise.all([
    supabaseAdmin
      .from("business_profiles")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabaseAdmin
      .from("tone_profiles")
      .select("profile, status, locale")
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

  let toneProfile: ToneProfile | null = null;
  const tpRow = (tp as { data: { profile: unknown; status: string; locale: string | null } | null }).data;
  if (tpRow?.profile) {
    try {
      const parsed = ToneProfileSchema.parse(tpRow.profile);
      toneProfile = ToneProfileSchema.parse({
        ...parsed,
        localeTone: {
          ...parsed.localeTone,
          locale: tpRow.locale ?? parsed.localeTone.locale,
        },
      });
    } catch {
      toneProfile = null;
    }
  }

  return {
    businessProfile: (bp as { data: Record<string, unknown> | null }).data ?? null,
    toneProfile,
    toneStatus: tpRow?.status ?? null,
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
      `- Belofte: ${bp.main_promise ?? "?"}`,
      `- Voorkeurs-CTA: ${bp.preferred_cta ?? "?"}`,
    );
  }
  if (ctx.toneProfile) {
    const t = ctx.toneProfile;
    parts.push(
      "",
      "Tone Profile (volg STRIKT):",
      `- Persona: ${t.voiceIdentity.persona}`,
      `- Samenvatting: ${t.voiceIdentity.summary}`,
      `- Commercial intensity: ${t.voiceIdentity.commercialIntensity}`,
      `- Zinslengte: ${t.sentenceArchitecture.averageSentenceLength}`,
      `- Ritme: ${t.sentenceArchitecture.rhythm}`,
      `- Voorkeurswoorden: ${t.vocabulary.preferred.slice(0, 12).join(", ")}`,
      `- Vermijd: ${t.vocabulary.avoid.slice(0, 12).join(", ")}`,
      `- VERBODEN woorden (NOOIT gebruiken): ${t.vocabulary.forbidden.join(", ")}`,
      `- VERBODEN claims: ${t.claimStyle.forbiddenClaims.join(" | ")}`,
      `- Veilige claim-patterns: ${t.claimStyle.safeClaimPatterns.slice(0, 4).join(" | ")}`,
      `- CTA-stijl: ${t.ctaStyle.style}`,
      `- CTA voorbeelden: ${t.ctaStyle.primaryCtaPatterns.slice(0, 4).join(" | ")}`,
      `- Goede voorbeelden:`,
      ...t.examples.good.slice(0, 4).map((s) => `  ✓ ${s}`),
      `- Slechte voorbeelden (NIET zo schrijven):`,
      ...t.examples.bad.slice(0, 4).map((s) => `  ✗ ${s}`),
    );
  }
  if (ctx.pageIntelligence) {
    const pi = ctx.pageIntelligence;
    parts.push(
      "",
      "Page intelligence:",
      `- Type: ${pi.page_type ?? "?"} · Intent: ${pi.intent ?? "?"}`,
      `- Doelactie: ${pi.desired_action ?? "?"}`,
    );
  }
  return parts.length > 0 ? parts.join("\n") : "";
}
