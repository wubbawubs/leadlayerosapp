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

function urlHintType(url: string): PageType | null {
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = url.toLowerCase();
  }
  if (path === "" || path === "/" || path === "/home") return "homepage";
  if (/\/contact(?:\/|$)|\/contact-us(?:\/|$)/.test(path)) return "contact";
  if (/\/(about|over-ons|over)(?:\/|$)/.test(path)) return "about";
  if (/\/faq(?:\/|$)|\/veelgestelde/.test(path)) return "faq";
  if (/\/pricing(?:\/|$)|\/tarieven(?:\/|$)|\/prijzen(?:\/|$)/.test(path)) return "pricing";
  if (/\/(case-?study|cases|case|portfolio|projecten)(?:\/|$)/.test(path)) return "case_study";
  if (/\/(privacy|terms|disclaimer|cookies|algemene-voorwaarden)(?:\/|$)/.test(path)) return "legal";
  if (/\/blog\//.test(path) || /\/\d{4}\/\d{2}\//.test(path)) return "blog";
  return null;
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
- Use the deterministic URL hint as a strong prior, but override if title/h1/meta clearly contradict.
- commercialPriority "critical" = homepage / primary money page; "high" = contact, pricing, top service; "medium" = supporting; "low" = legal/archive/blog noise.
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
      analyzedCount++;
      if (d.commercialPriority === "critical") criticalCount++;
      if (d.commercialPriority === "high") highCount++;
      row = {
        tenant_id: tenantId,
        audit_id: auditId,
        audit_page_id: page.id,
        page_id: page.page_id,
        page_url: page.url,
        page_type: d.pageType,
        intent: d.intent,
        funnel_stage: d.funnelStage ?? null,
        commercial_priority: d.commercialPriority,
        seo_role: d.seoRole ?? null,
        primary_topic: d.primaryTopic || null,
        content_summary: d.contentSummary || null,
        target_audience: d.targetAudience || null,
        desired_action: d.desiredAction || null,
        recommended_cta: d.recommendedCTA || null,
        relevant_strategy_angle: d.relevantStrategyAngle || null,
        local_relevance: d.localRelevance ?? {},
        risk_flags: d.riskFlags ?? [],
        missing_page_context: d.missingPageContext ?? [],
        confidence: d.confidence,
        source_evidence: d.sourceEvidence ?? [],
        model_used: MODEL,
        analyzed_at: new Date().toISOString(),
      };
    } else {
      failedCount++;
      row = {
        tenant_id: tenantId,
        audit_id: auditId,
        audit_page_id: page.id,
        page_id: page.page_id,
        page_url: page.url,
        page_type: hint ?? "other",
        intent: "informational",
        commercial_priority: "low",
        confidence: 0,
        missing_page_context: [
          { missing: "LLM classification failed", impact: result.error },
        ],
        model_used: MODEL,
        analyzed_at: new Date().toISOString(),
      };
    }

    // Upsert by (tenant_id, page_id) when page_id present, otherwise insert
    if (page.page_id) {
      const { error: uErr } = await supabaseAdmin
        .from("page_intelligence")
        .upsert(row, { onConflict: "tenant_id,page_id" });
      if (uErr) {
        failedCount++;
        analyzedCount = Math.max(0, analyzedCount - 1);
        console.error("page_intelligence upsert failed", uErr);
      }
    } else {
      const { error: iErr } = await supabaseAdmin.from("page_intelligence").insert(row);
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
