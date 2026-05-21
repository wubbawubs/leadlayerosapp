/**
 * BP-2 — AI Business Profile Analyzer (server-only).
 *
 * Pipeline:
 *  1. Load current business_profile_v2 + locked_fields + tone profile context.
 *  2. Pull latest succeeded audit pages + sitemap discovery; observe diverse pages.
 *  3. Feed evidence-grounded prompt to LLM → strict JSON suggestion bundle.
 *  4. Persist per-field rows in `business_profile_suggestions` (status=pending),
 *     skipping locked paths. Update confidence_map / missing_context / strategy_angles
 *     metadata on business_profiles_v2 (NEVER overwrites core fields).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { jsonrepair } from "jsonrepair";
import { llmComplete } from "@/lib/shared/llm/router.server";
import {
  discoverSitemapUrls,
  observePage,
  pickDiverse,
  aggregateLists,
  type PageObservation,
  type UrlPick,
} from "@/lib/shared/tone/corpus.server";
import { z } from "zod";
import {
  StrategyAngleSchema,
  MissingContextItemSchema,
  SECTION_KEYS,
  type SectionKey,
} from "./schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

// ----------------------------------------------------------------------------
// Suggestion schema (what the LLM must return)
// ----------------------------------------------------------------------------

const EvidenceSchema = z.object({
  url: z.string().max(800).default(""),
  quote: z.string().max(800).default(""),
  reason: z.string().max(500).default(""),
});

const FieldSuggestionSchema = z.object({
  fieldPath: z.string().min(1).max(160), // e.g. "offer_profile.primaryOffer"
  suggestedValue: z.any(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(800).default(""),
  sourceEvidence: z.array(EvidenceSchema).max(8).default([]),
});

const SectionReasonSchema = z.object({
  score: z.number().min(0).max(1),
  strengths: z.array(z.string().max(300)).max(8).default([]),
  gaps: z.array(z.string().max(300)).max(8).default([]),
  nextSteps: z.array(z.string().max(300)).max(8).default([]),
});

const AnalysisResultSchema = z.object({
  fieldSuggestions: z.array(FieldSuggestionSchema).max(80).default([]),
  strategyAngles: z.array(StrategyAngleSchema).max(12).default([]),
  missingContext: z.array(MissingContextItemSchema).max(20).default([]),
  sectionConfidence: z.record(z.string(), z.number().min(0).max(1)).default({}),
  sectionReasons: z.record(z.string(), SectionReasonSchema).default({}),
  overallConfidence: z.number().min(0).max(1).default(0),
});

type AnalysisResult = z.infer<typeof AnalysisResultSchema>;


// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function extractJson(text: string): unknown {
  if (!text || !text.trim()) throw new Error("LLM returned empty response");
  let cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const first = cleaned.search(/[{[]/);
  if (first === -1) throw new Error(`No JSON in LLM response: ${text.slice(0, 200)}`);
  const opener = cleaned[first];
  const closer = opener === "[" ? "]" : "}";
  const last = cleaned.lastIndexOf(closer);
  cleaned = last > first ? cleaned.slice(first, last + 1) : cleaned.slice(first);
  try {
    return JSON.parse(cleaned);
  } catch {
    try {
      return JSON.parse(
        cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, " "),
      );
    } catch {
      // Last resort: jsonrepair handles unescaped quotes, trailing commas,
      // missing closers, control chars in strings, truncation, etc.
      return JSON.parse(jsonrepair(cleaned));
    }
  }
}

function normalizeAnalyzerError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/upstream request timeout|timed out|abort/i.test(message)) {
    return new Error(
      "Analyzer duurde te lang. Ik heb de site-scan begrensd; probeer opnieuw. Als dit blijft gebeuren, analyseer eerst minder pagina's of voer een kleinere audit uit.",
    );
  }
  if (/LLM gateway 5\d\d|fetch failed|network/i.test(message)) {
    return new Error("AI-service reageerde niet stabiel. Probeer de analyse over een minuut opnieuw.");
  }
  return error instanceof Error ? error : new Error(message);
}

function isLocked(fieldPath: string, lockedFields: string[]): boolean {
  if (lockedFields.includes(fieldPath)) return true;
  // ancestor lock — e.g. lock on "offer_profile" blocks "offer_profile.primaryOffer"
  for (const lock of lockedFields) {
    if (fieldPath.startsWith(lock + ".")) return true;
  }
  return false;
}

function fieldPathSection(fieldPath: string): SectionKey | null {
  const top = fieldPath.split(".")[0];
  return (SECTION_KEYS as readonly string[]).includes(top) ? (top as SectionKey) : null;
}

function getAtPath(obj: Record<string, unknown> | null | undefined, path: string): unknown {
  if (!obj) return null;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return null;
    }
  }
  return cur;
}

function setAtPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = path.split(".");
  if (parts.length === 1) {
    return { ...obj, [parts[0]]: value };
  }
  const [head, ...rest] = parts;
  const child = (obj[head] && typeof obj[head] === "object" ? obj[head] : {}) as Record<
    string,
    unknown
  >;
  return { ...obj, [head]: setAtPath(child, rest.join("."), value) };
}

// ----------------------------------------------------------------------------
// Corpus collection (reuses tone analyzer's corpus tooling)
// ----------------------------------------------------------------------------

async function pickCorpusUrls(tenantId: string, maxTotal = 10): Promise<UrlPick[]> {
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
      .limit(80);
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

  let sitemapUrls: string[] = [];
  if (origin) {
    try {
      sitemapUrls = await discoverSitemapUrls(origin, 32);
    } catch {
      sitemapUrls = [];
    }
  }
  const merged = [...auditUrls, ...sitemapUrls];
  if (!merged.length) return [];
  return pickDiverse(merged, maxTotal);
}

async function observeAll(picks: UrlPick[]): Promise<PageObservation[]> {
  const observed: PageObservation[] = [];
  const CONCURRENCY = 3;
  for (let i = 0; i < picks.length; i += CONCURRENCY) {
    const batch = picks.slice(i, i + CONCURRENCY);
    const res = await Promise.all(batch.map((p) => observePage(p.url, p.source_type)));
    for (const r of res) if (r) observed.push(r);
  }
  return observed;
}

// ----------------------------------------------------------------------------
// Prompt
// ----------------------------------------------------------------------------

function buildPrompt(input: {
  observed: PageObservation[];
  aggregated: ReturnType<typeof aggregateLists>;
  currentProfile: Record<string, unknown> | null;
  lockedFields: string[];
  toneContext: ToneContext | null;
  recentRejections: Array<{ field_path: string; reason: string | null }>;
}): string {
  const {
    observed,
    aggregated,
    currentProfile,
    lockedFields,
    toneContext,
    recentRejections,
  } = input;

  const samples = observed.slice(0, 8)
    .map(
      (o, i) =>
        `--- PAGE ${i + 1} | ${o.source_type} | ${o.url}\n` +
        `CTA's: ${o.ctas.slice(0, 8).join(" | ") || "(geen)"}\n` +
        `Headlines: ${o.headlines.slice(0, 6).join(" | ") || "(geen)"}\n` +
        `Tekst:\n${o.text.slice(0, 1100)}`,
    )
    .join("\n\n");

  const ctaList = aggregated.ctas.slice(0, 20).map((c) => `- "${c.text}" (×${c.count})`).join("\n") || "(geen)";
  const claimList =
    aggregated.claimSentences.slice(0, 15).map((c) => `- "${c.text}"`).join("\n") || "(geen)";

  const profileBlock = currentProfile
    ? JSON.stringify(
        {
          business_identity: currentProfile.business_identity,
          offer_profile: currentProfile.offer_profile,
          icp_profile: currentProfile.icp_profile,
          location_profile: currentProfile.location_profile,
          conversion_profile: currentProfile.conversion_profile,
          proof_profile: currentProfile.proof_profile,
          claim_guardrails: currentProfile.claim_guardrails,
        },
        null,
        2,
      ).slice(0, 4000)
    : "(leeg)";

  const toneBlock = toneContext
    ? [
        "TONE PROFILE (APPROVED — output MOET hieraan voldoen):",
        toneContext.summary ? `- Voice: ${toneContext.summary}` : "",
        toneContext.formality ? `- Formality / aanhef: ${toneContext.formality} (gebruik 'je/jij' tenzij hier expliciet 'u' staat)` : "- Aanhef: gebruik 'je/jij'",
        toneContext.preferredWords.length ? `- Voorkeurswoorden: ${toneContext.preferredWords.slice(0, 20).join(", ")}` : "",
        toneContext.forbiddenWords.length ? `- VERBODEN woorden: ${toneContext.forbiddenWords.slice(0, 20).join(", ")}` : "",
        toneContext.examplePhrases.length ? `- Voorbeeldzinnen: ${toneContext.examplePhrases.slice(0, 5).map((s) => `"${s}"`).join(" | ")}` : "",
      ].filter(Boolean).join("\n")
    : "(geen approved tone profile — gebruik neutrale 'je'-vorm)";

  const rejectBlock = recentRejections.length
    ? recentRejections
        .slice(0, 15)
        .map((r) => `- ${r.field_path}${r.reason ? ` — reason: ${r.reason}` : ""}`)
        .join("\n")
    : "(geen)";

  return [
    "Je bouwt een GROWTH INTELLIGENCE PROFILE voor een bedrijf op basis van échte website-content.",
    "Je doet SUGGESTIES voor invulling. Niets wordt automatisch overschreven — de operator beslist.",
    "",
    "HARDE REGELS:",
    "- Verzin GEEN cijfers, klantaantallen, percentages of cases. Komt het niet letterlijk uit de samples, dan hoort het in `unverifiedProofPoints` of `missingContext` — niet in `verifiedProofPoints`.",
    "- Elke suggestie MOET sourceEvidence hebben (url + quote uit de samples) tenzij confidence < 0.5.",
    "- Confidence schaal: 0.9+ alleen bij meerdere expliciete bronnen, 0.7-0.85 bij duidelijke inferentie, 0.4-0.6 bij zwakke aanwijzing, < 0.4 → naar missingContext.",
    "- LOCKED VELDEN (geen suggesties voor): " + (lockedFields.length ? lockedFields.join(", ") : "(geen)"),
    "- ALLE tekstwaarden (string-suggesties: oneLiner, primaryOffer, primaryCta, valuePropositions, …) MOETEN voldoen aan het Tone Profile hierboven. Gebruik geen 'U/uw'-aanhef als tone 'je/jij' voorschrijft. Gebruik geen verboden woorden.",
    "- Suggesteer NIET hetzelfde als het huidige profiel al bevat (zelfde string of zelfde array). Sla over.",
    "- Suggesteer NIET hetzelfde als recent door operator afgekeurd is (zie sectie hieronder), tenzij je een fundamenteel andere formulering hebt.",
    "- Voor sectionReasons: leg PER SECTIE in 1-3 korte bullets uit (a) wat sterk is, (b) welke gaps de score laag houden, (c) welke concrete content de operator zou moeten leveren of laten verschijnen op de site om de score omhoog te krijgen.",
    "- strategyAngles: max 4. Geef de meest commercieel logische als eerste. Markeer de beste met isPrimary=true (maximaal 1).",
    "- Velden zijn dot-paths binnen secties. Toegestane top-level secties: business_identity, offer_profile, icp_profile, location_profile, conversion_profile, proof_profile, claim_guardrails.",
    "- Voor lijst-velden (bv. icp_profile.idealCustomers) is suggestedValue een array van strings. Voor scalars een string/number/enum.",
    "",
    toneBlock,
    "",
    "HUIDIG BUSINESS PROFILE (vertrek hiervan, vul aan, overschrijf niet zomaar):",
    profileBlock,
    "",
    "RECENT AFGEWEZEN SUGGESTIES (niet opnieuw voorstellen):",
    rejectBlock,
    "",
    "WAARGENOMEN CTA's op de site:",
    ctaList,
    "",
    "WAARGENOMEN CLAIM-ZINNEN:",
    claimList,
    "",
    "PAGINA-SAMPLES (echte content):",
    samples,
    "",
    "Output UITSLUITEND geldige JSON in dit schema:",
    `{
    "fieldSuggestions": [
    {
      "fieldPath": "offer_profile.primaryOffer",
      "suggestedValue": "...",
      "confidence": 0.0-1.0,
      "rationale": "korte uitleg",
      "sourceEvidence": [{"url":"...", "quote":"...", "reason":"..."}]
    }
  ],
  "strategyAngles": [
    {"angle":"...","score":0-10,"why":"...","bestFor":["homepage","meta","CTA"],"riskLevel":"low|medium|high","isPrimary":false}
  ],
  "missingContext": [
    {"missing":"...","impact":"...","recommendedQuestion":"...","priority":"low|medium|high","mapToField":"offer_profile.pricingContext"}
  ],
  "sectionConfidence": {
    "business_identity":0.0-1.0,"offer_profile":0.0-1.0,"icp_profile":0.0-1.0,
    "location_profile":0.0-1.0,"conversion_profile":0.0-1.0,"proof_profile":0.0-1.0,"claim_guardrails":0.0-1.0
  },
  "sectionReasons": {
    "location_profile": {"score":0.4,"strengths":["..."],"gaps":["geen stadspagina's","geen primaire vestiging"],"nextSteps":["voeg /vestiging/utrecht toe","noem stad in footer"]}
  },
  "overallConfidence": 0.0-1.0
}`,
    "Beperk output: maximaal 30 fieldSuggestions, maximaal 4 strategyAngles, maximaal 10 missingContext-items. Hou rationale en evidence kort.",
    "",
    "Antwoord ALLEEN met geldige JSON. Geen markdown, geen uitleg.",
  ].join("\n");
}

// ----------------------------------------------------------------------------
// Tone profile context (used to normalize analyzer output)
// ----------------------------------------------------------------------------

interface ToneContext {
  summary: string | null;
  formality: string | null;
  preferredWords: string[];
  forbiddenWords: string[];
  examplePhrases: string[];
}

async function loadToneContext(tenantId: string): Promise<ToneContext | null> {
  const { data: tone } = await supabaseAdmin
    .from("tone_profiles")
    .select("profile, status")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!tone?.profile || typeof tone.profile !== "object") return null;
  const p = tone.profile as Record<string, unknown>;
  const voice = (p.voiceIdentity as Record<string, unknown> | undefined) ?? {};
  const vocab = (p.vocabulary as Record<string, unknown> | undefined) ?? {};
  const examples = (p.examples as Record<string, unknown> | undefined) ?? {};

  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

  const formalityRaw =
    (voice.formality as string | undefined) ??
    (voice.aanhef as string | undefined) ??
    (p.formality as string | undefined) ??
    null;

  return {
    summary: (voice.summary as string | undefined) ?? null,
    formality: formalityRaw,
    preferredWords: arr(vocab.preferredWords ?? vocab.preferred ?? p.preferred_words),
    forbiddenWords: arr(vocab.forbiddenWords ?? vocab.forbidden ?? p.forbidden_words),
    examplePhrases: arr(examples.bestExamples ?? examples.phrases ?? p.example_phrases),
  };
}

// ----------------------------------------------------------------------------
// Dedup helpers
// ----------------------------------------------------------------------------

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (ka.length !== kb.length) return false;
    if (!ka.every((k, i) => k === kb[i])) return false;
    return ka.every((k) =>
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  if (typeof a === "string" && typeof b === "string") {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
  return false;
}

function isMeaningful(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}



// ----------------------------------------------------------------------------
// Main orchestrator
// ----------------------------------------------------------------------------

export interface AnalyzerResult {
  ok: true;
  suggestionsCreated: number;
  blockedByLock: number;
  observedPages: number;
  overallConfidence: number;
}

export async function analyzeBusinessProfileFromWebsite(input: {
  tenantId: string;
}): Promise<AnalyzerResult> {
  const { tenantId } = input;

  // 1. Load current profile + locks
  const { data: currentProfile } = await admin
    .from("business_profiles_v2")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const lockedFields: string[] = Array.isArray(currentProfile?.locked_fields)
    ? (currentProfile!.locked_fields as string[])
    : [];

  // 2. Tone profile context (used to normalize analyzer output style)
  const toneContext = await loadToneContext(tenantId);

  // 2b. Recent rejections (so analyzer doesn't keep proposing same junk)
  const { data: rejections } = await admin
    .from("business_profile_feedback")
    .select("field_path, reason, after_value")
    .eq("tenant_id", tenantId)
    .eq("feedback_type", "rejected")
    .order("created_at", { ascending: false })
    .limit(30);
  const recentRejections = (rejections ?? []).map(
    (r: { field_path: string | null; reason: string | null }) => ({
      field_path: r.field_path ?? "",
      reason: r.reason,
    }),
  );
  const rejectedValuesByField = new Map<string, unknown[]>();
  for (const r of rejections ?? []) {
    if (!r.field_path) continue;
    const arr = rejectedValuesByField.get(r.field_path) ?? [];
    arr.push((r as { after_value: unknown }).after_value);
    rejectedValuesByField.set(r.field_path, arr);
  }

  // 3. Collect corpus
  const picks = await pickCorpusUrls(tenantId);
  if (!picks.length) {
    throw new Error(
      "Geen audit-pagina's of sitemap-URL's gevonden. Voer eerst een audit uit op deze site.",
    );
  }
  const observed = await observeAll(picks);
  if (!observed.length) {
    throw new Error("Pagina's konden niet worden opgehaald (geen leesbare content).");
  }
  const aggregated = aggregateLists(observed);

  // 4. LLM synthesis
  const prompt = buildPrompt({
    observed,
    aggregated,
    currentProfile: currentProfile ?? null,
    lockedFields,
    toneContext,
    recentRejections,
  });
  const llm = await llmComplete({
    task: "default",
    system:
      "Je bent een growth-strateeg die websitecontent vertaalt naar een gestructureerd business profile. Je verzint NOOIT bewijs. Je respecteert het Tone Profile letterlijk. Output uitsluitend valide JSON.",
    prompt,
    temperature: 0.2,
    maxTokens: 6500,
    jsonMode: true,
  });

  let parsed: AnalysisResult;
  try {
    parsed = AnalysisResultSchema.parse(extractJson(llm.text));
  } catch (e) {
    console.error("[bp-2] parse failed, raw:", llm.text?.slice(0, 1000));
    throw new Error(`Analyzer JSON ongeldig: ${(e as Error).message}`);
  }

  // 5. Ensure profile row exists (so suggestions can reference it)
  if (!currentProfile) {
    await admin.from("business_profiles_v2").upsert(
      { tenant_id: tenantId, status: "draft" },
      { onConflict: "tenant_id" },
    );
  }
  const { data: profileRow } = await admin
    .from("business_profiles_v2")
    .select("id")
    .eq("tenant_id", tenantId)
    .single();
  const businessProfileId = profileRow.id as string;

  // 6. Clear previous pending suggestions (rejected/accepted history blijft staan)
  await admin
    .from("business_profile_suggestions")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("status", "pending");

  // 7. Insert per-field suggestions, respecting locks + dedup against current + recent rejections
  let blockedByLock = 0;
  let skippedDuplicate = 0;
  let skippedRejected = 0;
  const rows: Array<Record<string, unknown>> = [];
  for (const s of parsed.fieldSuggestions) {
    const section = fieldPathSection(s.fieldPath);
    if (!section) continue;
    if (isLocked(s.fieldPath, lockedFields)) {
      blockedByLock++;
      continue;
    }
    const currentValue = getAtPath(
      currentProfile as Record<string, unknown> | null,
      s.fieldPath,
    );
    // Skip when suggestion equals current meaningful value
    if (isMeaningful(currentValue) && deepEqual(currentValue, s.suggestedValue)) {
      skippedDuplicate++;
      continue;
    }
    // Skip when operator already rejected this exact value
    const prevRejected = rejectedValuesByField.get(s.fieldPath) ?? [];
    if (prevRejected.some((v) => deepEqual(v, s.suggestedValue))) {
      skippedRejected++;
      continue;
    }
    rows.push({
      tenant_id: tenantId,
      business_profile_id: businessProfileId,
      section,
      field_path: s.fieldPath,
      suggested_value: s.suggestedValue ?? null,
      current_value: currentValue ?? null,
      source_evidence: s.sourceEvidence ?? [],
      confidence: s.confidence,
      rationale: s.rationale ?? "",
      status: "pending",
    });
  }
  if (rows.length) {
    const { error } = await admin.from("business_profile_suggestions").insert(rows);
    if (error) throw error;
  }

  // 8. Update profile metadata (strategy_angles, missing_context, confidence_map, confidence_reasons)
  const sectionConfidence10: Record<string, number> = {};
  for (const [k, v] of Object.entries(parsed.sectionConfidence)) {
    sectionConfidence10[k] = Math.round(Math.max(0, Math.min(1, Number(v))) * 100) / 10;
  }
  const confidenceReasons: Record<string, unknown> = {};
  for (const [k, r] of Object.entries(parsed.sectionReasons)) {
    confidenceReasons[k] = {
      score: Math.round(Math.max(0, Math.min(1, Number(r.score))) * 100) / 10,
      strengths: r.strengths ?? [],
      gaps: r.gaps ?? [],
      nextSteps: r.nextSteps ?? [],
    };
  }
  const updates: Record<string, unknown> = {
    confidence_score: Math.round(parsed.overallConfidence * 100) / 10,
    confidence_map: sectionConfidence10,
    confidence_reasons: confidenceReasons,
  };
  if (!isLocked("strategy_angles", lockedFields)) {
    // Preserve existing isPrimary mark for an angle that re-appears (by angle text)
    const prev = Array.isArray(currentProfile?.strategy_angles)
      ? (currentProfile!.strategy_angles as Array<Record<string, unknown>>)
      : [];
    const prevPrimary = prev.find((a) => a?.isPrimary === true);
    const merged = parsed.strategyAngles.map((a) => ({ ...a }));
    if (prevPrimary && typeof prevPrimary.angle === "string") {
      const match = merged.find(
        (a) => a.angle.trim().toLowerCase() === (prevPrimary.angle as string).trim().toLowerCase(),
      );
      if (match) {
        merged.forEach((a) => (a.isPrimary = false));
        match.isPrimary = true;
      }
    }
    updates.strategy_angles = merged;
  }
  if (!isLocked("missing_context", lockedFields)) {
    // Preserve answers / resolvedAt for items whose `missing` text re-appears
    const prev = Array.isArray(currentProfile?.missing_context)
      ? (currentProfile!.missing_context as Array<Record<string, unknown>>)
      : [];
    const prevByKey = new Map<string, Record<string, unknown>>();
    for (const m of prev) {
      if (typeof m?.missing === "string") {
        prevByKey.set((m.missing as string).trim().toLowerCase(), m);
      }
    }
    const merged = parsed.missingContext.map((m) => {
      const k = m.missing.trim().toLowerCase();
      const prior = prevByKey.get(k);
      if (prior && (prior.answer || prior.resolvedAt)) {
        return {
          ...m,
          answer: (prior.answer as string) ?? "",
          mapToField: (prior.mapToField as string) ?? m.mapToField ?? "",
          resolvedAt: (prior.resolvedAt as string) ?? "",
        };
      }
      return m;
    });
    updates.missing_context = merged;
  }
  if ((currentProfile?.status ?? "draft") === "draft") {
    updates.status = "review_ready";
  }

  await admin.from("business_profiles_v2").update(updates).eq("tenant_id", tenantId);

  console.log("[bp-2] analyze done", {
    suggestionsCreated: rows.length,
    blockedByLock,
    skippedDuplicate,
    skippedRejected,
    observedPages: observed.length,
  });


  return {
    ok: true,
    suggestionsCreated: rows.length,
    blockedByLock,
    observedPages: observed.length,
    overallConfidence: parsed.overallConfidence,
  };
}

// ----------------------------------------------------------------------------
// Apply suggestion (used by accept / edit-accept serverFns)
// ----------------------------------------------------------------------------

export async function applySuggestionValue(input: {
  tenantId: string;
  fieldPath: string;
  value: unknown;
}): Promise<void> {
  const { tenantId, fieldPath, value } = input;
  const section = fieldPathSection(fieldPath);
  if (!section) throw new Error(`Onbekende sectie in field path: ${fieldPath}`);

  const { data: row } = await admin
    .from("business_profiles_v2")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();

  const lockedFields: string[] = Array.isArray(row?.locked_fields)
    ? (row.locked_fields as string[])
    : [];
  if (isLocked(fieldPath, lockedFields)) {
    throw new Error(`Veld is gelocked: ${fieldPath}. Unlock eerst.`);
  }

  // Update the section JSONB
  const parts = fieldPath.split(".");
  let newSectionValue: unknown;
  if (parts.length === 1) {
    // Whole section (e.g. strategy_angles, missing_context)
    newSectionValue = value;
  } else {
    const currentSection = (row?.[section] && typeof row[section] === "object"
      ? (row[section] as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    newSectionValue = setAtPath(currentSection, parts.slice(1).join("."), value)[
      parts[1]
    ];
    // Actually we need to set the entire updated section object
    const updated = setAtPath(currentSection, parts.slice(1).join("."), value);
    newSectionValue = updated;
  }

  const { error } = await admin
    .from("business_profiles_v2")
    .update({ [section]: newSectionValue })
    .eq("tenant_id", tenantId);
  if (error) throw error;
}
