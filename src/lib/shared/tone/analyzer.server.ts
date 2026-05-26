/**
 * Tone Profile analyzer — server-only.
 *
 * V2 pipeline (evidence-first):
 *  1. Pick up to ~18 URLs from latest audit + site sitemap (diverse bucket caps).
 *  2. Observe each page: visible text, anchor/button CTAs, claim-bearing sentences,
 *     headlines — all extracted from real HTML, no LLM fantasy.
 *  3. Load manual_paste samples added by operator (high weight).
 *  4. Lenient quality scoring per sample (cheap LLM) with fallback so we never
 *     bail on a valid site.
 *  5. Single synthesis call (pro) that receives the per-sample text AND the
 *     aggregated CTA / claim / headline candidate lists. The model picks from
 *     these candidates instead of inventing them.
 *  6. Persist tone_profiles + tone_profile_samples.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { llmComplete } from "@/lib/shared/llm/router.server";
import {
  ToneProfileSchema,
  type ToneProfile,
} from "./schemas";
import {
  aggregateLists,
  discoverSitemapUrls,
  observePage,
  pickDiverse,
  type PageObservation,
  type SampleSource,
  type UrlPick,
} from "./corpus.server";
import { loadBusinessLocale, type BusinessLocale } from "./businessContext.server";


interface ScoredObservation extends PageObservation {
  quality: number; // 0-10
  weight: number;
  analysis: Record<string, unknown>;
}

import { jsonrepair } from "jsonrepair";

function extractJson(text: string): unknown {
  if (!text || !text.trim()) throw new Error("LLM returned empty response");
  let cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const first = cleaned.search(/[{[]/);
  if (first === -1) {
    throw new Error(`No JSON object in LLM response (got: ${text.slice(0, 200)})`);
  }
  const opener = cleaned[first];
  const closer = opener === "[" ? "]" : "}";
  const last = cleaned.lastIndexOf(closer);
  if (last === -1 || last < first) {
    // Truncated — let jsonrepair try to close it
    cleaned = cleaned.slice(first);
  } else {
    cleaned = cleaned.slice(first, last + 1);
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    // Robust repair: closes braces/brackets, fixes trailing commas, unescaped quotes, etc.
    try {
      return JSON.parse(jsonrepair(cleaned));
    } catch (e) {
      throw new Error(`JSON repair failed: ${(e as Error).message}`);
    }
  }
}

async function pickFromAuditAndSitemap(tenantId: string): Promise<UrlPick[]> {
  // 1) Latest succeeded audit pages
  const { data: audit } = await supabaseAdmin
    .from("audits")
    .select("id, site_connection_id")
    .eq("tenant_id", tenantId)
    .eq("status", "succeeded")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const auditUrls: string[] = [];
  let origin: string | null = null;
  if (audit?.id) {
    const { data: pages } = await supabaseAdmin
      .from("audit_pages")
      .select("url")
      .eq("audit_id", audit.id)
      .limit(60);
    for (const p of pages ?? []) {
      const u = p.url as string;
      auditUrls.push(u);
      if (!origin) {
        try {
          origin = new URL(u).origin;
        } catch {
          /* skip */
        }
      }
    }
  }

  // Fallback origin via site_connection row
  if (!origin && audit?.site_connection_id) {
    const { data: conn } = await supabaseAdmin
      .from("site_connections")
      .select("base_url")
      .eq("id", audit.site_connection_id)
      .maybeSingle();
    if (conn?.base_url) {
      try {
        origin = new URL(conn.base_url as string).origin;
      } catch {
        /* ignore */
      }
    }
  }


  // 2) Sitemap discovery (broader coverage)
  let sitemapUrls: string[] = [];
  if (origin) {
    try {
      sitemapUrls = await discoverSitemapUrls(origin, 60);
    } catch {
      sitemapUrls = [];
    }
  }

  // Merge with audit URLs first (likely already verified working)
  const merged = [...auditUrls, ...sitemapUrls];
  if (merged.length === 0) return [];
  return pickDiverse(merged, 8);
}

interface ManualSample {
  text: string;
  source_url: string | null;
  source_type: SampleSource;
}

