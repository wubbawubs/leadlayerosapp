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

export async function evaluateText(
  text: string,
  profile: ToneProfile,
): Promise<ToneEvaluation> {
  const forbiddenWords = detectForbidden(text, profile.vocabulary.forbidden);
  const avoidWords = detectForbidden(text, profile.vocabulary.avoid);
  const forbiddenClaims = detectForbiddenClaim(text, profile.claimStyle.forbiddenClaims);
  const riskyClaims = detectForbiddenClaim(text, profile.claimStyle.riskyClaims);

  // Compact profile for the LLM evaluator (keep prompt small)
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

  const prompt = [
    "Beoordeel de volgende tekst tegen het meegegeven merkstemprofiel.",
    "Geef scores op een schaal van 0-10. Voor genericnessRisk: 0 = zeer specifiek, 10 = generieke AI-rommel.",
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
    // Neutral fallback so blocking gate doesn't kill everything on a transient error
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
  if (avoidWords.length > 0) score.vocabularyFit = Math.min(score.vocabularyFit, 5);

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
  if (avoidWords.length) riskFlags.push(`avoid_word:${avoidWords.join(",")}`);
  if (score.genericnessRisk >= 7) riskFlags.push("generic");

  let verdict: ToneVerdict;
  if (forbiddenWords.length > 0 || forbiddenClaims.length > 0) verdict = "rejected";
  else if (score.genericnessRisk >= 8) verdict = "regenerate";
  else if (weighted >= 8) verdict = "publishable";
  else verdict = "needs_review";

  return { score, weighted, verdict, riskFlags };
}
