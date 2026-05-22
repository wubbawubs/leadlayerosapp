/**
 * Page Intelligence V1 — analyzer.
 * Batch-per-audit classification: one LLM call per page, fail-soft per page.
 */
import { llmComplete } from "@/lib/shared/llm/router.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  PageIntelligenceLLMSchema,
  type PageIntelligenceLLM,
  type PageType,
} from "./schemas";

const MAX_PAGES = 25;
const MODEL = "google/gemini-2.5-flash";

interface AuditPageRow {
  id: string;
  page_id: string | null;
  url: string;
  title: string | null;
  meta_description: string | null;
  h1: string | null;
  word_count: number;
  internal_links_count: number;
  external_links_count: number;
  images_without_alt: number;
  issues: unknown;
}

interface AnalyzeArgs {
  tenantId: string;
  auditId: string;
  forceRefresh?: boolean;
}

interface AnalyzeSummary {
  analyzedCount: number;
  failedCount: number;
  skippedCount: number;
  criticalCount: number;
  highCount: number;
}

/* ---------------- deterministic hints ---------------- */

const PROCESS_URL_RE = /\/(werkwijze|hoe-het-werkt|how-it-works|method|process|aanpak)(?:\/|$)/;
const SERVICE_TITLE_RE =
  /\b(wat we doen|onze diensten|diensten|services|aanpak|werkwijze|hoe (we |het )?werk(en|t)|our services|what we do)\b/i;
const HYPE_CTA_RE =
  /\b(unlock|discover how|harness|the art of|elevate your|transform your|game[-\s]?chang|next[-\s]?level|supercharge|skyrocket|revolutioni[sz]e)\b/i;

function urlHintType(url: string): PageType | null {
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = url.toLowerCase();
  }
  if (path === "" || path === "/" || path === "/home") return "homepage";
  if (PROCESS_URL_RE.test(path)) return "service";
  if (/\/contact(?:\/|$)|\/contact-us(?:\/|$)/.test(path)) return "contact";
  if (/\/(about|over-ons|over)(?:\/|$)/.test(path)) return "about";
  if (/\/faq(?:\/|$)|\/veelgestelde/.test(path)) return "faq";
  if (/\/pricing(?:\/|$)|\/tarieven(?:\/|$)|\/prijzen(?:\/|$)/.test(path)) return "pricing";
  if (/\/(case-?study|cases|case|portfolio|projecten)(?:\/|$)/.test(path)) return "case_study";
  if (/\/(privacy|terms|disclaimer|cookies|algemene-voorwaarden)(?:\/|$)/.test(path)) return "legal";
  if (/\/blog\//.test(path) || /\/\d{4}\/\d{2}\//.test(path)) return "blog";
  return null;
}

function isProcessPage(url: string): boolean {
  try {
    return PROCESS_URL_RE.test(new URL(url).pathname.toLowerCase());
  } catch {
    return PROCESS_URL_RE.test(url.toLowerCase());
  }
}

function looksLikeServiceContent(page: AuditPageRow): boolean {
  const blob = `${page.title ?? ""} ${page.h1 ?? ""}`;
  return SERVICE_TITLE_RE.test(blob);
}

/**
 * Deterministic classification when the LLM fails. Better than generic other/low
 * because we already know a lot from URL + title.
 */
function ruleBasedFallback(
  page: AuditPageRow,
  hint: PageType | null,
  error: string,
): Record<string, unknown> {
  const note = (extra: string) => [
    { missing: "rule_based_fallback", impact: extra },
    { missing: "llm_classification_failed", impact: error.slice(0, 200) },
  ];

  if (isProcessPage(page.url)) {
    return {
      page_type: "service",
      intent: "trust",
      funnel_stage: "consideration",
      commercial_priority: "high",
      seo_role: "trust_page",
      confidence: 0.55,
      missing_page_context: note("Process/werkwijze page classified by URL rule."),
      risk_flags: [],
      source_evidence: [],
      local_relevance: {},
    };
  }

  if (hint === "homepage") {
    return {
      page_type: "homepage",
      intent: "commercial",
      funnel_stage: "awareness",
      commercial_priority: "critical",
      seo_role: "conversion_page",
      confidence: 0.55,
      missing_page_context: note("Homepage classified by URL rule."),
      risk_flags: [],
      source_evidence: [],
      local_relevance: {},
    };
  }

  if (hint === "contact" || hint === "pricing") {
    return {
      page_type: hint,
      intent: hint === "pricing" ? "commercial" : "conversion",
      funnel_stage: "decision",
      commercial_priority: "high",
      seo_role: "conversion_page",
      confidence: 0.55,
      missing_page_context: note(`${hint} page classified by URL rule.`),
      risk_flags: [],
      source_evidence: [],
      local_relevance: {},
    };
  }

  if (looksLikeServiceContent(page)) {
    return {
      page_type: "service",
      intent: "commercial",
      funnel_stage: "consideration",
      commercial_priority: "high",
      seo_role: "conversion_page",
      confidence: 0.5,
      missing_page_context: note("Title/H1 indicate a service page."),
      risk_flags: [],
      source_evidence: [],
      local_relevance: {},
    };
  }

  return {
    page_type: hint ?? "other",
    intent: "informational",
    funnel_stage: "awareness",
    commercial_priority: hint === "about" || hint === "faq" ? "medium" : "low",
    seo_role: hint === "blog" ? "supporting_content" : null,
    confidence: 0.3,
    missing_page_context: note("Generic fallback — LLM failed and no specific rule matched."),
    risk_flags: [],
    source_evidence: [],
    local_relevance: {},
  };
}

