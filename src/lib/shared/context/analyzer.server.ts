/**
 * Context Layer analyzers — server-only.
 *
 * - analyzeBrandVoiceForTenant: fetches a handful of pages from the
 *   tenant's primary site connection and asks the LLM to summarize the
 *   brand voice. Result is persisted in `brand_voice_profiles`.
 *
 * - classifyAuditPage: classifies a single audit page into
 *   { page_type, intent, commercial_priority, ... } and persists to
 *   `page_intelligence` (upsert keyed on audit_page_id).
 *
 * No mock data. Failures bubble up so callers can show error states.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { llmComplete } from "@/lib/shared/llm/router.server";
import { extract } from "@/lib/shared/audits/extract.server";
import {
  BrandVoiceOutputSchema,
  PageClassificationSchema,
  type BrandVoiceOutput,
  type PageClassification,
} from "@/lib/shared/db/repos/context.schemas";

function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("No JSON object in LLM response");
  return JSON.parse(cleaned.slice(first, last + 1));
}

async function fetchHtml(url: string, timeoutMs = 8000): Promise<string | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "LeadLayerBot/1.0 (+context-analyzer)" },
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ============= Brand Voice =============

export async function analyzeBrandVoiceForTenant(
  tenantId: string,
): Promise<BrandVoiceOutput> {
  // Mark job running (upsert)
  await supabaseAdmin
    .from("brand_voice_profiles")
    .upsert(
      {
        tenant_id: tenantId,
        job_status: "running",
        job_error: null,
      },
      { onConflict: "tenant_id" },
    );

  try {
    // Pick the most recent finished audit's pages — they're already crawled
    // and stored, so we don't need to refetch from the live site.
    const { data: audit } = await supabaseAdmin
      .from("audits")
      .select("id, finished_at")
      .eq("tenant_id", tenantId)
      .eq("status", "succeeded")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const samples: Array<{ url: string; text: string }> = [];
    const sourceUrls: string[] = [];

    if (audit?.id) {
      const { data: pages } = await supabaseAdmin
        .from("audit_pages")
        .select("url")
        .eq("audit_id", audit.id)
        .limit(6);
      for (const p of pages ?? []) {
        const html = await fetchHtml(p.url as string);
        if (!html) continue;
        const ext = extract(html, p.url as string);
        const text = [ext.title, ext.h1, ext.meta_description]
          .filter(Boolean)
          .join("\n");
        if (text.length > 20) {
          samples.push({ url: p.url as string, text });
          sourceUrls.push(p.url as string);
        }
        if (samples.length >= 5) break;
      }
    }

    if (samples.length === 0) {
      throw new Error(
        "Geen pagina's beschikbaar om de merkstem uit af te leiden. Voer eerst een audit uit.",
      );
    }

    const prompt = [
      "Analyseer de merkstem (brand voice) op basis van deze paginafragmenten.",
      "Geef uitsluitend JSON terug volgens dit schema:",
      `{
  "tone_summary": "korte beschrijving van de toon (NL)",
  "writing_style": { "formality": "...", "sentence_length": "...", "person": "...", "style_rules": ["..."] },
  "preferred_words": ["..."],
  "forbidden_words": ["..."],
  "example_phrases": ["..."],
  "reading_level": "A2/B1/B2/C1",
  "language": "nl"
}`,
      "",
      "Paginafragmenten:",
      samples
        .map((s, i) => `[${i + 1}] ${s.url}\n${s.text}`)
        .join("\n\n"),
      "",
      "Antwoord ALLEEN met geldige JSON. Geen uitleg, geen markdown.",
    ].join("\n");

    const result = await llmComplete({
      task: "cheap",
      system:
        "Je bent een merkstrateeg. Output uitsluitend valide JSON volgens het gevraagde schema.",
      prompt,
      temperature: 0.2,
      maxTokens: 900,
    });

    const parsed = BrandVoiceOutputSchema.parse(extractJson(result.text));

    await supabaseAdmin
      .from("brand_voice_profiles")
      .update({
        tone_summary: parsed.tone_summary,
        writing_style: parsed.writing_style,
        preferred_words: parsed.preferred_words,
        forbidden_words: parsed.forbidden_words,
        example_phrases: parsed.example_phrases,
        reading_level: parsed.reading_level ?? null,
        language: parsed.language,
        source_urls: sourceUrls,
        job_status: "done",
        job_error: null,
        analyzed_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId);

    return parsed;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from("brand_voice_profiles")
      .update({ job_status: "failed", job_error: message })
      .eq("tenant_id", tenantId);
    throw e;
  }
}

// ============= Page Intelligence =============

type AuditPageLite = {
  id: string;
  url: string;
  title: string | null;
  meta_description: string | null;
  h1: string | null;
  word_count: number;
};

export async function classifyAuditPage(
  auditId: string,
  auditPageId: string,
): Promise<PageClassification> {
  const { data: audit } = await supabaseAdmin
    .from("audits")
    .select("id, tenant_id")
    .eq("id", auditId)
    .single();
  if (!audit) throw new Error("Audit not found");

  const { data: page } = await supabaseAdmin
    .from("audit_pages")
    .select("id, url, title, meta_description, h1, word_count, page_id")
    .eq("id", auditPageId)
    .eq("audit_id", auditId)
    .single();
  if (!page) throw new Error("Audit page not found");
  const p = page as AuditPageLite & { page_id: string | null };

  const prompt = [
    "Classificeer onderstaande webpagina.",
    `URL: ${p.url}`,
    `Title: ${p.title ?? "(geen)"}`,
    `Meta: ${p.meta_description ?? "(geen)"}`,
    `H1: ${p.h1 ?? "(geen)"}`,
    `Woorden: ${p.word_count}`,
    "",
    "Geef ALLEEN JSON volgens dit schema:",
    `{
  "page_type": "homepage|service|blog|location|contact|landing|category|about|other",
  "intent": "informational|commercial|local|trust|conversion|navigational",
  "commercial_priority": "low|medium|high",
  "target_keyword": "...",
  "target_audience": "...",
  "desired_action": "bellen|formulier|afspraak|whatsapp|lezen|...",
  "funnel_stage": "awareness|consideration|decision",
  "summary": "1-2 zinnen NL"
}`,
  ].join("\n");

  const result = await llmComplete({
    task: "cheap",
    system:
      "Je classificeert webpagina's voor een SEO-tool. Output uitsluitend valide JSON.",
    prompt,
    temperature: 0.1,
    maxTokens: 400,
  });
  const parsed = PageClassificationSchema.parse(extractJson(result.text));

  // Upsert keyed on audit_page_id
  await supabaseAdmin
    .from("page_intelligence")
    .delete()
    .eq("audit_page_id", auditPageId);
  await supabaseAdmin.from("page_intelligence").insert({
    tenant_id: audit.tenant_id,
    page_id: p.page_id ?? null,
    audit_page_id: auditPageId,
    page_type: parsed.page_type,
    intent: parsed.intent,
    commercial_priority: parsed.commercial_priority,
    target_keyword: parsed.target_keyword ?? null,
    target_audience: parsed.target_audience ?? null,
    desired_action: parsed.desired_action ?? null,
    funnel_stage: parsed.funnel_stage ?? null,
    summary: parsed.summary ?? null,
  });

  return parsed;
}
