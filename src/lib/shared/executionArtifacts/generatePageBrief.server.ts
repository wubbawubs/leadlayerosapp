/**
 * Page Brief Artifact Generator — server-only.
 *
 * Produces a structured page_brief for service_page and location_page
 * masterplan items. Reads all available intelligence modules. Falls back
 * gracefully when any module is missing.
 *
 * Rules:
 * - No fake proof or invented data.
 * - Respects claim guardrails (forbidden, risky, allowed).
 * - Uses verified proof points only in proofBlock.
 * - Uses market/GBP data only if the relevant module is available.
 * - WordPress mapping is informational — does not block generation.
 * - Operator review is always required before any delivery.
 */
import { z } from "zod";
import { jsonrepair } from "jsonrepair";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { llmComplete } from "@/lib/shared/llm/router.server";
import type {
  ArtifactDeliveryReadiness,
  ArtifactQualityGates,
  PageBriefArtifactPayload,
} from "./schemas";
import {
  PageBriefArtifactPayloadSchema,
  type PageBriefWordpressMapping,
} from "./schemas";
import { evaluateInputQuality } from "@/lib/shared/masterplan/inputQuality";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

// ------------------------------------------------------------------
// LLM output schema (strict subset — validated then promoted to payload)
// ------------------------------------------------------------------

const LLMOutputSchema = z.object({
  h1: z.string().min(1).max(120),
  metaTitle: z.string().min(1).max(70),
  metaDescription: z.string().min(1).max(160),
  targetSlug: z
    .string()
    .min(1)
    .max(150)
    .regex(/^[a-z0-9-/]+$/, "Slug must be lowercase alphanumeric with hyphens/slashes only"),
  parentSlug: z.string().max(150).nullable().optional(),
  introBlock: z.string().min(1).max(1200),
  serviceSections: z
    .array(z.object({ heading: z.string().max(160), body: z.string().max(800) }))
    .min(1)
    .max(6),
  faqBlock: z
    .array(z.object({ question: z.string().max(250), answer: z.string().max(500) }))
    .max(6)
    .default([]),
  proofBlock: z.object({
    items: z.array(z.string().max(250)).max(8).default([]),
    missingProof: z.array(z.string().max(250)).max(8).default([]),
  }),
  ctaBlock: z.object({
    primary: z.string().min(1).max(100),
    secondary: z.string().max(100).nullable().optional(),
    placement: z.string().min(1).max(250),
  }),
  schemaRecommendation: z.object({
    type: z.string().min(1).max(100),
    suggestedFields: z.record(z.string()),
    missingProofForSchema: z.array(z.string().max(250)).max(6).default([]),
  }),
  internalLinkTargets: z
    .array(
      z.object({
        anchorText: z.string().max(100),
        targetSlug: z.string().max(150),
        rationale: z.string().max(250),
      }),
    )
    .max(6)
    .default([]),
  operatorNotes: z.string().max(1000).default(""),
  successMetric: z.string().max(300).default(""),
  assumptions: z.array(z.string().max(300)).max(10).default([]),
  riskFlags: z.array(z.string().max(300)).max(10).default([]),
  missingContext: z.array(z.string().max(300)).max(10).default([]),
});
type LLMOutput = z.infer<typeof LLMOutputSchema>;

// ------------------------------------------------------------------
// Context loader
// ------------------------------------------------------------------

interface PageBriefContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  goal: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bp: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tone: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pageIntelligence: Array<Record<string, any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  marketScan: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  competitorScan: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gbpProfile: Record<string, any> | null;
  wpMapping: PageBriefWordpressMapping | null;
}