function isObviouslyLowValue(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /\/(tag|tags|author|page\/\d+|category\/.*\/page\/|feed|wp-json|wp-admin|wp-login)/.test(
      path,
    );
  } catch {
    return false;
  }
}

/* ---------------- prioritization ---------------- */

function priorityScore(p: AuditPageRow, hint: PageType | null): number {
  let score = 0;
  if (hint === "homepage") score += 100;
  if (hint === "contact") score += 80;
  if (hint === "pricing") score += 70;
  if (hint === "about") score += 50;
  if (hint === "faq") score += 40;
  // service pages: heuristic - top-level path
  try {
    const path = new URL(p.url).pathname;
    if (path.split("/").filter(Boolean).length === 1 && !hint) score += 30;
  } catch {
    /* ignore */
  }
  const issues = Array.isArray(p.issues) ? p.issues.length : 0;
  score += Math.min(20, issues * 2);
  return score;
}

/* ---------------- LLM ---------------- */

function buildPrompt(
  page: AuditPageRow,
  hint: PageType | null,
  business: Record<string, unknown> | null,
  primaryAngle: string,
) {
  const businessSnip = business
    ? JSON.stringify({
        industry: business.industry ?? null,
        primaryOffer: business.primary_offer ?? null,
        serviceAreas: business.service_areas ?? [],
        mainPromise: business.main_promise ?? null,
      })
    : null;

  return `You classify a single website page for a business intelligence system.

Return STRICT JSON only matching this shape:
{
  "pageType": "homepage|service|location|blog|contact|about|faq|pricing|case_study|legal|landing|category|other",
  "intent": "informational|commercial|local|trust|conversion|support|navigational",
  "funnelStage": "awareness|consideration|decision|retention",
  "commercialPriority": "low|medium|high|critical",
  "seoRole": "rank_target|supporting_content|conversion_page|trust_page|navigation_page",
  "primaryTopic": "string",
  "contentSummary": "1-2 sentences in the page's language",
  "targetAudience": "string",
  "desiredAction": "what the visitor should do here",
  "recommendedCTA": "concrete CTA copy",
  "relevantStrategyAngle": "which business angle this page supports",
  "localRelevance": { "isLocal": boolean, "location": "string", "reason": "string" },
  "riskFlags": [{ "flag": "string", "level": "low|medium|high", "why": "string" }],
  "missingPageContext": [{ "missing": "string", "impact": "string" }],
  "confidence": 0.0-1.0,
  "sourceEvidence": [{ "field": "title|h1|meta|url|content", "quote": "exact short quote from input" }]
}

Rules:
- The URL hint is a prior, NOT a verdict. TITLE / H1 / META beat the URL hint when they clearly indicate a different page type. Example: URL "/about/" with title "Wat we doen" or "Onze diensten" → pageType "service", not "about". Only keep "about" when the content is mainly company/team/background.
- "werkwijze", "aanpak", "how it works", "process" pages are pageType "service", intent "trust", funnelStage "consideration", commercialPriority "high", seoRole "trust_page".
- commercialPriority "critical" = homepage / primary money page; "high" = contact, pricing, top service, process/trust pages; "medium" = supporting; "low" = legal/archive/blog noise.
- For blog/informational/low pages: only set recommendedCTA if it is grounded in the actual page content or the BUSINESS context. Do NOT invent hype CTAs like "Unlock...", "Discover how...", "The Art of...", "Transform your...". If no grounded CTA exists, return "" for recommendedCTA.
- Be honest: if information is thin, set confidence low and list missingPageContext.
- Never invent quotes; sourceEvidence quotes must come verbatim from the input fields.

Input:
URL: ${page.url}
URL_HINT: ${hint ?? "none"}
TITLE: ${page.title ?? ""}
H1: ${page.h1 ?? ""}
META: ${page.meta_description ?? ""}
WORD_COUNT: ${page.word_count}
INTERNAL_LINKS: ${page.internal_links_count}
EXTERNAL_LINKS: ${page.external_links_count}
ISSUES_COUNT: ${Array.isArray(page.issues) ? page.issues.length : 0}
${businessSnip ? `BUSINESS: ${businessSnip}` : ""}
${primaryAngle ? `PRIMARY_STRATEGY_ANGLE: ${primaryAngle}` : ""}
`;
}

