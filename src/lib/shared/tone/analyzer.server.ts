/**
 * Tone Profile analyzer — server-only.
 *
 * Pipeline:
 *  1. Pick up to 8 pages from the latest succeeded audit (homepage, services, blogs, about, contact).
 *  2. Fetch + extract text per page.
 *  3. Per-sample quality scoring (cheap LLM) — keep only samples with quality >= 5.
 *  4. One LLM call (pro) to extract the full tone profile JSON.
 *  5. Persist tone_profiles + tone_profile_samples; status = 'draft'.
 *
 * No mock data. Failures bubble up and mark job_status = 'failed'.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { llmComplete } from "@/lib/shared/llm/router.server";
import { extract } from "@/lib/shared/audits/extract.server";
import {
  ToneProfileSchema,
  type ToneProfile,
} from "./schemas";

type SampleSource =
  | "homepage"
  | "service"
  | "blog"
  | "about"
  | "contact"
  | "manual_paste"
  | "approved_proposal"
  | "other";

interface RawSample {
  url: string;
  source_type: SampleSource;
  text: string;
}

interface ScoredSample extends RawSample {
  quality: number; // 0-10
  weight: number;
  analysis: Record<string, unknown>;
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
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
      headers: { "user-agent": "LeadLayerBot/1.0 (+tone-analyzer)" },
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

function classifyUrl(url: string): SampleSource {
  const u = url.toLowerCase();
  try {
    const parsed = new URL(u);
    if (parsed.pathname === "/" || parsed.pathname === "") return "homepage";
    if (/blog|nieuws|news|artikel/.test(parsed.pathname)) return "blog";
    if (/about|over|team/.test(parsed.pathname)) return "about";
    if (/contact/.test(parsed.pathname)) return "contact";
    if (/diensten|service|product/.test(parsed.pathname)) return "service";
  } catch {
    // ignore
  }
  return "other";
}

function htmlToVisibleText(html: string): string {
  // Strip script/style and tags. Cheap but effective for sample purposes.
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const text = noScript.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text;
}

async function pickSampleUrls(tenantId: string): Promise<Array<{ url: string; source_type: SampleSource }>> {
  const { data: audit } = await supabaseAdmin
    .from("audits")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "succeeded")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!audit?.id) return [];

  const { data: pages } = await supabaseAdmin
    .from("audit_pages")
    .select("url")
    .eq("audit_id", audit.id)
    .limit(40);

  const classified = (pages ?? []).map((p) => ({
    url: p.url as string,
    source_type: classifyUrl(p.url as string),
  }));

  // Diversity-aware pick: 1 homepage, up to 3 service, up to 2 blog, 1 about, 1 contact.
  const buckets: Record<SampleSource, number> = {
    homepage: 1, service: 3, blog: 2, about: 1, contact: 1,
    other: 1, manual_paste: 0, approved_proposal: 0,
  };
  const picked: typeof classified = [];
  for (const c of classified) {
    const cap = buckets[c.source_type] ?? 0;
    const have = picked.filter((p) => p.source_type === c.source_type).length;
    if (have < cap) picked.push(c);
    if (picked.length >= 8) break;
  }
  return picked;
}

async function fetchRawSamples(picks: Array<{ url: string; source_type: SampleSource }>): Promise<RawSample[]> {
  const out: RawSample[] = [];
  for (const p of picks) {
    const html = await fetchHtml(p.url);
    if (!html) continue;
    // Use extractor to get title/meta/h1; combine with visible text for richer sample.
    const ext = extract(html, p.url);
    const visible = htmlToVisibleText(html).slice(0, 4000);
    const text = [
      ext.title ? `TITLE: ${ext.title}` : "",
      ext.h1 ? `H1: ${ext.h1}` : "",
      ext.meta_description ? `META: ${ext.meta_description}` : "",
      visible,
    ]
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text.length < 80) continue;
    out.push({ url: p.url, source_type: p.source_type, text });
  }
  return out;
}

async function scoreSample(sample: RawSample): Promise<ScoredSample | null> {
  const prompt = [
    "Beoordeel de bruikbaarheid van deze webpagina-tekst als 'brand voice sample'.",
    "Output uitsluitend JSON:",
    `{"quality": 0-10, "isCommercial": true|false, "isGeneric": true|false, "language": "nl"|"en"|...}`,
    "",
    `URL: ${sample.url}`,
    `Type: ${sample.source_type}`,
    "",
    sample.text.slice(0, 2500),
  ].join("\n");
  try {
    const r = await llmComplete({
      task: "cheap",
      system: "Je beoordeelt teksten kort en streng. Output uitsluitend valide JSON.",
      prompt,
      temperature: 0.1,
      maxTokens: 200,
    });
    const j = extractJson(r.text) as {
      quality?: number;
      isCommercial?: boolean;
      isGeneric?: boolean;
      language?: string;
    };
    const quality = Math.max(0, Math.min(10, Number(j.quality ?? 0)));
    if (quality < 5) return null;
    const weight = j.isGeneric ? Math.max(0.3, quality / 15) : quality / 10;
    return {
      ...sample,
      quality,
      weight,
      analysis: {
        isCommercial: !!j.isCommercial,
        isGeneric: !!j.isGeneric,
        language: j.language ?? null,
      },
    };
  } catch (e) {
    console.error("[tone] sample scoring failed", sample.url, (e as Error).message);
    return null;
  }
}

function buildExtractPrompt(samples: ScoredSample[], locale: string): string {
  const samplesBlock = samples
    .map(
      (s, i) =>
        `--- SAMPLE ${i + 1} | ${s.source_type} | weight=${s.weight.toFixed(2)} | ${s.url}\n${s.text.slice(0, 2500)}`,
    )
    .join("\n\n");

  return [
    "Bouw een gedetailleerd LINGUISTISCH MERKMODEL uit onderstaande website-samples.",
    "Niet generiek. Concreet. Beschrijf hoe DIT merk schrijft, niet hoe een 'professioneel merk' schrijft.",
    "",
    `Locale: ${locale}`,
    "",
    "Output UITSLUITEND geldige JSON met dit schema (alle velden verplicht, lijsten leeg [] als onbekend):",
    `{
  "voiceIdentity": {
    "summary": "string (50-300 woorden NL, zeer specifiek)",
    "persona": "string",
    "emotionalRegister": "string",
    "authorityStyle": "string",
    "commercialIntensity": "low|medium|high"
  },
  "sentenceArchitecture": {
    "averageSentenceLength": "string (bv '8-16 woorden')",
    "paragraphLength": "string",
    "preferredStructure": "string",
    "usesQuestions": boolean,
    "passiveVoicePolicy": "avoid|tolerate|prefer",
    "rhythm": "string"
  },
  "vocabulary": {
    "preferred": ["concrete woorden die het merk vaak gebruikt"],
    "avoid": ["woorden die het merk vermijdt"],
    "forbidden": ["woorden die NOOIT mogen (hype, jargon, overclaims)"],
    "replacements": {"slechtWoord":"betereWoord"},
    "technicalTermsPolicy": "string"
  },
  "claimStyle": {
    "allowedClaims": ["concrete veilige beloftes"],
    "riskyClaims": ["te grote beloftes om te vermijden"],
    "forbiddenClaims": ["juridisch risicovol of misleidend"],
    "safeClaimPatterns": ["herbruikbare zinsbouw"],
    "evidenceRequiredFor": ["claims die altijd bewijs nodig hebben"]
  },
  "ctaStyle": {
    "primaryCtaPatterns": ["concrete CTA voorbeelden"],
    "secondaryCtaPatterns": ["..."],
    "style": "string",
    "avoid": ["te schreeuwerige CTA's"]
  },
  "trustStyle": {
    "primaryTrustDrivers": ["..."],
    "proofTypes": ["..."],
    "trustLanguage": "string",
    "avoid": ["..."]
  },
  "audienceAdaptation": {},
  "localeTone": {
    "locale": "${locale}",
    "salesIntensity": "low|medium|high",
    "culturalNotes": ["..."],
    "spelling": "string",
    "formality": "u|je|mix"
  },
  "examples": {
    "good": ["letterlijke zinnen uit samples die merkstem goed vangen, 5-8 stuks"],
    "bad": ["zinnen die je NOOIT zou schrijven voor dit merk, 3-5 stuks"],
    "rewritePatterns": [{"bad":"...","good":"...","rule":"..."}]
  },
  "scoringWeights": {
    "voiceFit":0.2,"vocabularyFit":0.15,"sentenceRhythmFit":0.15,
    "claimSafety":0.2,"ctaFit":0.1,"localeFit":0.1,"genericnessRisk":0.1
  }
}`,
    "",
    "SAMPLES:",
    samplesBlock,
    "",
    "Antwoord ALLEEN met geldige JSON. Geen markdown, geen uitleg.",
  ].join("\n");
}

export async function analyzeToneProfileForTenant(tenantId: string): Promise<ToneProfile> {
  // 1. Upsert running row
  await supabaseAdmin
    .from("tone_profiles")
    .upsert(
      { tenant_id: tenantId, job_status: "running", job_error: null },
      { onConflict: "tenant_id" },
    );

  try {
    const picks = await pickSampleUrls(tenantId);
    if (picks.length === 0) {
      throw new Error("Geen audit-pagina's beschikbaar. Voer eerst een audit uit.");
    }

    const rawSamples = await fetchRawSamples(picks);
    if (rawSamples.length === 0) throw new Error("Kon geen pagina-content ophalen.");

    // Sequential scoring to stay within rate limits
    const scored: ScoredSample[] = [];
    for (const s of rawSamples) {
      const r = await scoreSample(s);
      if (r) scored.push(r);
    }
    if (scored.length === 0) {
      throw new Error("Alle samples scoorden te laag op kwaliteit. Verbeter de site of voeg handmatige samples toe.");
    }

    // 4. Extract full profile
    const locale = "nl-NL";
    const extractResult = await llmComplete({
      task: "default", // gemini-2.5-pro
      system:
        "Je bent een merkstrateeg én linguïst. Je bouwt een diep, bruikbaar taalprofiel. Output uitsluitend valide JSON volgens het gevraagde schema.",
      prompt: buildExtractPrompt(scored, locale),
      temperature: 0.2,
      maxTokens: 3000,
    });

    const profile = ToneProfileSchema.parse(extractJson(extractResult.text));

    // Confidence: mean quality * (clamped 1..1) with small bonus per sample
    const avgQuality =
      scored.reduce((acc, s) => acc + s.quality, 0) / scored.length;
    const confidence = Math.min(10, avgQuality + Math.min(1.5, scored.length * 0.15));

    // Get current row id
    const { data: existing } = await supabaseAdmin
      .from("tone_profiles")
      .select("id")
      .eq("tenant_id", tenantId)
      .single();
    const toneProfileId = existing!.id as string;

    // Replace samples
    await supabaseAdmin.from("tone_profile_samples").delete().eq("tone_profile_id", toneProfileId);
    if (scored.length > 0) {
      await supabaseAdmin.from("tone_profile_samples").insert(
        scored.map((s) => ({
          tenant_id: tenantId,
          tone_profile_id: toneProfileId,
          source_type: s.source_type,
          source_url: s.url,
          text: s.text.slice(0, 8000),
          quality_score: s.quality,
          weight: s.weight,
          analysis: s.analysis as never,
        })),
      );
    }

    await supabaseAdmin
      .from("tone_profiles")
      .update({
        profile: profile as never,
        confidence_score: confidence,
        source_summary: {
          sample_count: scored.length,
          avg_quality: avgQuality,
          sources: scored.map((s) => ({ url: s.url, type: s.source_type, q: s.quality })),
        } as never,
        job_status: "done",
        job_error: null,
        analyzed_at: new Date().toISOString(),
        language: "nl",
        locale,
      })
      .eq("id", toneProfileId);

    return profile;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from("tone_profiles")
      .update({ job_status: "failed", job_error: msg })
      .eq("tenant_id", tenantId);
    throw e;
  }
}
