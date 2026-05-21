/**
 * Zod schemas for the Context Layer (S4.5):
 *  - business_profiles
 *  - brand_voice_profiles
 *  - page_intelligence
 */
import { z } from "zod";

const StrList = z.array(z.string().trim().min(1).max(200)).max(50);

export const BusinessProfileInputSchema = z.object({
  tenantId: z.string().uuid(),
  businessName: z.string().trim().max(200).optional().nullable(),
  industry: z.string().trim().max(120).optional().nullable(),
  primaryOffer: z.string().trim().max(500).optional().nullable(),
  secondaryOffers: StrList.optional(),
  targetAudience: StrList.optional(),
  serviceAreas: StrList.optional(),
  uniqueValueProposition: z.string().trim().max(500).optional().nullable(),
  mainPromise: z.string().trim().max(500).optional().nullable(),
  proofPoints: StrList.optional(),
  avoidClaims: StrList.optional(),
  preferredCta: z.string().trim().max(120).optional().nullable(),
  tonePreference: z.string().trim().max(500).optional().nullable(),
  language: z.string().trim().min(2).max(8).optional(),
});

export type BusinessProfileInput = z.infer<typeof BusinessProfileInputSchema>;

export const PageClassificationSchema = z.object({
  page_type: z.enum([
    "homepage",
    "service",
    "blog",
    "location",
    "contact",
    "landing",
    "category",
    "about",
    "other",
  ]),
  intent: z.enum([
    "informational",
    "commercial",
    "local",
    "trust",
    "conversion",
    "navigational",
  ]),
  commercial_priority: z.enum(["low", "medium", "high"]),
  target_keyword: z.string().trim().max(200).optional().nullable(),
  target_audience: z.string().trim().max(300).optional().nullable(),
  desired_action: z.string().trim().max(200).optional().nullable(),
  funnel_stage: z.string().trim().max(80).optional().nullable(),
  summary: z.string().trim().max(600).optional().nullable(),
});

export type PageClassification = z.infer<typeof PageClassificationSchema>;

export const BrandVoiceOutputSchema = z.object({
  tone_summary: z.string().trim().min(10).max(800),
  writing_style: z
    .object({
      formality: z.string().trim().max(60).optional(),
      sentence_length: z.string().trim().max(60).optional(),
      person: z.string().trim().max(60).optional(),
      style_rules: z.array(z.string().trim().max(200)).max(20).optional(),
    })
    .partial()
    .default({}),
  preferred_words: z.array(z.string().trim().max(80)).max(40).default([]),
  forbidden_words: z.array(z.string().trim().max(80)).max(40).default([]),
  example_phrases: z.array(z.string().trim().max(300)).max(20).default([]),
  reading_level: z.string().trim().max(40).optional().nullable(),
  language: z.string().trim().max(8).default("nl"),
});

export type BrandVoiceOutput = z.infer<typeof BrandVoiceOutputSchema>;
