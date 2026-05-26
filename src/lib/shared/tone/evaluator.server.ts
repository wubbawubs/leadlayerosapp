/**
 * Tone Evaluator — server-only.
 * Combines deterministic checks (forbidden words / claims) with one cheap LLM call
 * for voiceFit / genericnessRisk. Returns a verdict the generator uses as a gate.
 */
import { llmComplete } from "@/lib/shared/llm/router.server";
import {
  ToneScoreSchema,
  type ToneEvaluation,
  type ToneProfile,
  type ToneScore,
  type ToneVerdict,
} from "./schemas";
import { normalizeLocale } from "./businessContext.server";

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("No JSON object in evaluator response");
  return JSON.parse(cleaned.slice(first, last + 1));
}

function detectForbidden(text: string, words: string[]): string[] {
  if (!text || words.length === 0) return [];
  const lower = text.toLowerCase();
  return words.filter((w) => {
    const needle = w.trim().toLowerCase();
    if (!needle) return false;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Match base form + common plural/comparative variants (expert → experts, fast → fastest)
    const re = new RegExp(`\\b${escaped}(?:s|es|er|est|ly|ing)?\\b`, "i");
    return re.test(lower);
  });
}

function detectForbiddenClaim(text: string, claims: string[]): string[] {
  if (!text || claims.length === 0) return [];
  const lower = text.toLowerCase();
  return claims.filter((c) => lower.includes(c.trim().toLowerCase()));
}

export type EvalKind = "meta" | "h1" | "cta" | "generic";

