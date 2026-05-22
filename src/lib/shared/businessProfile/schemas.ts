/**
 * Business Profile (Growth Intelligence Profile) — Zod schemas.
 * Generous max-lengths because this is operator-curated; analyzer (BP-2) is stricter.
 */
import { z } from "zod";

const StrArr = z.array(z.string().trim().min(1).max(400)).max(60);

function looseEnum<T extends [string, ...string[]]>(
  values: T,
  fallback: T[number],
  aliases: Record<string, T[number]> = {},
) {
  return z.preprocess((value) => {
    if (value == null || value === "") return fallback;
    if (typeof value !== "string") return value;
    const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (aliases[key]) return aliases[key];
    return (values as readonly string[]).includes(key) ? key : fallback;
  }, z.enum(values)).default(fallback);
}

export const BusinessIdentitySchema = z
  .object({
    businessName: z.string().trim().max(200).optional().default(""),
    brandName: z.string().trim().max(200).optional().default(""),
    industry: z.string().trim().max(200).optional().default(""),
    vertical: z.string().trim().max(120).optional().default(""),
    businessType: looseEnum(
      ["local_service", "ecommerce", "b2b_service", "professional_service", "other"],
      "other",
      {
        dienstverlener: "professional_service",
        service: "professional_service",
        services: "professional_service",
        service_provider: "professional_service",
        zakelijke_dienstverlening: "b2b_service",
        b2b: "b2b_service",
        lokaal: "local_service",
        lokale_dienst: "local_service",
        webshop: "ecommerce",
      },
    ),
    language: z.string().trim().max(80).optional().default("nl"),
    country: z.string().trim().max(80).optional().default("NL"),
    websiteUrl: z.string().trim().max(500).optional().default(""),
    shortDescription: z.string().trim().max(800).optional().default(""),
    maturity: looseEnum(["new", "growing", "established", "unknown"], "unknown", {
      nieuw: "new",
      groeiend: "growing",
      volwassen: "established",
      gevestigd: "established",
      onbekend: "unknown",
    }),
  })
  .partial()
  .default({});

export const OfferProfileSchema = z
  .object({
    primaryOffer: z.string().trim().max(500).optional().default(""),
    secondaryOffers: StrArr.optional().default([]),
    highValueOffers: StrArr.optional().default([]),
    lowPriorityOffers: StrArr.optional().default([]),
    offerMechanism: z.string().trim().max(800).optional().default(""),
    mainPromise: z.string().trim().max(500).optional().default(""),
    safePromise: z.string().trim().max(500).optional().default(""),
    uniqueValueProposition: z.string().trim().max(500).optional().default(""),
    pricingContext: z.string().trim().max(500).optional().default(""),
    capacityConstraints: z.string().trim().max(500).optional().default(""),
    offerMaturity: looseEnum(["unclear", "basic", "strong"], "unclear", {
      onduidelijk: "unclear",
      basis: "basic",
      sterk: "strong",
    }),
  })
  .partial()
  .default({});

export const IcpProfileSchema = z
  .object({
    idealCustomers: StrArr.optional().default([]),
    bestFitSegments: StrArr.optional().default([]),
    badFitSegments: StrArr.optional().default([]),
    painPoints: StrArr.optional().default([]),
    buyingTriggers: StrArr.optional().default([]),
    objections: StrArr.optional().default([]),
    decisionCriteria: StrArr.optional().default([]),
    desiredLeadTypes: StrArr.optional().default([]),
    undesiredLeadTypes: StrArr.optional().default([]),
  })
  .partial()
  .default({});

export const LocationProfileSchema = z
  .object({
    primaryLocation: z.string().trim().max(200).optional().default(""),
    serviceAreas: StrArr.optional().default([]),
    excludedAreas: StrArr.optional().default([]),
    regionType: looseEnum(
      ["city", "region", "province", "national", "multi_location", "unknown"],
      "unknown",
      {
        stad: "city",
        regio: "region",
        provincie: "province",
        landelijk: "national",
        nationaal: "national",
        meerdere_locaties: "multi_location",
        onbekend: "unknown",
      },
    ),
    localSearchPatterns: StrArr.optional().default([]),
    locationPageOpportunities: StrArr.optional().default([]),
    localeNotes: StrArr.optional().default([]),
    countrySpecificRules: StrArr.optional().default([]),
  })
  .partial()
  .default({});