async function classifyOne(
  page: AuditPageRow,
  hint: PageType | null,
  business: Record<string, unknown> | null,
  primaryAngle: string,
): Promise<{ ok: true; data: PageIntelligenceLLM } | { ok: false; error: string }> {
  try {
    const res = await llmComplete({
      task: "cheap",
      model: MODEL,
      jsonMode: true,
      timeoutMs: 25_000,
      retries: 1,
      system:
        "You are a precise classifier. Return only valid JSON matching the requested schema. Use the page's own language for free-text fields.",
      prompt: buildPrompt(page, hint, business, primaryAngle),
    });
    const text = res.text.trim();
    const jsonText = text.startsWith("```")
      ? text.replace(/^```(?:json)?/, "").replace(/```$/, "").trim()
      : text;
    const raw = JSON.parse(jsonText);
    const parsed = PageIntelligenceLLMSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: `Schema invalid: ${parsed.error.issues[0]?.message ?? "unknown"}` };
    }
    return { ok: true, data: parsed.data };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 200) };
  }
}

/* ---------------- main entry ---------------- */

export async function analyzePageIntelligenceForAudit({
  tenantId,
  auditId,
  forceRefresh,
}: AnalyzeArgs): Promise<AnalyzeSummary> {
  // Load pages for this audit
  const { data: rawPages, error: pErr } = await supabaseAdmin
    .from("audit_pages")
    .select(
      "id, page_id, url, title, meta_description, h1, word_count, internal_links_count, external_links_count, images_without_alt, issues",
    )
    .eq("audit_id", auditId)
    .eq("tenant_id", tenantId);
  if (pErr) throw pErr;
  const allPages = (rawPages ?? []) as AuditPageRow[];

  // Filter low-value, dedupe by URL
  const seen = new Set<string>();
  const candidates: Array<{ page: AuditPageRow; hint: PageType | null }> = [];
  for (const p of allPages) {
    if (!p.url || seen.has(p.url)) continue;
    seen.add(p.url);
    if (isObviouslyLowValue(p.url)) continue;
    candidates.push({ page: p, hint: urlHintType(p.url) });
  }

  // Prioritize + cap
  candidates.sort((a, b) => priorityScore(b.page, b.hint) - priorityScore(a.page, a.hint));
  const selected = candidates.slice(0, MAX_PAGES);
  const skippedCount = allPages.length - selected.length;

  // Skip already-analyzed when not forceRefresh
  let toAnalyze = selected;
  if (!forceRefresh) {
    const pageIds = selected.map((c) => c.page.page_id).filter((id): id is string => !!id);
    if (pageIds.length > 0) {
      const { data: existing } = await supabaseAdmin
        .from("page_intelligence")
        .select("page_id")
        .eq("tenant_id", tenantId)
        .in("page_id", pageIds);
      const existingSet = new Set((existing ?? []).map((r) => r.page_id));
      toAnalyze = selected.filter((c) => !c.page.page_id || !existingSet.has(c.page.page_id));
    }
  }

  // Load business profile + primary angle once
  const { data: bp } = await supabaseAdmin
    .from("business_profiles")
    .select("industry, primary_offer, service_areas, main_promise")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { data: bpv2 } = await supabaseAdmin
    .from("business_profiles_v2")
    .select("strategy_angles")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const angles = (bpv2?.strategy_angles ?? []) as Array<{ angle?: string; isPrimary?: boolean }>;
  const primaryAngle =
    angles.find((a) => a.isPrimary)?.angle ?? angles[0]?.angle ?? "";

  let analyzedCount = 0;
  let failedCount = 0;
  let criticalCount = 0;
  let highCount = 0;

  // Sequential to stay within timeout budgets; concurrency=3 would be next step.
  for (const { page, hint } of toAnalyze) {
    const result = await classifyOne(page, hint, bp ?? null, primaryAngle);

    let row: Record<string, unknown>;
    if (result.ok) {
      const d = result.data;

      // --- Post-LLM normalization ---
      let pageType = d.pageType;
      let intent = d.intent;
      let funnelStage = d.funnelStage;
      let commercialPriority = d.commercialPriority;
      let seoRole = d.seoRole;
      let recommendedCTA = d.recommendedCTA;
      const missingCtx = [...(d.missingPageContext ?? [])];

      // Content beats URL: title/H1 strongly says service → override "about".
      if (pageType === "about" && looksLikeServiceContent(page)) {
        pageType = "service";
        if (intent === "informational") intent = "trust";
        if (commercialPriority === "low" || commercialPriority === "medium") {
          commercialPriority = "high";
        }
        if (!seoRole) seoRole = "trust_page";
        missingCtx.push({
          missing: "content_beats_url_override",
          impact: "URL hinted 'about' but title/H1 indicate a service/offer page.",
        });
      }

      // Process / werkwijze pages must land as service / trust / high.
      if (isProcessPage(page.url)) {
        if (pageType !== "service") pageType = "service";
        if (intent !== "trust" && intent !== "commercial") intent = "trust";
        if (!funnelStage) funnelStage = "consideration";
        if (commercialPriority === "low") commercialPriority = "high";
        if (!seoRole) seoRole = "trust_page";
      }

      // Hype-CTA cleanup for blog/low pages: drop ungrounded marketing fluff.
      if (
        pageType === "blog" &&
        (commercialPriority === "low" || commercialPriority === "medium") &&
        recommendedCTA &&
        HYPE_CTA_RE.test(recommendedCTA)
      ) {
        missingCtx.push({
          missing: "cta_stripped_hype",
          impact: `Removed ungrounded hype CTA: "${recommendedCTA}"`,
        });
        recommendedCTA = "";
      }

      analyzedCount++;
      if (commercialPriority === "critical") criticalCount++;
      if (commercialPriority === "high") highCount++;
      row = {
        tenant_id: tenantId,
        audit_id: auditId,
        audit_page_id: page.id,
        page_id: page.page_id,
        page_url: page.url,
        page_type: pageType,
        intent,
        funnel_stage: funnelStage ?? null,
        commercial_priority: commercialPriority,
        seo_role: seoRole ?? null,
        primary_topic: d.primaryTopic || null,
        content_summary: d.contentSummary || null,
        target_audience: d.targetAudience || null,
        desired_action: d.desiredAction || null,
        recommended_cta: recommendedCTA || null,
        relevant_strategy_angle: d.relevantStrategyAngle || null,
        local_relevance: d.localRelevance ?? {},
        risk_flags: d.riskFlags ?? [],
        missing_page_context: missingCtx,
        confidence: d.confidence,
        source_evidence: d.sourceEvidence ?? [],
        model_used: MODEL,
        analyzed_at: new Date().toISOString(),
      };
    } else {
      // --- Deterministic rule-based fallback (no generic other/low when we can do better) ---
      failedCount++;
      const fb = ruleBasedFallback(page, hint, result.error);
      if (fb.commercial_priority === "critical") criticalCount++;
      if (fb.commercial_priority === "high") highCount++;
      row = {
        tenant_id: tenantId,
        audit_id: auditId,
        audit_page_id: page.id,
        page_id: page.page_id,
        page_url: page.url,
        ...fb,
        model_used: `${MODEL} (fallback)`,
        analyzed_at: new Date().toISOString(),
      };
    }

    // Upsert by (tenant_id, page_id) when page_id present, otherwise insert
    if (page.page_id) {
      const { error: uErr } = await supabaseAdmin
        .from("page_intelligence")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(row as any, { onConflict: "tenant_id,page_id" });
      if (uErr) {
        failedCount++;
        analyzedCount = Math.max(0, analyzedCount - 1);
        console.error("page_intelligence upsert failed", JSON.stringify(uErr), "row keys:", Object.keys(row));
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: iErr } = await supabaseAdmin.from("page_intelligence").insert(row as any);
      if (iErr) {
        failedCount++;
        analyzedCount = Math.max(0, analyzedCount - 1);
        console.error("page_intelligence insert failed", iErr);
      }
    }
  }

  return {
    analyzedCount,
    failedCount,
    skippedCount,
    criticalCount,
    highCount,
  };
}