async function loadContext(tenantId: string, itemId: string): Promise<PageBriefContext> {
  const [itemRes, goalRes, bpRes, toneRes, piRes, marketRes, compRes, gbpRes] =
    await Promise.all([
      admin.from("masterplan_items").select("*").eq("id", itemId).eq("tenant_id", tenantId).maybeSingle(),
      admin.from("growth_goals").select("*").eq("tenant_id", tenantId).eq("status", "active").maybeSingle(),
      admin.from("business_profiles_v2").select("*").eq("tenant_id", tenantId).maybeSingle(),
      admin.from("tone_profiles").select("profile, status, language").eq("tenant_id", tenantId).maybeSingle(),
      admin.from("page_intelligence").select("page_url, page_type, intent, commercial_priority, primary_topic, content_summary, recommended_cta, missing_page_context, risk_flags").eq("tenant_id", tenantId).limit(20),
      admin.from("market_scans").select("summary, services, locations, vertical").eq("tenant_id", tenantId).in("status", ["completed", "stale"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("competitor_scans").select("summary").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("gbp_profiles").select("business_name, rating, review_count, completeness_score, gaps, recommendations").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

  // Resolve WP mapping for this item if inventory exists
  let wpMapping: PageBriefWordpressMapping | null = null;
  const { data: conn } = await admin
    .from("wordpress_connections")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (conn?.id) {
    const { data: mapping } = await admin
      .from("wordpress_page_mappings")
      .select("id, mapping_type, inventory_id")
      .eq("wordpress_connection_id", conn.id)
      .eq("masterplan_item_id", itemId)
      .maybeSingle();

    if (mapping) {
      let existingSlug: string | null = null;
      let existingTitle: string | null = null;
      if (mapping.inventory_id) {
        const { data: inv } = await admin
          .from("wordpress_site_inventory")
          .select("slug, title")
          .eq("id", mapping.inventory_id)
          .maybeSingle();
        existingSlug = inv?.slug ?? null;
        existingTitle = inv?.title ?? null;
      }
      const mt = mapping.mapping_type as string;
      wpMapping = {
        status: mt as PageBriefWordpressMapping["status"],
        inventoryItemId: mapping.inventory_id ?? null,
        existingSlug,
        existingTitle,
        recommendedAction:
          mt === "existing_page"
            ? "optimize_existing"
            : mt === "missing_page"
              ? "create_new"
              : mt === "candidate_match"
                ? "needs_operator_validation"
                : "not_applicable",
      };
    }
  }

  return {
    item: itemRes.data ?? {},
    goal: goalRes.data ?? null,
    bp: bpRes.data ?? null,
    tone: toneRes.data ?? null,
    pageIntelligence: (piRes.data ?? []) as Array<Record<string, unknown>>,
    marketScan: marketRes.data ?? null,
    competitorScan: compRes.data ?? null,
    gbpProfile: gbpRes.data ?? null,
    wpMapping,
  };
}

// ------------------------------------------------------------------
// Prompt builder
// ------------------------------------------------------------------

function buildSystemPrompt(): string {
  return [
    "You are a senior local SEO and lead generation strategist.",
    "You generate structured page briefs for local service businesses.",
    "",
    "CRITICAL RULES:",
    "- Output ONLY valid JSON. No markdown. No explanations.",
    "- Never invent proof, certifications, guarantees, or awards that are not in the context.",
    "- Never fabricate review counts, star ratings, or client testimonials.",
    "- If proof is missing from the context, note it in missingProof and missingContext.",
    "- Respect forbidden claims: do not use any claim listed as forbidden.",
    "- Use risky claims only in operator notes, never in page copy.",
    "- Target slug must be lowercase, hyphen-separated, no special characters.",
    "- Write page copy intent and structure — not final published copy.",
    "- Operator review is required before any content goes live.",
  ].join("\n");
}

function buildPrompt(ctx: PageBriefContext): string {
  const { item, goal, bp, tone, pageIntelligence, marketScan, competitorScan, gbpProfile, wpMapping } = ctx;
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const pageType = (item.type as string) === "location_page" ? "location_page" : "service_page";
  const targetService = typeof meta.service === "string" ? meta.service : typeof meta.linkedService === "string" ? meta.linkedService : null;
  const targetLocation = typeof meta.location === "string" ? meta.location : typeof meta.linkedLocation === "string" ? meta.linkedLocation : null;

  const lines: string[] = [];
  lines.push(`TASK: Generate a page_brief for a ${pageType === "location_page" ? "local landing page" : "service page"}.`);
  lines.push("");
  lines.push("MASTERPLAN ITEM:");
  lines.push(`- Title: ${item.title ?? "?"}`);
  lines.push(`- Type: ${item.type}`);
  if (item.description) lines.push(`- Description: ${item.description}`);
  if (item.reason) lines.push(`- Strategic reason: ${item.reason}`);
  if (targetService) lines.push(`- Target service: ${targetService}`);
  if (targetLocation) lines.push(`- Target location: ${targetLocation}`);
  lines.push("");

  if (goal) {
    lines.push("GROWTH GOAL:");
    lines.push(`- Target: ${goal.target_count ?? "?"} ${goal.target_type ?? "clients"}/month`);
    if (Array.isArray(goal.service_focus) && goal.service_focus.length > 0) {
      lines.push(`- Service focus: ${goal.service_focus.slice(0, 5).join(", ")}`);
    }
    if (Array.isArray(goal.locations) && goal.locations.length > 0) {
      lines.push(`- Locations: ${goal.locations.slice(0, 5).join(", ")}`);
    }
    lines.push("");
  }

  if (bp) {
    const id = (bp.business_identity ?? {}) as Record<string, unknown>;
    const offer = (bp.offer_profile ?? {}) as Record<string, unknown>;
    const conv = (bp.conversion_profile ?? {}) as Record<string, unknown>;
    const proof = (bp.proof_profile ?? {}) as Record<string, unknown>;
    const guardrails = (bp.claim_guardrails ?? {}) as Record<string, unknown>;
    const loc = (bp.location_profile ?? {}) as Record<string, unknown>;

    lines.push("BUSINESS:");
    if (id.businessName || id.brandName) lines.push(`- Brand: ${id.brandName ?? id.businessName}`);
    if (id.vertical) lines.push(`- Vertical: ${id.vertical}`);
    if (offer.primaryOffer) lines.push(`- Primary offer: ${offer.primaryOffer}`);
    if (offer.mainPromise) lines.push(`- Core promise: ${offer.mainPromise}`);
    if (offer.uniqueValueProposition) lines.push(`- UVP: ${offer.uniqueValueProposition}`);
    if (conv.primaryCta) lines.push(`- Preferred CTA: ${conv.primaryCta}`);
    if (Array.isArray(loc.serviceAreas) && loc.serviceAreas.length > 0) {
      lines.push(`- Service areas: ${(loc.serviceAreas as string[]).slice(0, 5).join(", ")}`);
    }
    const verified = Array.isArray(proof.verifiedProofPoints) ? (proof.verifiedProofPoints as string[]) : [];
    if (verified.length > 0) lines.push(`- Verified proof: ${verified.slice(0, 5).join(" | ")}`);
    else lines.push("- Verified proof: NONE — do not invent proof claims.");
    if (Array.isArray(guardrails.forbiddenClaims) && (guardrails.forbiddenClaims as unknown[]).length > 0) {
      lines.push(`- FORBIDDEN CLAIMS (never use): ${(guardrails.forbiddenClaims as string[]).join(", ")}`);
    }
    if (Array.isArray(guardrails.riskyClaims) && (guardrails.riskyClaims as unknown[]).length > 0) {
      lines.push(`- RISKY CLAIMS (operator notes only): ${(guardrails.riskyClaims as string[]).join(", ")}`);
    }
    lines.push("");
  }

  if (tone?.profile) {
    const p = tone.profile as Record<string, unknown>;
    const voice = (p.voiceIdentity ?? {}) as Record<string, unknown>;
    const vocab = (p.vocabulary ?? {}) as Record<string, unknown>;
    lines.push("TONE:");
    if (voice.summary) lines.push(`- Voice: ${String(voice.summary).slice(0, 200)}`);
    if (Array.isArray(vocab.preferred) && (vocab.preferred as string[]).length > 0) {
      lines.push(`- Preferred words: ${(vocab.preferred as string[]).slice(0, 8).join(", ")}`);
    }
    if (Array.isArray(vocab.forbidden) && (vocab.forbidden as string[]).length > 0) {
      lines.push(`- Avoid words: ${(vocab.forbidden as string[]).slice(0, 8).join(", ")}`);
    }
    lines.push("");
  }

  if (marketScan?.summary) {
    const s = marketScan.summary as Record<string, unknown>;
    if (s.topServices || s.topLocations || s.totalAddressableVolume) {
      lines.push("MARKET DATA (informational):");
      if (s.topServices) lines.push(`- Top services: ${JSON.stringify(s.topServices).slice(0, 150)}`);
      if (s.topLocations) lines.push(`- Top locations: ${JSON.stringify(s.topLocations).slice(0, 150)}`);
      lines.push("");
    }
  }

  if (competitorScan?.summary) {
    const s = competitorScan.summary as Record<string, unknown>;
    if (s.gaps) lines.push(`COMPETITOR GAPS: ${JSON.stringify(s.gaps).slice(0, 200)}`);
    lines.push("");
  }

  if (gbpProfile) {
    lines.push("GBP PROFILE:");
    if (gbpProfile.business_name) lines.push(`- Business: ${gbpProfile.business_name}`);
    if (gbpProfile.rating) lines.push(`- Rating: ${gbpProfile.rating} (${gbpProfile.review_count ?? "?"} reviews) — VERIFIED, use only if quoting directly`);
    if (gbpProfile.completeness_score) lines.push(`- GBP completeness: ${gbpProfile.completeness_score}`);
    lines.push("");
  }

  if (pageType === "service_page" && pageIntelligence.length > 0) {
    const relevant = pageIntelligence.filter(
      (p) => p.page_type === "service" || p.intent === "commercial" || p.commercial_priority === "high" || p.commercial_priority === "critical",
    ).slice(0, 3);
    if (relevant.length > 0) {
      lines.push("EXISTING HIGH-INTENT PAGES (context):");
      for (const p of relevant) {
        lines.push(`- ${p.page_url ?? "?"} (${p.page_type}, ${p.intent}, CTA: ${p.recommended_cta ?? "?"})`);
        if (p.content_summary) lines.push(`  Summary: ${String(p.content_summary).slice(0, 100)}`);
      }
      lines.push("");
    }
  }

  if (wpMapping) {
    lines.push("WORDPRESS MAPPING:");
    lines.push(`- Status: ${wpMapping.status}`);
    if (wpMapping.existingSlug) lines.push(`- Existing page slug: ${wpMapping.existingSlug}`);
    if (wpMapping.existingTitle) lines.push(`- Existing page title: ${wpMapping.existingTitle}`);
    lines.push(`- Recommended action: ${wpMapping.recommendedAction}`);
    if (wpMapping.status === "existing_page") {
      lines.push("  → This page exists. Generate optimization/rebuild brief, not a new page.");
    } else if (wpMapping.status === "missing_page") {
      lines.push("  → No matching WP page found. Generate new page creation brief.");
    } else if (wpMapping.status === "candidate_match") {
      lines.push("  → A candidate match was found but needs operator validation.");
    }
    lines.push("");
  }

  lines.push("OUTPUT: Strict JSON matching this schema exactly:");
  lines.push(JSON.stringify({
    h1: "string (max 120 chars)",
    metaTitle: "string (max 70 chars)",
    metaDescription: "string (max 160 chars)",
    targetSlug: "string (e.g. 'services/ac-repair-dallas' — lowercase, hyphens only)",
    parentSlug: "string or null (parent page slug if nested)",
    introBlock: "string (100–200 words, first paragraph, promise-first)",
    serviceSections: [{ heading: "string", body: "string (80–150 words each)" }],
    faqBlock: [{ question: "string", answer: "string (50–100 words each, 3–5 items)" }],
    proofBlock: {
      items: ["string (verified proof only — licenses, certifications, guarantees from context)"],
      missingProof: ["string (proof we need but don't have)"],
    },
    ctaBlock: {
      primary: "string (CTA button text, max 60 chars)",
      secondary: "string or null",
      placement: "string (where to place: above fold, after each section, etc.)",
    },
    schemaRecommendation: {
      type: "string (LocalBusiness|Service|FAQPage — pick most specific)",
      suggestedFields: { fieldName: "fieldValue" },
      missingProofForSchema: ["string (what proof we need to fill this schema)"],
    },
    internalLinkTargets: [{ anchorText: "string", targetSlug: "string", rationale: "string" }],
    operatorNotes: "string (QA notes, risky claims to validate, proof gaps)",
    successMetric: "string (how operator measures if this page is working)",
    assumptions: ["string (things we assumed that need validation)"],
    riskFlags: ["string (claim risks, proof gaps, competitor conflicts)"],
    missingContext: ["string (data we don't have that would improve this brief)"],
  }));
  lines.push("Write no keys not in this schema. Output ONLY the JSON object.");

  return lines.join("\n");
}

// ------------------------------------------------------------------
// Fallback: deterministic brief when LLM fails
// ------------------------------------------------------------------

function buildFallbackBrief(ctx: PageBriefContext): PageBriefArtifactPayload {
  const meta = (ctx.item.metadata ?? {}) as Record<string, unknown>;
  const targetService =
    typeof meta.service === "string" ? meta.service :
    typeof meta.linkedService === "string" ? meta.linkedService : null;
  const targetLocation =
    typeof meta.location === "string" ? meta.location :
    typeof meta.linkedLocation === "string" ? meta.linkedLocation : null;
  const id = (ctx.bp?.business_identity ?? {}) as Record<string, unknown>;
  const businessName = (id.businessName ?? id.brandName ?? "this business") as string;
  const pageType = (ctx.item.type as string) === "location_page" ? "location_page" : "service_page" as const;

  const service = targetService ?? ctx.item.title ?? "Service";
  const location = targetLocation ?? "";
  const slug = [service, location]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return {
    pageType,
    targetService,
    targetLocation,
    targetSlug: `services/${slug}`,
    parentSlug: null,
    h1: location ? `${service} in ${location}` : service,
    metaTitle: location ? `${service} in ${location} — ${businessName}` : `${service} — ${businessName}`,
    metaDescription: `Looking for ${service.toLowerCase()}${location ? ` in ${location}` : ""}? Contact ${businessName}. [Operator: add offer and CTA here.]`,
    introBlock: `[Operator: write 100–150 word intro for ${service}${location ? ` serving ${location}` : ""}. Open with the client problem, state the solution clearly, and close with the primary CTA.]`,
    serviceSections: [
      {
        heading: `Our ${service} service`,
        body: "[Operator: describe the service in detail. What is included? What does the client receive? What makes this different from competitors?]",
      },
    ],
    faqBlock: [
      {
        question: `How quickly can you respond to a ${service.toLowerCase()} request?`,
        answer: "[Operator: state response time and availability — e.g. same-day, 24/7, or next-day.]",
      },
    ],
    proofBlock: {
      items: [],
      missingProof: [
        "License number or certification number",
        "Verified review count and rating",
        "Years in business",
        "Service area radius or coverage",
      ],
    },
    ctaBlock: {
      primary: "Request a free quote",
      secondary: null,
      placement: "Above the fold and after each service section",
    },
    schemaRecommendation: {
      type: "LocalBusiness",
      suggestedFields: {
        "@type": "LocalBusiness",
        name: businessName,
        description: `${service} services`,
        areaServed: location || "[add service area]",
      },
      missingProofForSchema: ["telephone", "address", "openingHours", "priceRange"],
    },
    internalLinkTargets: [],
    wordpressMapping: ctx.wpMapping ?? {
      status: "no_inventory",
      inventoryItemId: null,
      existingSlug: null,
      existingTitle: null,
      recommendedAction: "not_applicable",
    },
    operatorNotes: "LLM generation failed — fallback brief. Complete all [Operator: ...] placeholders before review.",
    successMetric: "Page receives qualified inbound leads from target service + location query",
    assumptions: ["Business profile is complete and verified", "Service and location are confirmed priorities"],
    missingContext: [
      "Verified proof points (licenses, certifications, guarantees)",
      "Response time and availability",
      "Pricing or estimate approach",
    ],
    riskFlags: ["generator:llm_fallback — review all copy before approval"],
  };
}

// ------------------------------------------------------------------
// Main generator
// ------------------------------------------------------------------

export interface GeneratePageBriefResult {
  payload: PageBriefArtifactPayload;
  qualityGates: ArtifactQualityGates;
  deliveryReadiness: ArtifactDeliveryReadiness;
  riskFlags: string[];
  missingContext: string[];
  generatedFrom: Record<string, unknown>;
  modelUsed: string;
  usedFallback: boolean;
}

export async function generatePageBriefArtifact(
  tenantId: string,
  masterplanItemId: string,
  gates: ArtifactQualityGates,
  delivery: ArtifactDeliveryReadiness,
): Promise<GeneratePageBriefResult> {
  const ctx = await loadContext(tenantId, masterplanItemId);

  const inputQuality = evaluateInputQuality({
    goal: ctx.goal,
    bp: ctx.bp,
    itemTitle: ctx.item.title,
    itemDescription: ctx.item.description,
  });

  const riskFlags: string[] = [];
  const missingContext: string[] = [];

  if (!inputQuality.ok) {
    inputQuality.issues.forEach((i) => missingContext.push(i.message));
    inputQuality.riskFlags.forEach((r) => riskFlags.push(r));
  }

  let payload: PageBriefArtifactPayload;
  let modelUsed = "n/a";
  let usedFallback = false;

  try {
    const result = await llmComplete({
      task: "default",
      system: buildSystemPrompt(),
      prompt: buildPrompt(ctx),
      temperature: 0.3,
      maxTokens: 3500,
      jsonMode: true,
      timeoutMs: 55_000,
    });
    modelUsed = result.model;

    // Parse + validate
    let parsed: LLMOutput;
    try {
      const raw = JSON.parse(result.text);
      parsed = LLMOutputSchema.parse(raw);
    } catch {
      // Attempt repair
      try {
        const repaired = JSON.parse(jsonrepair(result.text));
        parsed = LLMOutputSchema.parse(repaired);
      } catch (repairErr) {
        throw new Error(
          `LLM output failed schema validation: ${repairErr instanceof Error ? repairErr.message : String(repairErr)}`,
        );
      }
    }

    const meta = (ctx.item.metadata ?? {}) as Record<string, unknown>;

    payload = PageBriefArtifactPayloadSchema.parse({
      pageType: ctx.item.type === "location_page" ? "location_page" : "service_page",
      targetService: typeof meta.service === "string" ? meta.service : typeof meta.linkedService === "string" ? meta.linkedService : null,
      targetLocation: typeof meta.location === "string" ? meta.location : typeof meta.linkedLocation === "string" ? meta.linkedLocation : null,
      ...parsed,
      wordpressMapping: ctx.wpMapping ?? {
        status: "no_inventory",
        inventoryItemId: null,
        existingSlug: null,
        existingTitle: null,
        recommendedAction: "not_applicable",
      },
      missingContext: [...(parsed.missingContext ?? []), ...missingContext].slice(0, 10),
      riskFlags: [...(parsed.riskFlags ?? []), ...riskFlags].slice(0, 10),
    });
  } catch (e) {
    console.error("[generatePageBrief] generation error", e instanceof Error ? e.message : e);
    riskFlags.push("generator:llm_fallback");
    payload = buildFallbackBrief(ctx);
    payload.missingContext = [...payload.missingContext, ...missingContext];
    payload.riskFlags = [...payload.riskFlags, ...riskFlags];
    usedFallback = true;
  }

  const generatedFrom: Record<string, unknown> = {
    masterplanItemId,
    goalId: ctx.goal?.id ?? null,
    bpAvailable: !!ctx.bp,
    toneAvailable: !!ctx.tone,
    pageIntelligenceCount: ctx.pageIntelligence.length,
    marketScanAvailable: !!ctx.marketScan,
    competitorScanAvailable: !!ctx.competitorScan,
    gbpAvailable: !!ctx.gbpProfile,
    wordpressMappingStatus: ctx.wpMapping?.status ?? "no_inventory",
    inputQualityOk: inputQuality.ok,
    generatedAt: new Date().toISOString(),
  };

  return {
    payload,
    qualityGates: gates,
    deliveryReadiness: delivery,
    riskFlags: [...new Set([...riskFlags, ...payload.riskFlags])].slice(0, 10),
    missingContext: [...new Set([...missingContext, ...payload.missingContext])].slice(0, 10),
    generatedFrom,
    modelUsed,
    usedFallback,
  };
}
