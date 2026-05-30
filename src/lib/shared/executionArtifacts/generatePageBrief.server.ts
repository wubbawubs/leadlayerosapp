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
  primaryKeyword: z.string().max(120).nullable().optional(),
  keywordCluster: z.array(z.string().max(120)).max(20).default([]),
  h1: z.string().min(1).max(120),
  metaTitle: z.string().min(1).max(70),
  metaDescription: z.string().min(1).max(160),
  targetSlug: z
    .string()
    .min(1)
    .max(150)
    .regex(/^[a-z0-9-/]+$/, "Slug must be lowercase alphanumeric with hyphens/slashes only"),
  parentSlug: z.string().max(150).nullable().optional(),
  introBlock: z.string().min(1).max(2000),
  serviceSections: z
    .array(z.object({ heading: z.string().max(160), body: z.string().max(1500) }))
    .min(1)
    .max(8),
  faqBlock: z
    .array(z.object({ question: z.string().max(250), answer: z.string().max(700) }))
    .max(8)
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

interface KeywordClusterContext {
  primaryKeyword: string | null;
  representativeKeywords: string[];
  totalVolume: number | null;
  averageDifficulty: number | null;
  opportunityScore: number | null;
  intent: string | null;
  clusterName: string;
}

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
  keywordCluster: KeywordClusterContext | null;
}