async function loadManualSamples(tenantId: string): Promise<ManualSample[]> {
  // Manual samples persist across runs; user can keep adding them to lift confidence.
  const { data: existing } = await supabaseAdmin
    .from("tone_profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!existing?.id) return [];
  const { data: rows } = await supabaseAdmin
    .from("tone_profile_samples")
    .select("text, source_url, source_type")
    .eq("tone_profile_id", existing.id)
    .in("source_type", ["manual_paste", "approved_proposal"])
    .limit(20);
  return (rows ?? []).map((r) => ({
    text: (r.text as string) ?? "",
    source_url: (r.source_url as string | null) ?? null,
    source_type: r.source_type as SampleSource,
  }));
}

async function scoreObservation(o: PageObservation): Promise<ScoredObservation> {
  const prompt = [
    "Beoordeel de bruikbaarheid van deze webpagina-tekst als 'brand voice sample'.",
    "Wees mild: een normale commerciële pagina met >100 woorden eigen tekst is al bruikbaar (quality 5-7).",
    "Geef alleen quality < 3 als de pagina vrijwel geen leesbare tekst bevat (cookie banner, 404, lege pagina).",
    "Output uitsluitend JSON:",
    `{"quality": 0-10, "isCommercial": true|false, "isGeneric": true|false, "language": "nl"|"en"|...}`,
    "",
    `URL: ${o.url}`,
    `Type: ${o.source_type}`,
    "",
    o.text.slice(0, 2500),
  ].join("\n");
  let quality = 5;
  let analysis: Record<string, unknown> = {};
  try {
    const r = await llmComplete({
      task: "cheap",
      system: "Je beoordeelt teksten kort en mild. Output uitsluitend valide JSON.",
      prompt,
      temperature: 0.1,
      maxTokens: 300,
      jsonMode: true,
    });
    const j = extractJson(r.text) as {
      quality?: number;
      isCommercial?: boolean;
      isGeneric?: boolean;
      language?: string;
    };
    quality = Math.max(0, Math.min(10, Number(j.quality ?? 5)));
    analysis = {
      isCommercial: !!j.isCommercial,
      isGeneric: !!j.isGeneric,
      language: j.language ?? null,
    };
  } catch (e) {
    console.error("[tone] sample scoring failed, fallback q=4", o.url, (e as Error).message);
    quality = 4;
  }
  const isGeneric = (analysis as { isGeneric?: boolean }).isGeneric;
  const weight = isGeneric ? Math.max(0.3, quality / 15) : Math.max(0.4, quality / 10);
  return { ...o, quality, weight, analysis };
}

function buildSynthesisPrompt(
  scored: ScoredObservation[],
  manualSamples: ManualSample[],
  aggregated: ReturnType<typeof aggregateLists>,
  bizLocale: BusinessLocale,
): string {
  const locale = bizLocale.locale;
  const samplesBlock = scored
    .map(
      (s, i) =>
        `--- SAMPLE ${i + 1} | ${s.source_type} | weight=${s.weight.toFixed(2)} | ${s.url}\n${s.text.slice(0, 2200)}`,
    )
    .join("\n\n");

  const manualBlock = manualSamples.length
    ? "\n\nMANUAL SAMPLES (operator-provided, hoogste gewicht):\n" +
      manualSamples
        .map((m, i) => `--- MANUAL ${i + 1} | ${m.source_type}${m.source_url ? ` | ${m.source_url}` : ""}\n${m.text.slice(0, 2200)}`)
        .join("\n\n")
    : "";

  const ctaList = aggregated.ctas.length
    ? aggregated.ctas.map((c) => `- "${c.text}" (×${c.count})`).join("\n")
    : "(geen CTA's gevonden — geef lege primary/secondary lijsten)";
  const claimList = aggregated.claimSentences.length
    ? aggregated.claimSentences.slice(0, 20).map((c) => `- "${c.text}"`).join("\n")
    : "(geen claim-zinnen gevonden)";
  const headlinesList = aggregated.headlines.length
    ? aggregated.headlines.slice(0, 20).map((h) => `- "${h.text}"`).join("\n")
    : "(geen headlines gevonden)";

  return [
    `Bouw een gedetailleerd LINGUISTISCH MERKMODEL uit onderstaande website-samples voor merk: ${bizLocale.businessName ?? "(onbekend)"}.`,
    "Niet generiek. Concreet. Beschrijf hoe DIT merk schrijft, niet hoe een 'professioneel merk' schrijft.",
    "",
    `Doeltaal: ${bizLocale.languageName} (locale: ${locale}). ALLE tekstuele velden in het profiel (summary, persona, examples, ctaPatterns, claims, vocabulary, replacements, rewritePatterns, etc.) MOETEN in ${bizLocale.languageName} geschreven worden. Beschrijvende veldnamen blijven Engels (schema-keys), waarden zijn in ${bizLocale.languageName}.`,
    "",
    "STRIKTE REGELS:",
    "- CTA-velden (primaryCtaPatterns, secondaryCtaPatterns) MOETEN letterlijk komen uit de 'WAARGENOMEN CTA's' lijst hieronder. Verzin geen CTA's. Kies de 3-6 sterkste primary en 2-4 secondary.",
    "- examples.good MOET 5-8 LETTERLIJKE zinnen uit de samples bevatten (kopieer woord-voor-woord).",
    "- vocabulary.avoid mag GEEN woord bevatten dat in de samples meer dan 1× positief gebruikt wordt door het merk zelf. Bij twijfel: laat weg.",
    "- vocabulary.forbidden = hype/overclaim taal die NIET in de samples voorkomt (gegarandeerd, nummer 1, explosieve groei, etc.).",
    "- claimStyle.allowedClaims: gebruik de 'WAARGENOMEN CLAIM-ZINNEN' als basis; herformuleer alleen voor herbruikbaarheid.",
    "",
    "WAARGENOMEN CTA's (sorted by frequency — kies hieruit):",
    ctaList,
    "",
    "WAARGENOMEN CLAIM-ZINNEN:",
    claimList,
    "",
    "WAARGENOMEN HEADLINES:",
    headlinesList,
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
    "primaryCtaPatterns": ["LETTERLIJK uit waargenomen CTA's"],
    "secondaryCtaPatterns": ["LETTERLIJK uit waargenomen CTA's"],
    "style": "string",
    "avoid": ["te schreeuwerige CTA's die niet bij dit merk passen"]
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
    "good": ["LETTERLIJKE zinnen uit samples die merkstem vangen, 5-8 stuks"],
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
    samplesBlock + manualBlock,
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
    // 0. Source of truth: business profile must exist (provides language/locale).
    const bizLocale = await loadBusinessLocale(tenantId);
    if (!bizLocale) {
      throw new Error(
        "Geen business profile gevonden. Maak eerst het Business Profile aan — dat bepaalt taal & locale voor de tone analyse.",
      );
    }

    const picks = await pickFromAuditAndSitemap(tenantId);
    const manualSamples = await loadManualSamples(tenantId);

    if (picks.length === 0 && manualSamples.length === 0) {
      throw new Error(
        "Geen audit-pagina's en geen manual samples beschikbaar. Voer eerst een audit uit of plak handmatige content.",
      );
    }

    // 2. Observe pages in parallel (limited concurrency to be polite)
    const observed: PageObservation[] = [];
    const CONCURRENCY = 4;
    for (let i = 0; i < picks.length; i += CONCURRENCY) {
      const batch = picks.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map((p) => observePage(p.url, p.source_type)));
      for (const r of results) {
        if (r) observed.push(r);
      }
    }

    if (observed.length === 0 && manualSamples.length === 0) {
      throw new Error("Kon geen pagina-content ophalen en geen manual samples gevonden.");
    }

    // 3. Score observations in parallel batches (was sequential — too slow for worker timeout)
    const scored: ScoredObservation[] = [];
    const SCORE_CONCURRENCY = 4;
    for (let i = 0; i < observed.length; i += SCORE_CONCURRENCY) {
      const batch = observed.slice(i, i + SCORE_CONCURRENCY);
      const results = await Promise.all(batch.map((o) => scoreObservation(o)));
      scored.push(...results);
    }

    // Fold manual samples into observations for the aggregated extraction.
    const manualAsObs: PageObservation[] = manualSamples
      .filter((m) => m.text && m.text.length >= 40)
      .map((m) => ({
        url: m.source_url ?? "manual://paste",
        source_type: m.source_type,
        text: m.text,
        ctas: [],
        claimSentences: [],
        headlines: [],
      }));

    const aggregated = aggregateLists([...observed]);

    // 4. Synthesis (locale derived from business profile)
    const locale = bizLocale.locale;
    const extractResult = await llmComplete({
      task: "default",
      system: `Je bent een merkstrateeg én linguïst. Je bouwt een diep, bruikbaar taalprofiel. Tekstuele waarden in het profiel schrijf je in ${bizLocale.languageName}. Output uitsluitend valide JSON volgens het gevraagde schema.`,
      prompt: buildSynthesisPrompt(scored, manualSamples, aggregated, bizLocale),
      temperature: 0.2,
      maxTokens: 4000,
      jsonMode: true,
    });

    let parsed: unknown;
    try {
      parsed = extractJson(extractResult.text);
    } catch (e) {
      console.error("[tone] extract failed, raw response:", extractResult.text?.slice(0, 1000));
      throw new Error(`Profielextractie gaf geen geldige JSON: ${(e as Error).message}`);
    }
    const profile = ToneProfileSchema.parse(parsed);

    // 5. Confidence — V2 multi-factor
    const totalWords = [...scored, ...manualAsObs].reduce(
      (acc, s) => acc + s.text.split(/\s+/).length,
      0,
    );
    const distinctBuckets = new Set(
      [...scored.map((s) => s.source_type), ...manualAsObs.map((s) => s.source_type)],
    ).size;
    const corpusSize = Math.min(1, totalWords / 2500);
    const sourceDiversity = Math.min(1, distinctBuckets / 5);
    const avgQuality = scored.length
      ? scored.reduce((a, s) => a + s.quality, 0) / scored.length
      : 6;
    const sampleQuality = Math.min(1, avgQuality / 8);
    const evidenceDensity = Math.min(
      1,
      (aggregated.ctas.length + aggregated.claimSentences.length + aggregated.headlines.length) / 25,
    );
    const manualBoost = manualSamples.length > 0 ? 0.1 : 0;
    let confidence = Math.min(
      10,
      (corpusSize * 0.25 +
        sourceDiversity * 0.2 +
        sampleQuality * 0.25 +
        evidenceDensity * 0.2 +
        manualBoost +
        0.1) *
        10,
    );
    // Honesty cap: if our samples are mediocre we should NOT claim high confidence,
    // even when diversity and density are perfect.
    if (avgQuality < 6.5) confidence = Math.min(confidence, 7.5);
    if (avgQuality < 5) confidence = Math.min(confidence, 6.5);

    // 6. Persist
    const { data: existing } = await supabaseAdmin
      .from("tone_profiles")
      .select("id")
      .eq("tenant_id", tenantId)
      .single();
    const toneProfileId = existing!.id as string;

    // Replace only the auto-extracted samples; keep manual_paste & approved_proposal rows.
    await supabaseAdmin
      .from("tone_profile_samples")
      .delete()
      .eq("tone_profile_id", toneProfileId)
      .not("source_type", "in", "(manual_paste,approved_proposal)");

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
          analysis: {
            ...s.analysis,
            ctas: s.ctas.slice(0, 15),
            claimSentences: s.claimSentences.slice(0, 15),
            headlines: s.headlines.slice(0, 15),
          } as never,
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
          manual_count: manualSamples.length,
          avg_quality: avgQuality,
          distinct_buckets: distinctBuckets,
          total_words: totalWords,
          confidence_breakdown: {
            corpusSize,
            sourceDiversity,
            sampleQuality,
            evidenceDensity,
            manualBoost,
          },
          observed_ctas: aggregated.ctas.length,
          observed_claims: aggregated.claimSentences.length,
          observed_headlines: aggregated.headlines.length,
          sources: scored.map((s) => ({ url: s.url, type: s.source_type, q: s.quality })),
        } as never,
        job_status: "done",
        job_error: null,
        analyzed_at: new Date().toISOString(),
        language: bizLocale.language,
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
