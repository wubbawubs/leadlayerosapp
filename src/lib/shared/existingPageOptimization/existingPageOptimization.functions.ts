/**
 * Existing Page Optimization V1 — server functions.
 *
 * Flow: fetch existing WP page → snapshot → generate optimization brief
 *       → operator approves → apply optimization → proof recorded.
 *
 * Safety gates enforced at every step:
 *   - Only self-hosted WordPress (WP.com blocked).
 *   - Snapshot must exist before artifact generation.
 *   - Artifact must be approved before applying.
 *   - Content hash mismatch blocks apply (page changed since snapshot).
 *   - Page-builder pages blocked from content PATCH (meta_only only).
 *   - No automated publish — status preserved as-is.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decrypt } from "@/lib/shared/secrets/crypto.server";
import { llmComplete } from "@/lib/shared/llm/router.server";
import {
  fetchSelfHostedWordpressPage,
  updateSelfHostedWordpressPage,
  type WpPageUpdatePatch,
} from "@/lib/shared/wpcom/wp-rest.server";
import {
  FetchExistingPageInputSchema,
  GeneratePageOptimizationBriefInputSchema,
  ApplyPageOptimizationInputSchema,
  PageOptimizationBriefPayloadSchema,
  type PageOptimizationBriefPayload,
  type EligibilityStatus,
  type DetectedBuilder,
} from "./schemas";
import { jsonrepair } from "jsonrepair";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

// ------------------------------------------------------------------
// Auth helpers
// ------------------------------------------------------------------

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

// ------------------------------------------------------------------
// Credential loader (same pattern as wordpressDrafts.functions.ts)
// ------------------------------------------------------------------

async function loadCredentials(
  siteConnectionId: string,
  tenantId: string,
): Promise<{ username: string; secret: string }> {
  const secretKey = `site:${siteConnectionId}:app_password`;

  const { data: row, error } = await supabaseAdmin
    .from("tenant_secrets")
    .select("value_encrypted, encryption_version")
    .eq("tenant_id", tenantId)
    .eq("key", secretKey)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error(`Credential not found — re-add the WordPress connection (key: ${secretKey})`);

  const secret = decrypt(row.value_encrypted, row.encryption_version);

  const { data: sc } = await supabaseAdmin
    .from("site_connections")
    .select("username")
    .eq("id", siteConnectionId)
    .maybeSingle();

  return { username: sc?.username ?? "", secret };
}

// ------------------------------------------------------------------
// Content hash — SHA-256 via Web Crypto
// ------------------------------------------------------------------

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text ?? "");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ------------------------------------------------------------------
// Eligibility detection
// ------------------------------------------------------------------

interface EligibilityResult {
  eligibilityStatus: EligibilityStatus;
  detectedBuilder: DetectedBuilder;
  homepageRisk: boolean;
  riskNotes: string[];
}

const SHORTCODE_THRESHOLD = 5; // [shortcode] occurrences above which we flag

function detectPageOptimizationEligibility(page: {
  rawContent: string | null;
  renderedContent: string | null;
  meta: Record<string, unknown>;
  slug: string | null;
  wpPostId: number;
}): EligibilityResult {
  const raw = page.rawContent ?? "";
  const rendered = page.renderedContent ?? "";
  const meta = page.meta ?? {};
  const riskNotes: string[] = [];

  // Homepage detection
  const homepageRisk =
    page.slug === "" ||
    page.slug === "/" ||
    typeof meta.page_on_front === "number" && meta.page_on_front === page.wpPostId;
  if (homepageRisk) {
    riskNotes.push("This appears to be the site homepage — high visibility, apply with care");
  }

  // Builder detection — check rendered HTML first, then raw, then meta keys
  let detectedBuilder: DetectedBuilder = "none";

  if (
    rendered.includes("data-elementor") ||
    rendered.includes("elementor-widget") ||
    typeof meta["_elementor_data"] === "string" ||
    raw.includes("elementor")
  ) {
    detectedBuilder = "elementor";
  } else if (
    raw.includes("[et_pb_") ||
    rendered.includes("et_pb_") ||
    typeof meta["_et_pb_use_builder"] !== "undefined"
  ) {
    detectedBuilder = "divi";
  } else if (
    raw.includes("[vc_row") ||
    raw.includes("[vc_column") ||
    rendered.includes("vc_row") ||
    rendered.includes("wpb_wrapper")
  ) {
    detectedBuilder = "wpbakery";
  } else if (
    raw.includes("[fl-") ||
    rendered.includes("fl-builder") ||
    rendered.includes("fl-module")
  ) {
    detectedBuilder = "beaver";
  } else if (raw.includes("<!-- wp:")) {
    detectedBuilder = "gutenberg";
  } else if (raw.trim().length > 0) {
    detectedBuilder = "classic";
  }

  // Shortcode density
  const shortcodeMatches = (raw.match(/\[[a-z_-]+/g) ?? []).length;
  const shortcodeHeavy = shortcodeMatches >= SHORTCODE_THRESHOLD;
  if (shortcodeHeavy) {
    riskNotes.push(`Content contains ${shortcodeMatches} shortcode-like patterns — content PATCH may break plugin content`);
  }

  // Form shortcodes
  const hasFormShortcodes =
    raw.includes("[contact-form-7") ||
    raw.includes("[gravityforms") ||
    raw.includes("[wpforms") ||
    raw.includes("[ninja_forms");
  if (hasFormShortcodes) {
    riskNotes.push("Form shortcodes detected — content will not be updated to preserve form functionality");
  }

  // Determine eligibility
  if (!raw && !rendered) {
    return { eligibilityStatus: "blocked", detectedBuilder, homepageRisk, riskNotes };
  }

  const isBuilderPage =
    detectedBuilder === "elementor" ||
    detectedBuilder === "divi" ||
    detectedBuilder === "wpbakery" ||
    detectedBuilder === "beaver";

  if (isBuilderPage || shortcodeHeavy || hasFormShortcodes) {
    riskNotes.push(`Detected builder: ${detectedBuilder} — only title/meta/excerpt updates are safe`);
    return { eligibilityStatus: "meta_only", detectedBuilder, homepageRisk, riskNotes };
  }

  if (homepageRisk || !raw) {
    return { eligibilityStatus: "manual_mode", detectedBuilder, homepageRisk, riskNotes };
  }

  return { eligibilityStatus: "safe", detectedBuilder, homepageRisk, riskNotes };
}

// ------------------------------------------------------------------
// Gutenberg content builder for optimization patches
// Only includes sections with non-null optimized content.
// ------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wpParagraph(html: string): string {
  return `<!-- wp:paragraph -->\n<p>${escapeHtml(html)}</p>\n<!-- /wp:paragraph -->`;
}

function wpHeading(text: string, level: 2 | 3 = 2): string {
  return `<!-- wp:heading {"level":${level}} -->\n<h${level}>${escapeHtml(text)}</h${level}>\n<!-- /wp:heading -->`;
}

function wpListItems(items: string[]): string {
  const lis = items.filter(Boolean).map((s) => `<li>${escapeHtml(s)}</li>`).join("\n");
  return `<!-- wp:list -->\n<ul class="wp-block-list">\n${lis}\n</ul>\n<!-- /wp:list -->`;
}

function wpButtonsBlock(text: string): string {
  return (
    `<!-- wp:buttons -->\n<div class="wp-block-buttons">` +
    `<!-- wp:button {"backgroundColor":"primary","textColor":"white"} -->` +
    `<div class="wp-block-button"><a class="wp-block-button__link has-white-color has-primary-background-color wp-element-button">` +
    `${escapeHtml(text)}</a></div>` +
    `<!-- /wp:button -->` +
    `</div>\n<!-- /wp:buttons -->`
  );
}

function wpHtmlBlock(raw: string): string {
  return `<!-- wp:html -->\n${raw}\n<!-- /wp:html -->`;
}

function buildOptimizationContent(payload: PageOptimizationBriefPayload): string {
  const blocks: string[] = [];

  if (payload.improvedIntro) {
    blocks.push(wpParagraph(payload.improvedIntro));
  }

  if (payload.ctaBlock?.primary) {
    blocks.push(wpButtonsBlock(payload.ctaBlock.primary));
  }

  if (payload.faqBlock && payload.faqBlock.length > 0) {
    blocks.push(wpHeading("Frequently Asked Questions"));
    for (const faq of payload.faqBlock) {
      blocks.push(wpHeading(faq.question, 3));
      blocks.push(wpParagraph(faq.answer));
    }
  }

  if (payload.internalLinks && payload.internalLinks.length > 0) {
    blocks.push(wpHeading("Related Services"));
    blocks.push(wpListItems(
      payload.internalLinks.map((l) => `<a href="/${l.targetSlug}">${l.anchorText}</a>`),
    ));
  }

  if (payload.schemaRecommendation) {
    const schema = {
      "@context": "https://schema.org",
      "@type": payload.schemaRecommendation.type,
      ...payload.schemaRecommendation.suggestedFields,
    };
    const schemaJson = JSON.stringify(schema, null, 2);
    blocks.push(wpHtmlBlock(`<script type="application/ld+json">\n${schemaJson}\n</script>`));
  }

  return blocks.join("\n\n");
}

// ------------------------------------------------------------------
// SEO meta builder (mirrors V2B pattern from wordpressDrafts)
// ------------------------------------------------------------------

function buildSeoMetaPatch(
  payload: PageOptimizationBriefPayload,
  seoPlugin: "yoast" | "rankmath" | "none",
): Record<string, string> {
  const meta: Record<string, string> = {};
  if (seoPlugin === "yoast") {
    if (payload.metaTitle) meta["_yoast_wpseo_title"] = payload.metaTitle;
    if (payload.metaDescription) meta["_yoast_wpseo_metadesc"] = payload.metaDescription;
  } else if (seoPlugin === "rankmath") {
    if (payload.metaTitle) meta["rank_math_title"] = payload.metaTitle;
    if (payload.metaDescription) meta["rank_math_description"] = payload.metaDescription;
  }
  return meta;
}

// ------------------------------------------------------------------
// Heading outline extractor — parse H2/H3 from raw Gutenberg content
// ------------------------------------------------------------------

function extractHeadingOutline(rawContent: string | null): string {
  if (!rawContent) return "(no headings found)";
  const headings: string[] = [];
  const h2re = /<h2[^>]*>(.*?)<\/h2>/gi;
  const h3re = /<h3[^>]*>(.*?)<\/h3>/gi;
  let m: RegExpExecArray | null;
  while ((m = h2re.exec(rawContent)) !== null) {
    headings.push(`H2: ${m[1].replace(/<[^>]+>/g, "").trim()}`);
  }
  while ((m = h3re.exec(rawContent)) !== null) {
    headings.push(`H3: ${m[1].replace(/<[^>]+>/g, "").trim()}`);
  }
  return headings.length > 0 ? headings.join("\n") : "(no H2/H3 headings found)";
}

function estimateWordCount(rawContent: string | null): number {
  if (!rawContent) return 0;
  const text = rawContent.replace(/<[^>]+>/g, " ").replace(/<!--.*?-->/gs, " ");
  return text.split(/\s+/).filter(Boolean).length;
}

// ------------------------------------------------------------------
// LLM system prompt
// ------------------------------------------------------------------

function buildOptimizationSystemPrompt(): string {
  return [
    "You are a senior local SEO copywriter and conversion rate optimization strategist.",
    "You optimize existing pages on local service business websites for search visibility and lead conversion.",
    "",
    "CRITICAL RULES:",
    "- Output ONLY valid JSON. No markdown. No explanations outside the JSON.",
    "- You have seen the FULL existing page content. Do not recommend sections that already exist and work well.",
    "- Be SURGICAL: only recommend what materially improves the page. Null = keep as-is. Do not change for the sake of changing.",
    "- PRIMARY KEYWORD: if a keyword cluster is provided, use it to improve meta title, H1, and intro paragraph. Confirm or improve keyword targeting.",
    "- Never invent proof, certifications, guarantees, or awards not present in the context.",
    "- Never fabricate review counts, star ratings, or client testimonials.",
    "- Respect forbidden claims — never use any claim listed as forbidden.",
    "- Operator review is required before applying any change.",
  ].join("\n");
}

function buildOptimizationPrompt(args: {
  snapshot: {
    title: string | null;
    slug: string | null;
    link: string | null;
    rawContent: string | null;
    excerpt: string | null;
    eligibilityStatus: string;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bp: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tone: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  goal: Record<string, any> | null;
  updateMode: string;
  targetService?: string;
  targetLocation?: string;
  keywordCluster?: {
    primaryKeyword: string | null;
    representativeKeywords: string[];
    totalVolume: number | null;
    averageDifficulty: number | null;
  } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pageIntelligenceForPage?: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  competitorScan?: Record<string, any> | null;
}): string {
  const { snapshot, bp, tone, goal, updateMode, targetService, targetLocation, keywordCluster, pageIntelligenceForPage, competitorScan } = args;
  const lines: string[] = [];
  const wordCount = estimateWordCount(snapshot.rawContent);

  lines.push(`TASK: Generate a page_optimization_brief for an existing page.`);
  lines.push(`Update mode: ${updateMode} — ${
    updateMode === "meta_only"
      ? "only improve title/meta/excerpt. Do NOT write improvedIntro/ctaBlock/faqBlock/schemaRecommendation."
      : "full optimization — improve content, meta, CTA, FAQ, schema, internal links as needed."
  }`);
  lines.push("");

  lines.push("EXISTING PAGE:");
  lines.push(`- Title: ${snapshot.title ?? "(none)"}`);
  lines.push(`- Slug: ${snapshot.slug ?? "(none)"}`);
  lines.push(`- URL: ${snapshot.link ?? "(none)"}`);
  if (targetService) lines.push(`- Target service: ${targetService}`);
  if (targetLocation) lines.push(`- Target location: ${targetLocation}`);
  lines.push(`- Current word count: ~${wordCount} words`);
  if (snapshot.excerpt) lines.push(`- Current meta description: ${snapshot.excerpt.slice(0, 200)}`);

  // Full content — critical for surgical optimization
  if (snapshot.rawContent) {
    const headingOutline = extractHeadingOutline(snapshot.rawContent);
    lines.push("");
    lines.push("PAGE HEADING STRUCTURE (current):");
    lines.push(headingOutline);
    lines.push("");

    const fullContent = snapshot.rawContent.slice(0, 8000);
    const truncated = snapshot.rawContent.length > 8000;
    lines.push(`FULL PAGE CONTENT (${truncated ? "first 8000 chars of " : ""}${snapshot.rawContent.length} chars):`);
    lines.push(fullContent);
    if (truncated) lines.push("... (content continues beyond 8000 chars)");
  }
  lines.push("");

  if (goal) {
    lines.push("GROWTH GOAL:");
    lines.push(`- Target: ${goal.target_count ?? "?"} ${goal.target_type ?? "clients"}/month`);
    if (Array.isArray(goal.service_focus) && goal.service_focus.length > 0) {
      lines.push(`- Service focus: ${(goal.service_focus as string[]).slice(0, 5).join(", ")}`);
    }
    if (Array.isArray(goal.locations) && goal.locations.length > 0) {
      lines.push(`- Locations: ${(goal.locations as string[]).slice(0, 5).join(", ")}`);
    }
    lines.push("");
  }

  if (bp) {
    const id = (bp.business_identity ?? {}) as Record<string, unknown>;
    const offer = (bp.offer_profile ?? {}) as Record<string, unknown>;
    const conv = (bp.conversion_profile ?? {}) as Record<string, unknown>;
    const proof = (bp.proof_profile ?? {}) as Record<string, unknown>;
    const guardrails = (bp.claim_guardrails ?? {}) as Record<string, unknown>;

    lines.push("BUSINESS:");
    if (id.businessName || id.brandName) lines.push(`- Brand: ${id.brandName ?? id.businessName}`);
    if (id.vertical) lines.push(`- Vertical: ${id.vertical}`);
    if (offer.primaryOffer) lines.push(`- Primary offer: ${offer.primaryOffer}`);
    if (offer.mainPromise) lines.push(`- Core promise: ${offer.mainPromise}`);
    if (offer.uniqueValueProposition) lines.push(`- UVP: ${offer.uniqueValueProposition}`);
    if (conv.primaryCta) lines.push(`- Preferred CTA: ${conv.primaryCta}`);
    const verified = Array.isArray(proof.verifiedProofPoints) ? (proof.verifiedProofPoints as string[]) : [];
    if (verified.length > 0) lines.push(`- Verified proof: ${verified.slice(0, 5).join(" | ")}`);
    else lines.push("- Verified proof: NONE — do not invent proof claims.");
    if (Array.isArray(guardrails.forbiddenClaims) && (guardrails.forbiddenClaims as string[]).length > 0) {
      lines.push(`- FORBIDDEN CLAIMS (never use): ${(guardrails.forbiddenClaims as string[]).join(", ")}`);
    }
    lines.push("");
  }

  if (tone?.profile) {
    const p = tone.profile as Record<string, unknown>;
    const voice = (p.voiceIdentity ?? {}) as Record<string, unknown>;
    if (voice.summary) lines.push(`TONE: ${String(voice.summary).slice(0, 200)}`);
    lines.push("");
  }

  // Keyword cluster for this service/location
  if (keywordCluster) {
    lines.push("KEYWORD CLUSTER (DataForSEO):");
    lines.push(`- PRIMARY KEYWORD: "${keywordCluster.primaryKeyword ?? "infer from service + location"}"`);
    if (keywordCluster.representativeKeywords.length > 1) {
      lines.push(`- Cluster keywords: ${keywordCluster.representativeKeywords.slice(0, 10).join(", ")}`);
    }
    if (keywordCluster.totalVolume != null) lines.push(`- Monthly volume: ${keywordCluster.totalVolume.toLocaleString()}`);
    if (keywordCluster.averageDifficulty != null) lines.push(`- Difficulty: ${keywordCluster.averageDifficulty.toFixed(0)}/100`);
    lines.push("- INSTRUCTION: improve H1/meta title to target the primary keyword if the current title misses it.");
    lines.push("");
  }

  // Page intelligence for this specific page URL (current SEO analysis)
  if (pageIntelligenceForPage) {
    lines.push("PAGE INTELLIGENCE (current SEO analysis of this page):");
    const pi = pageIntelligenceForPage as Record<string, unknown>;
    if (pi.target_keyword) lines.push(`- Currently targets: "${pi.target_keyword}"`);
    if (pi.intent) lines.push(`- Search intent: ${pi.intent}`);
    if (pi.commercial_priority) lines.push(`- Commercial priority: ${pi.commercial_priority}`);
    if (pi.content_summary) lines.push(`- Content summary: ${String(pi.content_summary).slice(0, 150)}`);
    if (pi.recommended_cta) lines.push(`- Recommended CTA: ${pi.recommended_cta}`);
    if (Array.isArray(pi.missing_page_context) && (pi.missing_page_context as string[]).length > 0) {
      lines.push(`- Missing on page: ${(pi.missing_page_context as string[]).join(", ")}`);
    }
    lines.push("");
  }

  if (competitorScan) {
    const s = (competitorScan.summary ?? {}) as Record<string, unknown>;
    if (s.gaps) lines.push(`COMPETITOR GAPS (from scan): ${JSON.stringify(s.gaps).slice(0, 200)}\n`);
  }

  lines.push("OUTPUT: Strict JSON matching this schema (null means keep as-is, do not change):");
  const schema = {
    recommendedTitle: "string or null (null = current title is fine)",
    metaTitle: "string (max 70 chars, primaryKeyword near start) or null",
    metaDescription: "string (max 160 chars, keyword + CTA + location) or null",
    improvedIntro: updateMode === "meta_only" ? null : "string (rewritten intro, 150-250 words, primaryKeyword in first sentence) or null (if current intro is good)",
    ctaBlock: updateMode === "meta_only" ? null : '{ primary: string, secondary?: string, placement?: string } or null',
    faqBlock: updateMode === "meta_only" ? null : '[{ question: string, answer: string (80-120 words each) }] — null if page already has adequate FAQ',
    schemaRecommendation: updateMode === "meta_only" ? null : '{ type: string, suggestedFields: Record<string,string> } or null',
    internalLinks: updateMode === "meta_only" ? [] : '[{ anchorText: string, targetSlug: string, rationale: string }]',
    operatorChecklist: ["string — specific action items for operator to verify before applying"],
    riskFlags: ["string — specific risks: content that might break, claims to validate, SEO risks"],
    missingContext: ["string — specific data that would improve this optimization"],
    assumptions: ["string — assumptions made due to missing context"],
    successMetric: "string — measurable outcome (e.g. 'page ranks top 5 for [keyword] within 60 days')",
  };
  lines.push(JSON.stringify(schema));
  lines.push("Output ONLY the JSON object. No markdown.");

  return lines.join("\n");
}

// ------------------------------------------------------------------
// Fallback brief (deterministic, when LLM fails)
// ------------------------------------------------------------------

function buildFallbackOptimizationBrief(args: {
  snapshot: {
    wpPostId: number;
    title: string | null;
    slug: string | null;
    link: string | null;
    excerpt: string | null;
    contentHash: string;
  };
  updateMode: string;
  snapshotId: string;
}): PageOptimizationBriefPayload {
  const { snapshot, updateMode, snapshotId } = args;
  const mode = (["full_content", "meta_only", "manual"].includes(updateMode) ? updateMode : "meta_only") as PageOptimizationBriefPayload["updateMode"];
  return {
    targetWpPostId: snapshot.wpPostId,
    targetUrl: snapshot.link ?? null,
    pageType: "page",
    updateMode: mode,
    beforeSnapshotId: snapshotId,
    currentTitle: snapshot.title ?? null,
    currentMetaTitle: null,
    currentMetaDesc: snapshot.excerpt ?? null,
    currentContentHash: snapshot.contentHash,
    recommendedTitle: null,
    metaTitle: null,
    metaDescription: null,
    improvedIntro: null,
    ctaBlock: null,
    proofBlock: null,
    faqBlock: null,
    schemaRecommendation: null,
    internalLinks: [],
    operatorChecklist: [
      "Review the existing page content before applying any changes",
      "Confirm the page title and meta description are accurate",
      "Verify business information is up to date",
    ],
    riskFlags: ["Brief generated without AI context — manual review required before applying"],
    missingContext: ["LLM generation failed — brief is a stub. Regenerate with more business context."],
    assumptions: [],
    successMetric: "Improved search visibility and lead form submissions from this page",
  };
}

// ------------------------------------------------------------------
// 1. fetchAndSnapshotExistingWordpressPage
// ------------------------------------------------------------------

export const fetchAndSnapshotExistingWordpressPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FetchExistingPageInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    // Load WP connection
    const { data: connRow, error: connErr } = await admin
      .from("wordpress_connections")
      .select("id, site_connection_id, kind, base_url, status, capabilities")
      .eq("id", data.wordpressConnectionId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (connErr) throw connErr;
    if (!connRow) throw new Error("WordPress connection not found");

    if (connRow.kind === "wordpress_com") {
      throw new Error("Existing page optimization is not supported for WordPress.com sites");
    }
    if (connRow.status !== "connected") {
      throw new Error("WordPress connection is not active. Re-check the connection from the Sites page.");
    }

    const caps = (connRow.capabilities ?? {}) as Record<string, unknown>;
    if (!caps.canCreateDraft) {
      throw new Error("WordPress connection does not have edit capability. Re-check the connection.");
    }

    const creds = await loadCredentials(connRow.site_connection_id, data.tenantId);

    // Fetch page from WP
    const fetchResult = await fetchSelfHostedWordpressPage({
      baseUrl: connRow.base_url,
      username: creds.username,
      appPassword: creds.secret,
      wpPostId: data.wpPostId,
    });

    if (!fetchResult.ok) {
      throw new Error(`Could not fetch page from WordPress: ${fetchResult.error ?? "unknown error"}`);
    }

    const rawContent = fetchResult.content?.raw ?? null;
    const renderedContent = fetchResult.content?.rendered ?? null;
    const title = fetchResult.title?.raw ?? null;
    const excerpt = fetchResult.excerpt?.raw ?? null;

    // Detect eligibility
    const eligibility = detectPageOptimizationEligibility({
      rawContent,
      renderedContent,
      meta: fetchResult.meta,
      slug: fetchResult.slug,
      wpPostId: data.wpPostId,
    });

    // Compute content hash
    const hashInput = `${rawContent ?? ""}|${title ?? ""}|${excerpt ?? ""}`;
    const contentHash = await sha256(hashInput);

    // Store snapshot (immutable)
    const { data: snapRow, error: snapErr } = await admin
      .from("page_optimization_snapshots")
      .insert({
        tenant_id: data.tenantId,
        wordpress_connection_id: data.wordpressConnectionId,
        wp_post_id: data.wpPostId,
        wp_post_type: "page",
        wp_status: fetchResult.status,
        title,
        slug: fetchResult.slug,
        link: fetchResult.link,
        excerpt,
        raw_content: rawContent,
        rendered_content: renderedContent,
        detected_builder: eligibility.detectedBuilder,
        eligibility_status: eligibility.eligibilityStatus,
        content_hash: contentHash,
      })
      .select("id")
      .single();
    if (snapErr) throw snapErr;

    return {
      ok: true,
      snapshotId: snapRow.id as string,
      wpPostId: data.wpPostId,
      title,
      slug: fetchResult.slug,
      link: fetchResult.link,
      eligibilityStatus: eligibility.eligibilityStatus,
      detectedBuilder: eligibility.detectedBuilder,
      homepageRisk: eligibility.homepageRisk,
      riskNotes: eligibility.riskNotes,
      contentHash,
    };
  });

// ------------------------------------------------------------------
// 2. generateExistingPageOptimizationBrief
// ------------------------------------------------------------------

export const generateExistingPageOptimizationBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GeneratePageOptimizationBriefInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    // Load snapshot
    const { data: snapRow, error: snapErr } = await admin
      .from("page_optimization_snapshots")
      .select("*")
      .eq("id", data.snapshotId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (snapErr) throw snapErr;
    if (!snapRow) throw new Error("Snapshot not found");

    if (snapRow.eligibility_status === "blocked") {
      throw new Error("Page is not eligible for optimization (blocked). Re-fetch the page to check eligibility.");
    }

    // Declare snapshot early so context loading can reference slug/link
    const snapshot = {
      wpPostId: snapRow.wp_post_id as number,
      title: snapRow.title as string | null,
      slug: snapRow.slug as string | null,
      link: snapRow.link as string | null,
      excerpt: snapRow.excerpt as string | null,
      rawContent: snapRow.raw_content as string | null,
      contentHash: snapRow.content_hash as string,
      eligibilityStatus: snapRow.eligibility_status as string,
    };

    // Determine update mode
    let updateMode = data.updateModeOverride ?? "full_content";
    if (snapshot.eligibilityStatus === "meta_only") {
      updateMode = "meta_only";
    } else if (snapshot.eligibilityStatus === "manual_mode") {
      updateMode = "manual";
    }

    // Load all context in parallel — maximum context for best output quality
    const [goalRes, bpRes, toneRes, clusterRes, compRes] = await Promise.all([
      admin
        .from("growth_goals")
        .select("id, target_type, target_count, service_focus, locations, timeframe_months")
        .eq("tenant_id", data.tenantId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("business_profiles_v2")
        .select("business_identity, offer_profile, conversion_profile, proof_profile, claim_guardrails")
        .eq("tenant_id", data.tenantId)
        .maybeSingle(),
      admin
        .from("tone_profiles")
        .select("profile, status, language")
        .eq("tenant_id", data.tenantId)
        .maybeSingle(),
      admin
        .from("market_demand_clusters")
        .select("cluster_name, service, location, intent, total_volume, average_difficulty, representative_keywords, opportunity_score")
        .eq("tenant_id", data.tenantId)
        .order("opportunity_score", { ascending: false })
        .limit(15),
      admin
        .from("competitor_scans")
        .select("summary")
        .eq("tenant_id", data.tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // Load page intelligence for this specific URL (if available)
    let pageIntelligenceForPage: Record<string, unknown> | null = null;
    if (snapshot.link || snapshot.slug) {
      const piQuery = admin
        .from("page_intelligence")
        .select("page_url, target_keyword, intent, commercial_priority, content_summary, recommended_cta, missing_page_context")
        .eq("tenant_id", data.tenantId);
      if (snapshot.link) {
        const { data: piRow } = await piQuery.eq("page_url", snapshot.link).maybeSingle();
        pageIntelligenceForPage = piRow ?? null;
      }
      if (!pageIntelligenceForPage && snapshot.slug) {
        const { data: piRow } = await admin
          .from("page_intelligence")
          .select("page_url, target_keyword, intent, commercial_priority, content_summary, recommended_cta, missing_page_context")
          .eq("tenant_id", data.tenantId)
          .ilike("page_url", `%${snapshot.slug}%`)
          .maybeSingle();
        pageIntelligenceForPage = piRow ?? null;
      }
    }

    // Resolve best keyword cluster for this service/location
    const clusterRows = (clusterRes.data ?? []) as Array<{
      cluster_name: string;
      service: string | null;
      location: string | null;
      intent: string | null;
      total_volume: number | null;
      average_difficulty: number | null;
      representative_keywords: unknown;
      opportunity_score: number | null;
    }>;
    let resolvedKeywordCluster: {
      primaryKeyword: string | null;
      representativeKeywords: string[];
      totalVolume: number | null;
      averageDifficulty: number | null;
    } | null = null;
    if (clusterRows.length > 0) {
      const norm = (s: unknown) => typeof s === "string" ? s.toLowerCase().trim() : "";
      const sNorm = norm(data.targetService ?? snapshot.slug);
      const lNorm = norm(data.targetLocation);
      const scored = clusterRows.map((c) => {
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
        resolvedKeywordCluster = {
          primaryKeyword: kws[0] ?? best.cluster.cluster_name,
          representativeKeywords: kws.slice(0, 12),
          totalVolume: best.cluster.total_volume,
          averageDifficulty: best.cluster.average_difficulty,
        };
      }
    }

    // Determine masterplan_item_id for artifact linkage
    let masterplanItemId: string | null = data.masterplanItemId ?? null;

    // If no explicit masterplanItemId, try to find one from WP page mappings
    if (!masterplanItemId) {
      const { data: mapping } = await admin
        .from("wordpress_page_mappings")
        .select("masterplan_item_id")
        .eq("tenant_id", data.tenantId)
        .eq("wp_post_id", snapshot.wpPostId)
        .not("masterplan_item_id", "is", null)
        .limit(1)
        .maybeSingle();
      masterplanItemId = mapping?.masterplan_item_id ?? null;
    }

    if (!masterplanItemId) {
      throw new Error(
        "No masterplan item found for this snapshot. " +
        "Provide masterplanItemId or ensure the page has a wordpress_page_mappings row.",
      );
    }

    // Generate brief via LLM (with fallback)
    let payload: PageOptimizationBriefPayload;
    let usedFallback = false;

    if (updateMode === "manual") {
      // Manual mode: stub brief with recommendations only, no apply
      payload = buildFallbackOptimizationBrief({ snapshot, updateMode, snapshotId: data.snapshotId });
      payload.riskFlags.unshift("Manual mode — content cannot be patched. Apply recommendations manually in WP Admin.");
      payload.operatorChecklist.unshift("Apply changes manually in WordPress Admin — automated content patch is not available for this page type");
      usedFallback = true;
    } else {
      try {
        const llmResult = await llmComplete({
          task: "default",
          system: buildOptimizationSystemPrompt(),
          prompt: buildOptimizationPrompt({
            snapshot,
            bp: bpRes.data ?? null,
            tone: toneRes.data ?? null,
            goal: goalRes.data ?? null,
            updateMode,
            targetService: data.targetService,
            targetLocation: data.targetLocation,
            keywordCluster: resolvedKeywordCluster,
            pageIntelligenceForPage,
            competitorScan: compRes.data ?? null,
          }),
          jsonMode: true,
          maxTokens: 4000,
          timeoutMs: 60_000,
        });

        const rawText = llmResult.text.trim();
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          parsed = JSON.parse(jsonrepair(rawText));
        }

        const llmOut = parsed as Record<string, unknown>;
        const mode = (["full_content", "meta_only", "manual"].includes(updateMode) ? updateMode : "full_content") as PageOptimizationBriefPayload["updateMode"];

        payload = PageOptimizationBriefPayloadSchema.parse({
          targetWpPostId: snapshot.wpPostId,
          targetUrl: snapshot.link ?? null,
          pageType: "page",
          updateMode: mode,
          beforeSnapshotId: data.snapshotId,
          currentTitle: snapshot.title ?? null,
          currentMetaTitle: null,
          currentMetaDesc: snapshot.excerpt ?? null,
          currentContentHash: snapshot.contentHash,
          recommendedTitle: (llmOut.recommendedTitle as string | null) ?? null,
          metaTitle: (llmOut.metaTitle as string | null) ?? null,
          metaDescription: (llmOut.metaDescription as string | null) ?? null,
          improvedIntro: mode === "meta_only" ? null : ((llmOut.improvedIntro as string | null) ?? null),
          ctaBlock: mode === "meta_only" ? null : ((llmOut.ctaBlock as PageOptimizationBriefPayload["ctaBlock"]) ?? null),
          proofBlock: null,
          faqBlock: mode === "meta_only" ? null : ((llmOut.faqBlock as PageOptimizationBriefPayload["faqBlock"]) ?? null),
          schemaRecommendation: mode === "meta_only" ? null : ((llmOut.schemaRecommendation as PageOptimizationBriefPayload["schemaRecommendation"]) ?? null),
          internalLinks: mode === "meta_only" ? [] : (Array.isArray(llmOut.internalLinks) ? (llmOut.internalLinks as PageOptimizationBriefPayload["internalLinks"]) : []),
          operatorChecklist: Array.isArray(llmOut.operatorChecklist) ? (llmOut.operatorChecklist as string[]) : [],
          riskFlags: Array.isArray(llmOut.riskFlags) ? (llmOut.riskFlags as string[]) : [],
          missingContext: Array.isArray(llmOut.missingContext) ? (llmOut.missingContext as string[]) : [],
          assumptions: Array.isArray(llmOut.assumptions) ? (llmOut.assumptions as string[]) : [],
          successMetric: typeof llmOut.successMetric === "string" ? llmOut.successMetric : "Improved search visibility and lead conversions",
        });
      } catch (llmErr) {
        // LLM failed — use deterministic fallback
        payload = buildFallbackOptimizationBrief({ snapshot, updateMode, snapshotId: data.snapshotId });
        usedFallback = true;
        console.error("[generateExistingPageOptimizationBrief] LLM error:", llmErr);
      }
    }

    // Always add fixed operator checklist items
    const fixedChecklist = [
      "I have reviewed the before and after content in the execution board",
      "The content changes are accurate and safe to publish",
      "I have confirmed a backup or WP Revision exists for this page",
      "I understand this updates the live page immediately (or draft, if the page is currently a draft)",
    ];
    for (const item of fixedChecklist) {
      if (!payload.operatorChecklist.includes(item)) {
        payload.operatorChecklist.push(item);
      }
    }

    // Store as execution_artifact
    const { data: artRow, error: artErr } = await admin
      .from("execution_artifacts")
      .insert({
        tenant_id: data.tenantId,
        masterplan_item_id: masterplanItemId,
        artifact_type: "page_optimization_brief",
        status: updateMode === "manual" ? "needs_review" : "needs_review",
        payload,
        risk_flags: payload.riskFlags,
        missing_context: payload.missingContext,
        generated_from: {
          snapshotId: data.snapshotId,
          masterplanItemId,
          updateMode,
        },
        delivery_readiness: { wordpress: "connected" },
        quality_gates: {},
        before_snapshot_ref: data.snapshotId,
      })
      .select("id, status")
      .single();
    if (artErr) throw artErr;

    return {
      ok: true,
      artifactId: artRow.id as string,
      artifactStatus: artRow.status as string,
      updateMode,
      usedFallback,
      eligibilityStatus: snapRow.eligibility_status as string,
    };
  });

// ------------------------------------------------------------------
// 3. applyExistingPageOptimization
// ------------------------------------------------------------------

export const applyExistingPageOptimization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ApplyPageOptimizationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    // 1. Load artifact
    const { data: artRow, error: artErr } = await admin
      .from("execution_artifacts")
      .select("id, tenant_id, artifact_type, status, payload, before_snapshot_ref, delivery_status")
      .eq("id", data.artifactId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (artErr) throw artErr;
    if (!artRow) throw new Error("Execution artifact not found");

    // Hard gates
    if (artRow.artifact_type !== "page_optimization_brief") {
      throw new Error(`Wrong artifact type: expected page_optimization_brief, got ${artRow.artifact_type as string}`);
    }
    if (artRow.status !== "approved") {
      throw new Error(`Artifact must be approved before applying (current status: ${artRow.status as string})`);
    }

    const payload = artRow.payload as PageOptimizationBriefPayload;

    if (!payload.beforeSnapshotId) {
      throw new Error("Cannot apply without a before snapshot — re-fetch the page first.");
    }
    if (!payload.targetWpPostId || payload.targetWpPostId <= 0) {
      throw new Error("No valid wp_post_id in artifact payload");
    }
    if (payload.updateMode === "manual") {
      return {
        ok: false,
        error: "Manual mode — content cannot be applied automatically. Apply recommendations in WordPress Admin.",
        errorCode: "manual_mode",
      };
    }

    // Load snapshot
    const { data: snapRow, error: snapErr } = await admin
      .from("page_optimization_snapshots")
      .select("id, content_hash, wordpress_connection_id, eligibility_status, detected_builder")
      .eq("id", payload.beforeSnapshotId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (snapErr) throw snapErr;
    if (!snapRow) throw new Error("Before snapshot not found — cannot verify content freshness.");

    // Load WP connection
    const { data: connRow, error: connErr } = await admin
      .from("wordpress_connections")
      .select("id, site_connection_id, kind, base_url, status, capabilities")
      .eq("id", snapRow.wordpress_connection_id)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (connErr) throw connErr;
    if (!connRow) throw new Error("WordPress connection not found");

    if (connRow.kind === "wordpress_com") {
      throw new Error("WordPress.com optimization is not supported in V1");
    }
    if (connRow.status !== "connected") {
      throw new Error("WordPress connection is not active. Re-check the connection from the Sites page.");
    }

    const caps = (connRow.capabilities ?? {}) as Record<string, unknown>;
    if (!caps.canCreateDraft) {
      throw new Error("WordPress connection does not have edit capability — same auth is required for PATCH");
    }

    const creds = await loadCredentials(connRow.site_connection_id, data.tenantId);

    // 2. Re-validate snapshot freshness — re-fetch live page and compare hash
    const liveFetch = await fetchSelfHostedWordpressPage({
      baseUrl: connRow.base_url,
      username: creds.username,
      appPassword: creds.secret,
      wpPostId: payload.targetWpPostId,
    });

    if (!liveFetch.ok) {
      throw new Error(`Could not re-fetch page to validate freshness: ${liveFetch.error ?? "unknown error"}`);
    }

    const liveRaw = liveFetch.content?.raw ?? null;
    const liveTitle = liveFetch.title?.raw ?? null;
    const liveExcerpt = liveFetch.excerpt?.raw ?? null;
    const liveHashInput = `${liveRaw ?? ""}|${liveTitle ?? ""}|${liveExcerpt ?? ""}`;
    const liveHash = await sha256(liveHashInput);

    if (liveHash !== snapRow.content_hash) {
      return {
        ok: false,
        error:
          "Page has changed since the snapshot was taken. " +
          "Re-fetch the page to create a new snapshot, then regenerate and re-approve the optimization brief.",
        errorCode: "stale_content",
        currentHash: liveHash,
        snapshotHash: snapRow.content_hash as string,
      };
    }

    // Soft gate: live page confirmation
    const isLivePage = liveFetch.status === "publish";
    if (isLivePage && !data.confirmLivePage) {
      return {
        ok: false,
        error:
          "This page is currently published (live). " +
          "Set confirmLivePage=true to confirm you understand changes take effect immediately.",
        errorCode: "confirm_live_page_required",
      };
    }

    // 3. Build PATCH body
    const seoPlugin = (caps.seoPlugin as "yoast" | "rankmath" | "none" | undefined) ?? "none";
    const patch: WpPageUpdatePatch = {};
    const fieldsUpdated: string[] = [];

    if (payload.recommendedTitle) {
      patch.title = payload.recommendedTitle;
      fieldsUpdated.push("title");
    }

    if (payload.updateMode === "full_content" && payload.improvedIntro) {
      const content = buildOptimizationContent(payload);
      if (content.trim()) {
        patch.content = content;
        fieldsUpdated.push("content");
      }
    }

    if (payload.metaDescription) {
      patch.excerpt = payload.metaDescription;
      fieldsUpdated.push("excerpt");
    }

    const seoMeta = buildSeoMetaPatch(payload, seoPlugin);
    if (Object.keys(seoMeta).length > 0) {
      patch.meta = seoMeta;
      fieldsUpdated.push(...Object.keys(seoMeta).map((k) => `meta.${k}`));
    }

    if (fieldsUpdated.length === 0) {
      return {
        ok: false,
        error: "No fields to update — all recommended changes are null. Review and add recommendations before applying.",
        errorCode: "no_fields_to_update",
      };
    }

    // 4. Execute PATCH
    const updateResult = await updateSelfHostedWordpressPage({
      baseUrl: connRow.base_url,
      username: creds.username,
      appPassword: creds.secret,
      wpPostId: payload.targetWpPostId,
      patch,
    });

    // 5. Record delivery proof
    const { data: updateRow, error: updateErr } = await admin
      .from("wordpress_page_updates")
      .insert({
        tenant_id: data.tenantId,
        execution_artifact_id: data.artifactId,
        snapshot_id: payload.beforeSnapshotId,
        wordpress_connection_id: connRow.id,
        wp_post_id: payload.targetWpPostId,
        status: updateResult.ok ? "applied" : "failed",
        applied_at: updateResult.ok ? new Date().toISOString() : null,
        applied_by: userId,
        update_source: "leadlayer_update",
        fields_updated: fieldsUpdated,
        error_message: updateResult.ok ? null : (updateResult.error ?? "WP PATCH failed"),
        raw_response: updateResult.rawResponse as Record<string, unknown>,
      })
      .select("id")
      .single();
    if (updateErr) throw updateErr;

    // Update artifact delivery status
    await admin
      .from("execution_artifacts")
      .update({
        delivery_status: updateResult.ok ? "optimized" : "delivery_failed",
        ...(updateResult.ok
          ? {
              delivered_at: new Date().toISOString(),
              delivered_by: userId,
              delivered_url: updateResult.link ?? null,
            }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.artifactId);

    // Update wordpress_site_inventory if mapping exists
    if (updateResult.ok) {
      await admin
        .from("wordpress_site_inventory")
        .update({
          last_optimized_at: new Date().toISOString(),
          last_optimized_by: data.artifactId,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", data.tenantId)
        .eq("wordpress_connection_id", connRow.id)
        .eq("wp_post_id", payload.targetWpPostId);
    }

    if (!updateResult.ok) {
      return {
        ok: false,
        error: updateResult.error ?? "WordPress PATCH failed",
        errorCode: "wp_patch_failed",
        updateId: updateRow.id as string,
        httpStatus: updateResult.httpStatus,
      };
    }

    return {
      ok: true,
      updateId: updateRow.id as string,
      fieldsUpdated,
      wpPostId: payload.targetWpPostId,
      wpStatus: updateResult.wpStatus,
      link: updateResult.link,
      seoPlugin,
    };
  });

// ------------------------------------------------------------------
// 4. getOptimizationSnapshot — read a snapshot by id
// ------------------------------------------------------------------

export const getOptimizationSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tenantId: z.string().uuid(), snapshotId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: member } = await supabase
      .from("memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (!member) throw new Error("Forbidden");

    const { data: row, error } = await admin
      .from("page_optimization_snapshots")
      .select("*")
      .eq("id", data.snapshotId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (error) throw error;
    return { snapshot: row ?? null };
  });