async function loadContext(tenantId: string, itemId: string): Promise<PageBriefContext> {
  const [itemRes, goalRes, bpRes, toneRes, piRes, marketRes, compRes, gbpRes] =
    await Promise.all([
      admin.from("masterplan_items").select("*").eq("id", itemId).eq("tenant_id", tenantId).maybeSingle(),
      admin.from("growth_goals").select("*").eq("tenant_id", tenantId).eq("status", "active").maybeSingle(),
      admin.from("business_profiles_v2").select("*").eq("tenant_id", tenantId).maybeSingle(),
      admin.from("tone_profiles").select("profile, status, language").eq("tenant_id", tenantId).maybeSingle(),
      admin.from("page_intelligence").select("page_url, page_type, intent, commercial_priority, primary_topic, target_keyword, content_summary, recommended_cta, missing_page_context, risk_flags").eq("tenant_id", tenantId).limit(20),
      admin.from("market_scans").select("summary, services, locations, vertical").eq("tenant_id", tenantId).in("status", ["completed", "stale"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("competitor_scans").select("summary").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("gbp_profiles").select("business_name, phone, address, rating, review_count, completeness_score, gaps, recommendations, service_area").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
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

  // Load keyword clusters — ordered by opportunity_score, up to 10.
  // Match against targetService/targetLocation from the item metadata.
  const meta = (itemRes.data?.metadata ?? {}) as Record<string, unknown>;
  const targetService = typeof meta.service === "string" ? meta.service : typeof meta.linkedService === "string" ? meta.linkedService : null;
  const targetLocation = typeof meta.location === "string" ? meta.location : typeof meta.linkedLocation === "string" ? meta.linkedLocation : null;

  let keywordCluster: KeywordClusterContext | null = null;
  const { data: clusterRows } = await admin
    .from("market_demand_clusters")
    .select("cluster_name, service, location, intent, total_volume, average_difficulty, opportunity_score, representative_keywords")
    .eq("tenant_id", tenantId)
    .order("opportunity_score", { ascending: false })
    .limit(15);

  if (clusterRows && clusterRows.length > 0) {
    // Find the best matching cluster for this item's service + location
    const clusters = clusterRows as Array<{
      cluster_name: string;
      service: string | null;
      location: string | null;
      intent: string | null;
      total_volume: number | null;
      average_difficulty: number | null;
      opportunity_score: number | null;
      representative_keywords: unknown;
    }>;

    const norm = (s: unknown) => typeof s === "string" ? s.toLowerCase().trim() : "";
    const sNorm = norm(targetService);
    const lNorm = norm(targetLocation);

    // Score each cluster: 2 pts for service match, 1 pt for location match
    const scored = clusters.map((c) => {
      let score = 0;
      if (sNorm && norm(c.service).includes(sNorm)) score += 2;
      else if (sNorm && sNorm.includes(norm(c.service)) && norm(c.service).length > 3) score += 1;
      if (lNorm && norm(c.location).includes(lNorm)) score += 2;
      else if (lNorm && lNorm.includes(norm(c.location)) && norm(c.location).length > 2) score += 1;
      return { cluster: c, score };
    });

    const best = scored.sort((a, b) => b.score - a.score)[0];
    if (best && best.score > 0) {
      const kws = Array.isArray(best.cluster.representative_keywords)
        ? (best.cluster.representative_keywords as string[]).filter((k) => typeof k === "string")
        : [];
      keywordCluster = {
        primaryKeyword: kws[0] ?? best.cluster.cluster_name,
        representativeKeywords: kws.slice(0, 15),
        totalVolume: best.cluster.total_volume,
        averageDifficulty: best.cluster.average_difficulty,
        opportunityScore: best.cluster.opportunity_score,
        intent: best.cluster.intent,
        clusterName: best.cluster.cluster_name,
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
    keywordCluster,
  };
}

// ------------------------------------------------------------------
// Prompt builder
// ------------------------------------------------------------------

function buildSystemPrompt(): string {
  return [
    "You are a senior local SEO copywriter and conversion strategist.",
    "You write final, publication-ready page copy for local service business websites.",
    "",
    "CRITICAL RULES:",
    "- Output ONLY valid JSON. No markdown. No explanations outside the JSON.",
    "- Write FINAL PUBLISHABLE COPY — this goes directly to WordPress for operator review. Not a brief, not an outline.",
    "- PRIMARY KEYWORD: use the provided primaryKeyword verbatim in the H1, meta title, and the first sentence of introBlock. Use cluster keywords naturally throughout.",
    "- CONTENT DEPTH: introBlock 200–280 words. Each service section 200–280 words. FAQ answers 100–150 words each. Target 1,400–1,800 words total.",
    "- Never invent proof, certifications, guarantees, or awards not present in the context.",
    "- Never fabricate review counts, star ratings, or client testimonials.",
    "- If proof is missing, note it in missingProof and missingContext — write around it without fabricating.",
    "- Respect forbidden claims: never use any claim listed as forbidden.",
    "- Use risky claims only in operatorNotes, never in page copy.",
    "- Slug must be lowercase, hyphen-separated, no special characters.",
    "- Schema fields must be populated with real data from the context. No placeholders like '[add phone]'.",
    "- Operator review is required before publication.",
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

  // Keyword cluster — the most important signal for on-page SEO targeting
  const { keywordCluster } = ctx;
  if (keywordCluster) {
    lines.push("KEYWORD CLUSTER (DataForSEO — use for targeting):");
    lines.push(`- PRIMARY KEYWORD: "${keywordCluster.primaryKeyword ?? keywordCluster.clusterName}"`);
    lines.push(`  → Use this exact phrase in H1, meta title, and the first sentence of introBlock.`);
    if (keywordCluster.representativeKeywords.length > 1) {
      lines.push(`- Cluster keywords (use naturally in copy): ${keywordCluster.representativeKeywords.slice(1, 12).join(", ")}`);
    }
    if (keywordCluster.totalVolume != null) lines.push(`- Monthly search volume: ${keywordCluster.totalVolume.toLocaleString()}`);
    if (keywordCluster.averageDifficulty != null) lines.push(`- Keyword difficulty: ${keywordCluster.averageDifficulty.toFixed(0)}/100`);
    if (keywordCluster.intent) lines.push(`- Search intent: ${keywordCluster.intent}`);
    lines.push("");
  } else {
    lines.push("KEYWORD TARGETING:");
    lines.push(`- No keyword cluster data available. Infer the primary keyword from: ${targetService ?? "service"} + ${targetLocation ?? "location"}.`);
    lines.push(`- Use "primaryKeyword" field to output the phrase you chose.`);
    lines.push("");
  }

  if (pageType === "service_page" && pageIntelligence.length > 0) {
    const relevant = pageIntelligence.filter(
      (p) => p.page_type === "service" || p.intent === "commercial" || p.commercial_priority === "high" || p.commercial_priority === "critical",
    ).slice(0, 3);
    if (relevant.length > 0) {
      lines.push("EXISTING HIGH-INTENT PAGES (context — avoid keyword cannibalization):");
      for (const p of relevant) {
        lines.push(`- ${p.page_url ?? "?"} (type: ${p.page_type}, intent: ${p.intent}${p.target_keyword ? `, targets: "${p.target_keyword}"` : ""}, CTA: ${p.recommended_cta ?? "?"})`);
        if (p.content_summary) lines.push(`  Summary: ${String(p.content_summary).slice(0, 120)}`);
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
    primaryKeyword: "string — the exact keyword phrase you targeted (e.g. 'AC repair Dallas TX')",
    keywordCluster: ["string — other keyword variations you wove into the copy naturally"],
    h1: "string (max 120 chars — must contain primaryKeyword verbatim or close variant)",
    metaTitle: "string (max 70 chars — primaryKeyword near the start, city name, business name)",
    metaDescription: "string (max 160 chars — include primaryKeyword, clear CTA, location)",
    targetSlug: "string (e.g. 'services/ac-repair-dallas' — lowercase, hyphens only)",
    parentSlug: "string or null (parent page slug if nested)",
    introBlock: "string (200–280 words — primaryKeyword in first sentence, problem statement, solution promise, local authority signal, CTA teaser)",
    serviceSections: [{ heading: "string (H2 — use keyword variations)", body: "string (200–280 words each — specific, substantive, no generic filler. 4–6 sections.)" }],
    faqBlock: [{ question: "string (use keyword variations in questions)", answer: "string (100–150 words each, 4–6 items — answer completely, include local signals)" }],
    proofBlock: {
      items: ["string (verified proof only — from context. Skip if not available.)"],
      missingProof: ["string (proof that would strengthen this page — operator must source)"],
    },
    ctaBlock: {
      primary: "string (CTA button text, max 60 chars — action-oriented)",
      secondary: "string or null",
      placement: "string (above fold, after intro, after each section, footer)",
    },
    schemaRecommendation: {
      type: "string (LocalBusiness|Service|FAQPage|HomeAndConstructionBusiness — pick most specific)",
      suggestedFields: { "name": "real business name from context", "telephone": "real phone from GBP if available", "address": "real address from GBP if available", "areaServed": "real service area from context", "description": "concise service description" },
      missingProofForSchema: ["string (fields that need operator verification)"],
    },
    internalLinkTargets: [{ anchorText: "string", targetSlug: "string", rationale: "string" }],
    operatorNotes: "string (QA notes: risky claims to validate, proof gaps, content assumptions, schema fields needing verification)",
    successMetric: "string (measurable outcome: e.g. 'page ranks top 5 for [primaryKeyword] and converts at X% via call tracking')",
    assumptions: ["string (assumptions made that need operator validation)"],
    riskFlags: ["string (claim risks, proof gaps, cannibalization risks)"],
    missingContext: ["string (data that would improve quality — be specific)"],
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

  const primaryKeyword = location ? `${service} ${location}` : service;
  return {
    pageType,
    targetService,
    targetLocation,
    primaryKeyword,
    keywordCluster: ctx.keywordCluster?.representativeKeywords ?? [],
    keywordVolume: ctx.keywordCluster?.totalVolume ?? null,
    keywordDifficulty: ctx.keywordCluster?.averageDifficulty ?? null,
    targetSlug: `services/${slug}`,
    parentSlug: null,
    h1: location ? `${service} in ${location}` : service,
    metaTitle: location ? `${service} in ${location} — ${businessName}` : `${service} — ${businessName}`,
    metaDescription: `Looking for ${service.toLowerCase()}${location ? ` in ${location}` : ""}? Contact ${businessName}. [Operator: add offer and CTA here.]`,
    introBlock: `[Operator: write 200–280 word intro targeting "${primaryKeyword}". Start with the client problem and use "${primaryKeyword}" in the first sentence. State your solution and close with the primary CTA.]`,
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
    schemaRecommendation: mergeSchemaWithGbp(
      {
        type: "LocalBusiness",
        suggestedFields: {
          "@type": "LocalBusiness",
          name: businessName,
          description: `${service} services`,
          areaServed: location || "",
        },
        missingProofForSchema: ["openingHours", "priceRange"],
      },
      ctx.gbpProfile,
      ctx.bp,
    ),
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
// Schema auto-population from GBP + BP
// Merges LLM-generated schema fields with verified real data.
// ------------------------------------------------------------------

function mergeSchemaWithGbp(
  llmSchema: { type: string; suggestedFields: Record<string, string>; missingProofForSchema: string[] } | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gbp: Record<string, any> | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bp: Record<string, any> | null,
): { type: string; suggestedFields: Record<string, string>; missingProofForSchema: string[] } {
  const base: Record<string, string> = { ...(llmSchema?.suggestedFields ?? {}) };
  const missingProof: string[] = [...(llmSchema?.missingProofForSchema ?? [])];

  // Auto-populate from GBP profile (verified real data)
  if (gbp?.business_name && !base.name) base.name = gbp.business_name;
  if (gbp?.phone && !base.telephone) base.telephone = gbp.phone;
  if (gbp?.address && !base.address) {
    // Keep as string for schema.org streetAddress approximation
    base.address = gbp.address;
  }

  // Auto-populate from BP location profile
  const loc = (bp?.location_profile ?? {}) as Record<string, unknown>;
  if (loc.primaryLocation && !base.areaServed) {
    base.areaServed = loc.primaryLocation as string;
  } else if (Array.isArray(loc.serviceAreas) && (loc.serviceAreas as string[]).length > 0 && !base.areaServed) {
    base.areaServed = (loc.serviceAreas as string[]).slice(0, 3).join(", ");
  }

  // Auto-populate business name from BP if GBP not available
  if (!base.name) {
    const id = (bp?.business_identity ?? {}) as Record<string, unknown>;
    const name = typeof id.brandName === "string" ? id.brandName : typeof id.businessName === "string" ? id.businessName : null;
    if (name) base.name = name;
  }

  // Flag what still needs operator verification
  if (!base.telephone) missingProof.push("telephone — enter phone number in schema (not auto-filled, GBP data unavailable)");
  if (!base.address) missingProof.push("address — enter street address in schema (not auto-filled)");

  // Remove placeholder values that slipped through
  for (const [k, v] of Object.entries(base)) {
    if (typeof v === "string" && (v.includes("[add ") || v.includes("[enter ") || v === "")) {
      delete base[k];
      if (!missingProof.some((m) => m.startsWith(k))) {
        missingProof.push(`${k} — needs operator input`);
      }
    }
  }

  return {
    type: llmSchema?.type ?? "LocalBusiness",
    suggestedFields: base,
    missingProofForSchema: missingProof.slice(0, 6),
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
      maxTokens: 6000,
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

    // Prefer LLM-generated primaryKeyword; fall back to cluster data
    const resolvedPrimaryKeyword =
      parsed.primaryKeyword ??
      ctx.keywordCluster?.primaryKeyword ??
      null;
    const resolvedKeywordCluster =
      parsed.keywordCluster?.length
        ? parsed.keywordCluster
        : (ctx.keywordCluster?.representativeKeywords ?? []);

    payload = PageBriefArtifactPayloadSchema.parse({
      pageType: ctx.item.type === "location_page" ? "location_page" : "service_page",
      targetService: typeof meta.service === "string" ? meta.service : typeof meta.linkedService === "string" ? meta.linkedService : null,
      targetLocation: typeof meta.location === "string" ? meta.location : typeof meta.linkedLocation === "string" ? meta.linkedLocation : null,
      ...parsed,
      // Resolved keyword fields override LLM output when cluster data is available
      primaryKeyword: resolvedPrimaryKeyword,
      keywordCluster: resolvedKeywordCluster,
      keywordVolume: ctx.keywordCluster?.totalVolume ?? null,
      keywordDifficulty: ctx.keywordCluster?.averageDifficulty ?? null,
      wordpressMapping: ctx.wpMapping ?? {
        status: "no_inventory",
        inventoryItemId: null,
        existingSlug: null,
        existingTitle: null,
        recommendedAction: "not_applicable",
      },
      // Merge LLM schema fields with known GBP/BP data so schema always has real values
      schemaRecommendation: mergeSchemaWithGbp(
        parsed.schemaRecommendation,
        ctx.gbpProfile,
        ctx.bp,
      ),
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