// Deterministic language detection — small stopword frequency check.
// Returns the dominant language code or null when ambiguous/too short.
const STOPWORDS: Record<string, string[]> = {
  nl: ["de","het","een","en","van","voor","zijn","niet","met","op","aan","wij","jij","jouw","onze","ook","maar","dat","die","hoe","wat","kun","kunt","wordt","worden","bij","naar","over","hebben","heeft"],
  en: ["the","and","of","for","with","your","you","we","our","is","are","to","in","on","at","this","that","how","what","can","will","get","help","from","by"],
  de: ["und","der","die","das","ein","eine","ist","nicht","mit","für","auf","sie","wir","ihr","ihre","sind","werden","haben"],
  fr: ["le","la","les","et","de","des","un","une","pour","avec","votre","vous","nous","est","sont","ne","pas","sur"],
  es: ["el","la","los","las","y","de","un","una","para","con","su","nosotros","es","son","no","en","sobre"],
};
function detectLanguage(text: string): string | null {
  const tokens = text.toLowerCase().match(/[a-zà-ÿ']+/gi);
  if (!tokens || tokens.length < 4) return null;
  const counts: Record<string, number> = {};
  for (const [lang, words] of Object.entries(STOPWORDS)) {
    const set = new Set(words);
    counts[lang] = tokens.filter((t) => set.has(t)).length;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [topLang, topScore] = sorted[0];
  const secondScore = sorted[1]?.[1] ?? 0;
  if (topScore === 0) return null;
  if (topScore - secondScore < 1) return null;
  return topLang;
}

function parseTargetLang(locale: string | undefined | null): string {
  if (!locale) return "en";
  return locale.toLowerCase().split(/[-_]/)[0].slice(0, 2) || "en";
}

// Locale-specific positive signals — bumps fit toward 10 when present.
const LOCALE_SIGNALS: Record<string, RegExp> = {
  "en-US": /\b(dallas|tx|texas|homeowners?|service call|estimate|zip code|ac repair|hvac|near me|usd|\$)\b/i,
  "en-GB": /\b(london|uk|britain|colour|favour|petrol|postcode|£)\b/i,
  "nl-NL": /\b(nederland|nl|amsterdam|rotterdam|btw|postcode|euro|€)\b/i,
};

// Trust/authority phrases that demand proof. If used without evidence in the
// generated text, treat as risky (claim safety capped).
const TRUST_PHRASES = [
  "trusted local partner",
  "trusted hvac",
  "trusted partner",
  "top-rated",
  "top rated",
  "highly rated",
  "most reliable",
  "fastest response",
  "same-day service",
  "same day service",
  "local experts",
  "local expert",
  "hvac experts",
  "hvac expert",
  "industry leader",
  "market leader",
  "licensed and insured",
  "number 1",
  "#1",
  "best in",
  "lowest prices",
  "guaranteed",
];

// Generic local-service phrases that should bump genericnessRisk.
const GENERIC_PHRASES: { phrase: RegExp; weight: number }[] = [
  { phrase: /\byour local [a-z]+ experts?\b/i, weight: 5 },
  { phrase: /\b(hvac|plumbing|roofing) help\b/i, weight: 4 },
  { phrase: /\bhome comfort\b/i, weight: 3 },
  { phrase: /\bquality service\b/i, weight: 4 },
  { phrase: /\breliable service\b/i, weight: 4 },
  { phrase: /\blocal partner\b/i, weight: 4 },
  { phrase: /\bget(s)? the job done( right)?\b/i, weight: 5 },
  { phrase: /\bhome service\b/i, weight: 3 },
];

// Local Service H1 Specificity Gate — H1 must contain a clear service category
// or core service term. If only soft/generic terms are used, force needs_review.
const SERVICE_CATEGORY_TERMS = [
  /\bhvac\b/i,
  /\bac repair\b/i,
  /\bheating and cooling\b/i,
  /\bemergency hvac\b/i,
  /\bmaintenance\b/i,
  /\bfurnace repair\b/i,
  /\bair conditioning\b/i,
  /\bplumbing\b/i,
  /\broofing\b/i,
  /\belectrical\b/i,
  /\bremodeling\b/i,
  /\blandscaping\b/i,
  /\bcleaning\b/i,
  /\bpest control\b/i,
  /\bwater damage\b/i,
  /\bflooring\b/i,
  /\bwindow(s)?\b/i,
  /\bsiding\b/i,
  /\bgutter(s)?\b/i,
  /\btree service\b/i,
  /\bpainting\b/i,
  /\bgarage door\b/i,
  /\bappliance repair\b/i,
  /\bpool\b/i,
  /\btile\b/i,
  /\bconcrete\b/i,
  /\bfence\b/i,
  /\blawn\b/i,
  /\birrigation\b/i,
  /\bseptic\b/i,
  /\bwelding\b/i,
  /\bhandyman\b/i,
  /\bmoving\b/i,
  /\bdrywall\b/i,
  /\bpressure wash(ing)?\b/i,
  /\bchimney\b/i,
  /\binsulation\b/i,
  /\bsolar\b/i,
  /\bgenerator\b/i,
  /\bsprinkler\b/i,
  /\blocksmith\b/i,
  /\bsecurity system\b/i,
  /\bauto repair\b/i,
  /\bcar service\b/i,
  /\btire\b/i,
  /\bbrake\b/i,
  /\boil change\b/i,
  /\btransmission\b/i,
  /\bdetailing\b/i,
  /\btowing\b/i,
  /\bdent\b/i,
  /\bbody work\b/i,
  /\bmechanic\b/i,
];
const SOFT_GENERIC_TERMS = [
  /\bhome comfort\b/i,
  /\bhelp\b/i,
  /\blocal service\b/i,
  /\byour home\b/i,
  /\bsolutions\b/i,
  /\banswers\b/i,
  /\bsimply explained\b/i,
  /\bhome care\b/i,
  /\bhome solutions\b/i,
  /\bhome services\b/i,
  /\bquality care\b/i,
  /\bget started\b/i,
  /\bdiscover\b/i,
  /\bexperience\b/i,
  /\bwelcome\b/i,
  /\byour trusted\b/i,
  /\bwe'?re here\b/i,
  /\blet us\b/i,
  /\babout us\b/i,
  /\bwho we are\b/i,
  /\bwhat we do\b/i,
  /\bcount on us\b/i,
  /\bcount on\b/i,
];

function checkH1ServiceSpecificity(text: string): {
  hasServiceTerm: boolean;
  hasOnlySoftTerms: boolean;
  softTermMatches: string[];
} {
  const hasServiceTerm = SERVICE_CATEGORY_TERMS.some((re) => re.test(text));
  const softMatches: string[] = [];
  for (const re of SOFT_GENERIC_TERMS) {
    const m = text.match(re);
    if (m) softMatches.push(m[0]);
  }
  const hasOnlySoftTerms = !hasServiceTerm && softMatches.length > 0;
  return {
    hasServiceTerm,
    hasOnlySoftTerms,
    softTermMatches: softMatches,
  };
}

// Fallback risky/forbidden claims for local-service businesses when the
// profile hasn't populated claim guardrails. Used as evaluation overlay only
// — does not mutate the stored profile.
const DEFAULT_RISKY_CLAIMS = [
  "trusted local partner",
  "local experts",
  "reliable service",
  "fast service",
  "gets the job done right",
  "affordable repair",
  "top-rated",
  "highly rated",
  "licensed and insured",
];
const DEFAULT_FORBIDDEN_CLAIMS = [
  "guaranteed same-day repair",
  "best hvac company",
  "number 1 hvac",
  "#1 hvac",
  "lowest prices",
  "guaranteed lower energy bills",
];


export async function evaluateText(
  text: string,
  profile: ToneProfile,
  opts: { kind?: EvalKind; targetLocale?: string | null } = {},
): Promise<ToneEvaluation> {
  const kind: EvalKind = opts.kind ?? "generic";
  const resolvedTargetLocale = normalizeLocale(opts.targetLocale) ?? normalizeLocale(profile.localeTone.locale) ?? "en-US";
  const forbiddenWords = detectForbidden(text, profile.vocabulary.forbidden);
  const avoidWords = detectForbidden(text, profile.vocabulary.avoid);
  const forbiddenClaims = detectForbiddenClaim(text, profile.claimStyle.forbiddenClaims);
  const riskyClaims = detectForbiddenClaim(text, profile.claimStyle.riskyClaims);
  const trustHits = detectForbiddenClaim(text, TRUST_PHRASES);

  const compactProfile = {
    persona: profile.voiceIdentity.persona,
    summary: profile.voiceIdentity.summary,
    preferredWords: profile.vocabulary.preferred.slice(0, 15),
    avoidWords: profile.vocabulary.avoid.slice(0, 15),
    goodExamples: profile.examples.good.slice(0, 4),
    badExamples: profile.examples.bad.slice(0, 4),
    locale: resolvedTargetLocale,
    salesIntensity: profile.localeTone.salesIntensity,
  };

  const kindHint =
    kind === "meta"
      ? "Dit is een META DESCRIPTION voor een commerciële/service pagina. ctaFit beoordeelt of er een duidelijke vervolgactie in zit. genericnessRisk omhoog (>=5) als geen locatie of specifieke service genoemd wordt."
      : kind === "h1"
      ? "Dit is een H1 voor een lokale service-pagina. genericnessRisk omhoog (>=5) als de H1 zonder service-categorie OF locatie/audience kan voor elke concurrent. ctaFit telt minder (H1 is geen knop)."
      : kind === "cta"
      ? "Dit is een CTA BUTTON-tekst (max 5 woorden). ctaFit beoordeelt of het werkwoord-eerst is, specifiek genoeg en past bij merk-CTA's. genericnessRisk omhoog bij vage CTA's zoals 'Learn More', 'Click Here'."
      : "";

  const prompt = [
    "Beoordeel de volgende tekst tegen het meegegeven merkstemprofiel.",
    "Geef scores op een schaal van 0-10. Voor genericnessRisk: 0 = zeer specifiek, 10 = generieke AI-rommel.",
    kindHint,
    "",
    "Output UITSLUITEND JSON:",
    `{"voiceFit":0-10,"vocabularyFit":0-10,"sentenceRhythmFit":0-10,"claimSafety":0-10,"ctaFit":0-10,"localeFit":0-10,"genericnessRisk":0-10}`,
    "",
    "PROFIEL (compact):",
    JSON.stringify(compactProfile),
    "",
    "TEKST:",
    text.slice(0, 1500),
  ].join("\n");

  let score: ToneScore;
  try {
    const r = await llmComplete({
      task: "cheap",
      system: "Je bent een strenge merkstem-evaluator. Output uitsluitend valide JSON.",
      prompt,
      temperature: 0.1,
      maxTokens: 250,
    });
    score = ToneScoreSchema.parse(extractJson(r.text));
  } catch (e) {
    console.error("[tone-eval] LLM eval failed", (e as Error).message);
    score = {
      voiceFit: 5,
      vocabularyFit: forbiddenWords.length > 0 ? 0 : 6,
      sentenceRhythmFit: 5,
      claimSafety: forbiddenClaims.length > 0 ? 0 : 6,
      ctaFit: 5,
      localeFit: 5,
      genericnessRisk: 5,
    };
  }

  // Hard overrides from deterministic checks
  const riskFlags: string[] = [];

  // Claim guard fallback: when profile has no risky/forbidden claims, overlay
  // sensible defaults for local-service businesses (not stored on profile).
  const usingDefaultRisky = profile.claimStyle.riskyClaims.length === 0;
  const usingDefaultForbidden = profile.claimStyle.forbiddenClaims.length === 0;
  const riskyFromDefaults = usingDefaultRisky ? detectForbiddenClaim(text, DEFAULT_RISKY_CLAIMS) : [];
  const forbiddenFromDefaults = usingDefaultForbidden ? detectForbiddenClaim(text, DEFAULT_FORBIDDEN_CLAIMS) : [];
  const allRiskyHits = Array.from(new Set([...riskyClaims, ...riskyFromDefaults]));
  const allForbiddenHits = Array.from(new Set([...forbiddenClaims, ...forbiddenFromDefaults]));
  if (usingDefaultRisky || usingDefaultForbidden) {
    riskFlags.push("claim_guardrails_empty_default_used");
  }

  if (forbiddenWords.length > 0) score.vocabularyFit = Math.min(score.vocabularyFit, 1);
  if (allForbiddenHits.length > 0) score.claimSafety = 0;
  if (allRiskyHits.length > 0) score.claimSafety = Math.min(score.claimSafety, 4);
  if (trustHits.length > 0) score.claimSafety = Math.min(score.claimSafety, 4);
  if (avoidWords.length > 0) score.vocabularyFit = Math.min(score.vocabularyFit, 5);

  // Deterministic genericness bump for known cookie-cutter phrases.
  let genericBump = 0;
  for (const { phrase, weight } of GENERIC_PHRASES) {
    if (phrase.test(text)) genericBump = Math.max(genericBump, weight);
  }
  if (genericBump > 0) {
    score.genericnessRisk = Math.max(score.genericnessRisk, genericBump);
  }

  // Local Service H1 Specificity Gate — H1 must contain a clear service category.
  let h1MissingServiceIntent = false;
  if (kind === "h1") {
    const h1Spec = checkH1ServiceSpecificity(text);
    if (h1Spec.hasOnlySoftTerms) {
      h1MissingServiceIntent = true;
      score.genericnessRisk = Math.max(score.genericnessRisk, 5);
      riskFlags.push(`h1:missing_service_intent:soft=[${h1Spec.softTermMatches.join(",")}]`);
    }
  }

  // Deterministic localeFit — the LLM is unreliable here (often returns 0 for
  // perfectly valid English). Detect language ourselves vs the target locale.
  const targetLang = parseTargetLang(resolvedTargetLocale);
  const detected = detectLanguage(text);
  if (detected) {
    if (detected === targetLang) {
      const hasLocaleSignal = LOCALE_SIGNALS[resolvedTargetLocale]?.test(text) ?? false;
      score.localeFit = hasLocaleSignal ? 10 : 9;
    } else {
      score.localeFit = 1;
      riskFlags.push(`locale_mismatch:${detected}!=${targetLang}`);
    }
  } else {
    score.localeFit = Math.max(score.localeFit, 7);
  }

  const w = profile.scoringWeights;
  const weighted =
    score.voiceFit * w.voiceFit +
    score.vocabularyFit * w.vocabularyFit +
    score.sentenceRhythmFit * w.sentenceRhythmFit +
    score.claimSafety * w.claimSafety +
    score.ctaFit * w.ctaFit +
    score.localeFit * w.localeFit +
    (10 - score.genericnessRisk) * w.genericnessRisk;

  if (forbiddenWords.length) riskFlags.push(`forbidden_word:${forbiddenWords.join(",")}`);
  if (allForbiddenHits.length) riskFlags.push(`forbidden_claim:${allForbiddenHits.join("|")}`);
  if (allRiskyHits.length) riskFlags.push(`risky_claim:${allRiskyHits.join("|")}`);
  if (trustHits.length) riskFlags.push(`unsupported_trust_claim:${trustHits.join("|")}`);
  if (avoidWords.length) riskFlags.push(`avoid_word:${avoidWords.join(",")}`);
  if (score.genericnessRisk >= 7) riskFlags.push("generic");

  // Kind-aware verdict gates
  const commercial = kind === "meta" || kind === "cta" || kind === "h1";
  let verdict: ToneVerdict;
  if (forbiddenWords.length > 0 || allForbiddenHits.length > 0) {
    verdict = "rejected";
  } else if (score.genericnessRisk >= 8) {
    verdict = "regenerate";
  } else {
    verdict = weighted >= 8 ? "publishable" : "needs_review";

    const downgrade = (reason: string) => {
      if (verdict === "publishable") {
        verdict = "needs_review";
        riskFlags.push(reason);
      }
    };

    if ((kind === "meta" || kind === "cta") && score.ctaFit < 7) {
      downgrade("gate:cta_fit_low");
    }
    if ((kind === "h1" || kind === "meta") && score.genericnessRisk >= 5) {
      downgrade("gate:too_generic_for_local");
    }
    if (avoidWords.length > 0 && commercial) {
      downgrade("gate:avoid_word_present");
    }
    if (allRiskyHits.length > 0 || trustHits.length > 0) {
      downgrade("gate:risky_claim_unsupported");
    }
    if (commercial && score.claimSafety < 9) {
      downgrade("gate:claim_safety_below_threshold");
    }
    if (score.claimSafety < 5) {
      downgrade("gate:claim_safety_low");
    }
  }

  return {
    score,
    weighted,
    verdict,
    riskFlags,
    debug: {
      resolvedTargetLocale,
      resolvedTargetLanguage: targetLang,
      detectedTextLanguage: detected,
    },
  };
}