export const ConversionProfileSchema = z
  .object({
    primaryCta: z.string().trim().max(200).optional().default(""),
    secondaryCta: z.string().trim().max(200).optional().default(""),
    preferredContactMethod: z.string().trim().max(120).optional().default(""),
    leadValueEstimate: z.number().nullable().optional().default(null),
    closeRateEstimate: z.number().nullable().optional().default(null),
    monthlyCapacity: z.number().nullable().optional().default(null),
    salesProcess: z.string().trim().max(800).optional().default(""),
    conversionBarriers: StrArr.optional().default([]),
    trustElementsNeeded: StrArr.optional().default([]),
  })
  .partial()
  .default({});

export const ProofProfileSchema = z
  .object({
    verifiedProofPoints: StrArr.optional().default([]),
    unverifiedProofPoints: StrArr.optional().default([]),
    proofGaps: StrArr.optional().default([]),
    reviewSignals: StrArr.optional().default([]),
    caseStudySignals: StrArr.optional().default([]),
    certifications: StrArr.optional().default([]),
    yearsExperience: z.number().nullable().optional().default(null),
    requiresVerification: StrArr.optional().default([]),
  })
  .partial()
  .default({});

export const ClaimGuardrailsSchema = z
  .object({
    allowedClaims: StrArr.optional().default([]),
    riskyClaims: StrArr.optional().default([]),
    forbiddenClaims: StrArr.optional().default([]),
    safeAlternatives: z.record(z.string(), z.string().max(400)).optional().default({}),
    requiresEvidence: StrArr.optional().default([]),
    requiresHumanApproval: StrArr.optional().default([]),
    complianceNotes: StrArr.optional().default([]),
  })
  .partial()
  .default({});

export const StrategyAngleSchema = z.object({
  angle: z.string().trim().min(1).max(300),
  score: z.number().min(0).max(10).optional().default(5),
  why: z.string().trim().max(800).optional().default(""),
  bestFor: StrArr.optional().default([]),
  riskLevel: looseEnum(["low", "medium", "high"], "low", {
    laag: "low",
    gemiddeld: "medium",
    middel: "medium",
    medium_risk: "medium",
    hoog: "high",
  }),
  isPrimary: z.boolean().optional().default(false),
});

export const MissingContextItemSchema = z.object({
  missing: z.string().trim().min(1).max(400),
  impact: z.string().trim().max(600).optional().default(""),
  recommendedQuestion: z.string().trim().max(400).optional().default(""),
  priority: looseEnum(["low", "medium", "high"], "medium", {
    laag: "low",
    gemiddeld: "medium",
    middel: "medium",
    hoog: "high",
  }),
  answer: z.string().trim().max(2000).optional().default(""),
  mapToField: z.string().trim().max(160).optional().default(""),
  resolvedAt: z.string().optional().default(""),
});

export const ConfidenceReasonSchema = z.object({
  score: z.number().min(0).max(10),
  strengths: z.array(z.string().max(400)).max(10).default([]),
  gaps: z.array(z.string().max(400)).max(10).default([]),
  nextSteps: z.array(z.string().max(400)).max(10).default([]),
});

export const BusinessProfileSchema = z.object({
  status: z.enum(["draft", "review_ready", "approved", "locked"]).default("draft"),
  confidence_score: z.number().min(0).max(10).default(0),
  business_identity: BusinessIdentitySchema,
  offer_profile: OfferProfileSchema,
  icp_profile: IcpProfileSchema,
  location_profile: LocationProfileSchema,
  conversion_profile: ConversionProfileSchema,
  proof_profile: ProofProfileSchema,
  claim_guardrails: ClaimGuardrailsSchema,
  strategy_angles: z.array(StrategyAngleSchema).max(40).default([]),
  missing_context: z.array(MissingContextItemSchema).max(40).default([]),
  locked_fields: z.array(z.string().max(120)).max(200).default([]),
  confidence_reasons: z.record(z.string(), ConfidenceReasonSchema).default({}),
});


export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;
export type BusinessIdentity = z.infer<typeof BusinessIdentitySchema>;
export type OfferProfile = z.infer<typeof OfferProfileSchema>;
export type IcpProfile = z.infer<typeof IcpProfileSchema>;
export type LocationProfile = z.infer<typeof LocationProfileSchema>;
export type ConversionProfile = z.infer<typeof ConversionProfileSchema>;
export type ProofProfile = z.infer<typeof ProofProfileSchema>;
export type ClaimGuardrails = z.infer<typeof ClaimGuardrailsSchema>;
export type StrategyAngle = z.infer<typeof StrategyAngleSchema>;
export type MissingContextItem = z.infer<typeof MissingContextItemSchema>;

export const SECTION_KEYS = [
  "business_identity",
  "offer_profile",
  "icp_profile",
  "location_profile",
  "conversion_profile",
  "proof_profile",
  "claim_guardrails",
  "strategy_angles",
  "missing_context",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
