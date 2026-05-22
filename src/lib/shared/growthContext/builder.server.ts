/**
 * Growth Context Builder V1 — server-only.
 * Composes Business Profile v2 + Tone Profile + Page Intelligence + Audit Issue
 * into one GrowthContext object consumed by Proposal Engine V2.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ToneProfileSchema, type ToneProfile } from "@/lib/shared/tone/schemas";
import { BusinessProfileSchema, type BusinessProfile } from "@/lib/shared/businessProfile/schemas";
import {
  GrowthContextSchema,
  mapIssueToAction,
  type GrowthContext,
  type ReadinessStatus,
} from "./schemas";

interface BuildInput {
  tenantId: string;
  auditId: string;
  pageId: string; // audit_pages.id
  issueId: string; // composite "{auditPageId}:{issueCode}" or issue code
}

function tryParseTone(profile: unknown): ToneProfile | null {
  if (!profile) return null;
  try {
    return ToneProfileSchema.parse(profile);
  } catch {
    return null;
  }
}

function tryParseBusiness(row: Record<string, unknown> | null): BusinessProfile | null {
  if (!row) return null;
  // Strict parse first.
  try {
    return BusinessProfileSchema.parse({
      status: row.status,
      confidence_score: row.confidence_score,
      business_identity: row.business_identity ?? {},
      offer_profile: row.offer_profile ?? {},
      icp_profile: row.icp_profile ?? {},
      location_profile: row.location_profile ?? {},
      conversion_profile: row.conversion_profile ?? {},
      proof_profile: row.proof_profile ?? {},
      claim_guardrails: row.claim_guardrails ?? {},
      strategy_angles: row.strategy_angles ?? [],
      missing_context: row.missing_context ?? [],
      locked_fields: row.locked_fields ?? [],
      confidence_reasons: row.confidence_reasons ?? {},
    });
  } catch {
    // Tolerant fallback: known sections sometimes drift (e.g. confidence_reasons
    // with score>10, oversized strings). Drop only the offending side-data and
    // keep core sections so businessProfile context isn't lost wholesale.
    try {
      return BusinessProfileSchema.parse({
        status: row.status,
        confidence_score:
          typeof row.confidence_score === "number"
            ? Math.min(10, Math.max(0, row.confidence_score))
            : 0,
        business_identity: row.business_identity ?? {},
        offer_profile: row.offer_profile ?? {},
        icp_profile: row.icp_profile ?? {},
        location_profile: row.location_profile ?? {},
        conversion_profile: row.conversion_profile ?? {},
        proof_profile: row.proof_profile ?? {},
        claim_guardrails: row.claim_guardrails ?? {},
        strategy_angles: [],
        missing_context: [],
        locked_fields: [],
        confidence_reasons: {},
      });
    } catch {
      return null;
    }
  }
}

export async function buildGrowthContext(input: BuildInput): Promise<GrowthContext> {
  const { tenantId, auditId, pageId, issueId } = input;

  const [bpRes, tpRes, pageRes, piRes] = await Promise.all([
    supabaseAdmin
      .from("business_profiles_v2")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabaseAdmin
      .from("tone_profiles")
      .select("profile, status, confidence_score")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabaseAdmin
      .from("audit_pages")
      .select("id, url, title, meta_description, h1, issues, images_without_alt")
      .eq("id", pageId)
      .eq("audit_id", auditId)
      .maybeSingle(),
    supabaseAdmin
      .from("page_intelligence")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("audit_page_id", pageId)
      .maybeSingle(),
  ]);

  const business = tryParseBusiness(
    (bpRes.data as Record<string, unknown> | null) ?? null,
  );
  const businessStatus = (bpRes.data as { status?: string } | null)?.status ?? "missing";
  const tone = tryParseTone((tpRes.data as { profile?: unknown } | null)?.profile);
  const toneStatus = (tpRes.data as { status?: string } | null)?.status ?? "missing";
  const toneConfidence =
    (tpRes.data as { confidence_score?: number } | null)?.confidence_score ?? null;
  const page = pageRes.data as
    | {
        id: string;
        url: string;
        title: string | null;
        meta_description: string | null;
        h1: string | null;
        issues: Array<{ code: string; severity?: string; message?: string }> | null;
        images_without_alt: number;
      }
    | null;
  const pi = piRes.data as Record<string, unknown> | null;

  // ----- Resolve issue -----
  // issueId is either a plain code ("long_meta") or composite "pageId:code".
  const rawCode = issueId.includes(":") ? issueId.split(":")[1]! : issueId;
  const issueFromPage = (page?.issues ?? []).find((i) => i.code === rawCode) ?? null;
  const issueCode = issueFromPage?.code ?? rawCode ?? "unknown";
  const issueSeverity = issueFromPage?.severity ?? "medium";
  const issueMessage = issueFromPage?.message ?? "";

  // Snapshot current value relevant to the action
  let currentValue: unknown = null;
  let targetField: string | null = null;
  switch (issueCode) {
    case "long_meta":
    case "missing_meta":
      currentValue = page?.meta_description ?? null;
      targetField = "meta_description";
      break;
    case "missing_h1":
    case "bad_h1":
      currentValue = page?.h1 ?? null;
      targetField = "h1";
      break;
    case "images_no_alt":
      currentValue = page?.images_without_alt ?? 0;
      targetField = "alt_text";
      break;
    case "no_schema":
      currentValue = false;
      targetField = "jsonld";
      break;
  }

  const action = mapIssueToAction(issueCode);

  // ----- Strategy angle -----
  const angles = (business?.strategy_angles ?? []) as Array<{
    angle: string;
    isPrimary?: boolean;
    score?: number;
  }>;
  const primaryStrategyAngle =
    angles.find((a) => a.isPrimary)?.angle ??
    [...angles].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]?.angle ??
    null;

  const pageStrategyAngle = (pi?.relevant_strategy_angle as string | null) ?? null;

  // ----- Guardrails merge -----
  const claims = business?.claim_guardrails ?? {
    allowedClaims: [],
    riskyClaims: [],
    forbiddenClaims: [],
    safeAlternatives: {},
  };
  const toneForbidden = tone?.vocabulary.forbidden ?? [];
  const toneClaimForbidden = tone?.claimStyle.forbiddenClaims ?? [];
  const guardrails = {
    allowedClaims: claims.allowedClaims ?? [],
    riskyClaims: claims.riskyClaims ?? [],
    forbiddenClaims: Array.from(
      new Set([...(claims.forbiddenClaims ?? []), ...toneClaimForbidden]),
    ),
    safeAlternatives: (claims.safeAlternatives ?? {}) as Record<string, string>,
    unverifiedProofCannotBeUsedAsFact: true,
    forbiddenWords: toneForbidden,
  };

  // ----- Readiness -----
  // BP presence is based on raw row, not on strict parse — schema drift must
  // not block proposals when a profile clearly exists.
  const bpRow = bpRes.data as Record<string, unknown> | null;
  const bpExists = !!bpRow;
  const bpFullyTrusted =
    bpExists && (businessStatus === "approved" || businessStatus === "review_ready");

  const breakdown: Record<string, number> = {
    business_profile: 0,
    tone_profile: 0,
    page_intelligence: 0,
    claim_guardrails: 0,
    conversion_context: 0,
  };
  const missing: string[] = [];
  const warnings: string[] = [];

  if (bpFullyTrusted) {
    breakdown.business_profile = 2.5;
  } else if (bpExists) {
    breakdown.business_profile = 1.8;
    warnings.push(`business_profile is '${businessStatus}', not approved`);
  } else {
    missing.push("business_profile");
  }
  if (bpExists && !business) {
    warnings.push("business_profile present but failed strict schema parse");
  }

  if (tone && toneStatus === "approved") {
    breakdown.tone_profile = 2.0;
  } else if (tone) {
    breakdown.tone_profile = 1.0;
    warnings.push(`tone_profile is '${toneStatus}', not approved`);
  } else {
    missing.push("tone_profile");
  }

  if (pi) {
    breakdown.page_intelligence = 2.5 * ((pi.confidence as number) ?? 0.5);
  } else {
    missing.push("page_intelligence");
  }

  const hasClaims =
    (guardrails.allowedClaims.length > 0 || guardrails.forbiddenClaims.length > 0);
  breakdown.claim_guardrails = hasClaims ? 1.5 : 0;
  if (!hasClaims) warnings.push("no claim guardrails defined");

  const preferredCTA =
    (business?.conversion_profile?.primaryCta as string | undefined) ??
    ((bpRow?.conversion_profile as { primaryCta?: string } | undefined)?.primaryCta) ??
    (pi?.recommended_cta as string | undefined) ??
    "";
  if (preferredCTA) {
    breakdown.conversion_context = 1.5;
  } else {
    warnings.push("no preferred CTA");
  }

  const score =
    breakdown.business_profile +
    breakdown.tone_profile +
    breakdown.page_intelligence +
    breakdown.claim_guardrails +
    breakdown.conversion_context;

  // Schema/proof sensitivity — schema needs *verified* proof, not just any BP.
  const verifiedProof =
    (business?.proof_profile?.verifiedProofPoints as unknown[] | undefined) ??
    ((bpRow?.proof_profile as { verifiedProofPoints?: unknown[] } | undefined)?.verifiedProofPoints);
  const hasVerifiedProof = Array.isArray(verifiedProof) && verifiedProof.length > 0;
  if (action.actionType === "propose_schema" && !hasVerifiedProof) {
    warnings.push("propose_schema with no verified proof points");
  }

  let status: ReadinessStatus;
  // Schema is the only action we hard-block on proof — not on BP review-ready state.
  if (action.actionType === "propose_schema" && !hasVerifiedProof) {
    status = "blocked";
  } else if (action.riskLevel === "high" && !bpExists) {
    status = "blocked";
  } else if (score < 5.5) {
    status = "needs_context";
  } else if (score <= 7.5) {
    status = "needs_review";
  } else {
    status = "ready";
  }


  // ----- Compose -----
  const ctx: GrowthContext = {
    tenantId,
    auditId,
    pageId,
    issueId,
    readiness: {
      score: Math.round(score * 10) / 10,
      status,
      missing,
      warnings,
      breakdown,
    },
    business: business
      ? {
          status: businessStatus,
          confidenceScore: business.confidence_score ?? 0,
          identity: business.business_identity as Record<string, unknown>,
          offer: business.offer_profile as Record<string, unknown>,
          icp: business.icp_profile as Record<string, unknown>,
          location: business.location_profile as Record<string, unknown>,
          conversion: business.conversion_profile as Record<string, unknown>,
          proof: business.proof_profile as Record<string, unknown>,
          claims: business.claim_guardrails as Record<string, unknown>,
          primaryStrategyAngle,
        }
      : null,
    tone: tone
      ? {
          status: toneStatus,
          confidenceScore: toneConfidence,
          summary: tone.voiceIdentity.summary,
          formality: tone.localeTone.formality,
          preferredWords: tone.vocabulary.preferred,
          avoidWords: tone.vocabulary.avoid,
          forbiddenWords: tone.vocabulary.forbidden,
          goodExamples: tone.examples.good,
          badExamples: tone.examples.bad,
          ctaStyle: tone.ctaStyle.style,
        }
      : null,
    page: pi
      ? {
          pageUrl: (pi.page_url as string | null) ?? page?.url ?? null,
          pageType: (pi.page_type as string) ?? "other",
          intent: (pi.intent as string) ?? "informational",
          funnelStage: (pi.funnel_stage as string | null) ?? null,
          commercialPriority: (pi.commercial_priority as string) ?? "medium",
          seoRole: (pi.seo_role as string | null) ?? null,
          primaryTopic: (pi.primary_topic as string | null) ?? null,
          contentSummary: (pi.content_summary as string | null) ?? null,
          targetAudience: (pi.target_audience as string | null) ?? null,
          desiredAction: (pi.desired_action as string | null) ?? null,
          recommendedCTA: (pi.recommended_cta as string | null) ?? null,
          relevantStrategyAngle: pageStrategyAngle,
          localRelevance: (pi.local_relevance as Record<string, unknown>) ?? {},
          riskFlags: (pi.risk_flags as Array<Record<string, unknown>>) ?? [],
          missingPageContext:
            (pi.missing_page_context as Array<Record<string, unknown>>) ?? [],
          confidence: (pi.confidence as number) ?? 0,
        }
      : null,
    issue: {
      issueId,
      issueType: issueCode,
      severity: issueSeverity,
      message: issueMessage,
      currentValue,
      targetField,
    },
    action: {
      actionType: action.actionType,
      riskLevel: action.riskLevel,
      allowedFields: action.allowedFields,
      outputSchema: action.outputSchema,
      qualityThreshold: action.qualityThreshold,
      requiresApproval: action.requiresApproval,
      maxLength: action.maxLength,
      generationRules: action.generationRules,
    },
    guardrails,
    instructions: (() => {
      const identity = (business?.business_identity ?? bpRow?.business_identity ?? {}) as {
        language?: string;
        country?: string;
      };
      const country = (identity.country || "NL").toUpperCase();
      const language =
        identity.language ||
        (country === "US" ? "en" : "nl");
      const locale =
        tone?.localeTone.locale ||
        (country === "US" ? "en-US" : "nl-NL");
      const salesIntensity: "low" | "medium" | "high" =
        country === "US" ? "medium" : "low";
      return {
        language,
        locale,
        country,
        salesIntensity,
        preferredCTA,
        primaryAngle: pageStrategyAngle ?? primaryStrategyAngle ?? "",
        mustUse: (business?.offer_profile?.mainPromise
          ? [business.offer_profile.mainPromise as string]
          : []) as string[],
        mustAvoid: Array.from(
          new Set([...(guardrails.forbiddenClaims ?? []), ...(guardrails.forbiddenWords ?? [])]),
        ),
        shouldMentionLocation: !!(pi?.local_relevance as { isLocal?: boolean } | undefined)?.isLocal,
        shouldUseProof:
          action.actionType === "propose_schema" ||
          action.actionType === "propose_intro_or_content_expansion",
        pagePriority: (pi?.commercial_priority as string) ?? "medium",
      };
    })(),

  };

  return GrowthContextSchema.parse(ctx);
}
