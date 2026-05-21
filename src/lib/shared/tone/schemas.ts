/**
 * Tone Profile V1 — linguistic brand model schemas.
 * Source of truth for what the analyzer produces and the UI/generator consumes.
 */
import { z } from "zod";

const StrList = (max = 60) =>
  z.array(z.string().trim().min(1).max(300)).max(max);

export const VoiceIdentitySchema = z.object({
  summary: z.string().trim().min(10).max(4000),
  persona: z.string().trim().max(600).default(""),
  emotionalRegister: z.string().trim().max(600).default(""),
  authorityStyle: z.string().trim().max(800).default(""),
  commercialIntensity: z.enum(["low", "medium", "high"]).default("medium"),
});

export const SentenceArchitectureSchema = z.object({
  averageSentenceLength: z.string().trim().max(300).default(""),
  paragraphLength: z.string().trim().max(300).default(""),
  preferredStructure: z.string().trim().max(1000).default(""),
  usesQuestions: z.boolean().default(false),
  passiveVoicePolicy: z.string().trim().max(400).default("avoid"),
  rhythm: z.string().trim().max(800).default(""),
});

export const VocabularySchema = z.object({
  preferred: StrList(120).default([]),
  avoid: StrList(120).default([]),
  forbidden: StrList(120).default([]),
  replacements: z.record(z.string().trim().min(1).max(200), z.string().trim().max(400)).default({}),
  technicalTermsPolicy: z.string().trim().max(1000).default(""),
});

export const ClaimStyleSchema = z.object({
  allowedClaims: StrList(80).default([]),
  riskyClaims: StrList(80).default([]),
  forbiddenClaims: StrList(80).default([]),
  safeClaimPatterns: StrList(80).default([]),
  evidenceRequiredFor: StrList(60).default([]),
});

export const CtaStyleSchema = z.object({
  primaryCtaPatterns: StrList(40).default([]),
  secondaryCtaPatterns: StrList(40).default([]),
  style: z.string().trim().max(800).default(""),
  avoid: StrList(40).default([]),
});

export const TrustStyleSchema = z.object({
  primaryTrustDrivers: StrList(20).default([]),
  proofTypes: StrList(20).default([]),
  trustLanguage: z.string().trim().max(400).default(""),
  avoid: StrList(20).default([]),
});

export const LocaleToneSchema = z.object({
  locale: z.string().trim().max(16).default("nl-NL"),
  salesIntensity: z.string().trim().max(40).default("medium"),
  culturalNotes: StrList(20).default([]),
  spelling: z.string().trim().max(40).default(""),
  formality: z.string().trim().max(40).default(""),
});

export const RewritePatternSchema = z.object({
  bad: z.string().trim().min(1).max(400),
  good: z.string().trim().min(1).max(400),
  rule: z.string().trim().max(300).default(""),
});

export const ExamplesSchema = z.object({
  good: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  bad: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  rewritePatterns: z.array(RewritePatternSchema).max(30).default([]),
});

export const ScoringWeightsSchema = z.object({
  voiceFit: z.number().min(0).max(1).default(0.2),
  vocabularyFit: z.number().min(0).max(1).default(0.15),
  sentenceRhythmFit: z.number().min(0).max(1).default(0.15),
  claimSafety: z.number().min(0).max(1).default(0.2),
  ctaFit: z.number().min(0).max(1).default(0.1),
  localeFit: z.number().min(0).max(1).default(0.1),
  genericnessRisk: z.number().min(0).max(1).default(0.1),
});

export const ToneProfileSchema = z.object({
  voiceIdentity: VoiceIdentitySchema,
  sentenceArchitecture: SentenceArchitectureSchema.default({} as never),
  vocabulary: VocabularySchema.default({} as never),
  claimStyle: ClaimStyleSchema.default({} as never),
  ctaStyle: CtaStyleSchema.default({} as never),
  trustStyle: TrustStyleSchema.default({} as never),
  audienceAdaptation: z.record(z.string(), z.unknown()).default({}),
  localeTone: LocaleToneSchema.default({} as never),
  examples: ExamplesSchema.default({} as never),
  scoringWeights: ScoringWeightsSchema.default({} as never),
});

export type ToneProfile = z.infer<typeof ToneProfileSchema>;

// ====== Evaluator output ======

export const ToneScoreSchema = z.object({
  voiceFit: z.number().min(0).max(10),
  vocabularyFit: z.number().min(0).max(10),
  sentenceRhythmFit: z.number().min(0).max(10),
  claimSafety: z.number().min(0).max(10),
  ctaFit: z.number().min(0).max(10),
  localeFit: z.number().min(0).max(10),
  genericnessRisk: z.number().min(0).max(10), // higher = worse
});

export type ToneScore = z.infer<typeof ToneScoreSchema>;

export type ToneVerdict = "publishable" | "needs_review" | "rejected" | "regenerate";

export interface ToneEvaluation {
  score: ToneScore;
  weighted: number; // 0-10 composite
  verdict: ToneVerdict;
  riskFlags: string[];
}

// Empty profile (used as fallback in UI when no row exists yet)
export const EMPTY_TONE_PROFILE: ToneProfile = ToneProfileSchema.parse({
  voiceIdentity: { summary: "Nog niet geanalyseerd. Klik 'Analyze from website' om te starten." },
});
