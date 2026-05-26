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
    const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
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
  "industry leader",
  "market leader",
];

export async function evaluateText(
  text: string,
  profile: ToneProfile,
  opts: { kind?: EvalKind } = {},
): Promise<ToneEvaluation> {
  const kind: EvalKind = opts.kind ?? "generic";
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
    locale: profile.localeTone.locale,
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
  if (forbiddenWords.length > 0) score.vocabularyFit = Math.min(score.vocabularyFit, 1);
  if (forbiddenClaims.length > 0) score.claimSafety = 0;
  if (riskyClaims.length > 0) score.claimSafety = Math.min(score.claimSafety, 4);
  if (trustHits.length > 0) score.claimSafety = Math.min(score.claimSafety, 4);
  if (avoidWords.length > 0) score.vocabularyFit = Math.min(score.vocabularyFit, 5);

  // Deterministic localeFit — the LLM is unreliable here (often returns 0 for
  // perfectly valid English). Detect language ourselves vs the target locale
  // from the profile, and override.
  const targetLang = parseTargetLang(profile.localeTone.locale);
  const detected = detectLanguage(text);
  if (detected) {
    if (detected === targetLang) {
      const localeKey = profile.localeTone.locale;
      const hasLocaleSignal = LOCALE_SIGNALS[localeKey]?.test(text) ?? false;
      score.localeFit = hasLocaleSignal ? 10 : 9;
    } else {
      score.localeFit = 1;
      riskFlagsPre.push(`locale_mismatch:${detected}!=${targetLang}`);
    }
  } else {
    // Too short to confidently detect (typical for CTAs) — assume on-locale
    // and don't punish.
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

  const riskFlags: string[] = [];
  if (forbiddenWords.length) riskFlags.push(`forbidden_word:${forbiddenWords.join(",")}`);
  if (forbiddenClaims.length) riskFlags.push(`forbidden_claim:${forbiddenClaims.join("|")}`);
  if (riskyClaims.length) riskFlags.push(`risky_claim:${riskyClaims.join("|")}`);
  if (trustHits.length) riskFlags.push(`unsupported_trust_claim:${trustHits.join("|")}`);
  if (avoidWords.length) riskFlags.push(`avoid_word:${avoidWords.join(",")}`);
  if (score.genericnessRisk >= 7) riskFlags.push("generic");

  // Kind-aware verdict gates
  let verdict: ToneVerdict;
  if (forbiddenWords.length > 0 || forbiddenClaims.length > 0) {
    verdict = "rejected";
  } else if (score.genericnessRisk >= 8) {
    verdict = "regenerate";
  } else {
    verdict = weighted >= 8 ? "publishable" : "needs_review";

    if (verdict === "publishable") {
      if ((kind === "meta" || kind === "cta") && score.ctaFit < 5) {
        verdict = "needs_review";
        riskFlags.push("gate:cta_fit_low");
      }
      if ((kind === "h1" || kind === "meta") && score.genericnessRisk >= 5) {
        verdict = "needs_review";
        riskFlags.push("gate:too_generic_for_local");
      }
      if (score.claimSafety < 5) {
        verdict = "needs_review";
        riskFlags.push("gate:claim_safety_low");
      }
    }
  }

  return { score, weighted, verdict, riskFlags };
}
