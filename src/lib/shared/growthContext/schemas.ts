/**
 * Growth Context V1 — unified context object for Proposal Engine V2.
 * Schemas here are deliberately tolerant: they describe the *output* of the
 * builder, which composes already-validated upstream data.
 */
import { z } from "zod";

export const READINESS_STATUS = ["ready", "needs_review", "needs_context", "blocked"] as const;
export type ReadinessStatus = (typeof READINESS_STATUS)[number];

export const ACTION_TYPES = [
  "rewrite_meta_description",
  "write_meta_description",
  "write_h1",
  "rewrite_h1",
  "write_alt_text",
  "propose_schema",
  "propose_intro_or_content_expansion",
  "write_cta",
  "fix_internal_link",
  "general_recommendation",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const RISK_LEVELS = ["low", "medium", "high"] as const;

export const ReadinessSchema = z.object({
  score: z.number().min(0).max(10),
  status: z.enum(READINESS_STATUS),
  missing: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  breakdown: z.record(z.string(), z.number()).default({}),
});

export const ActionContextSchema = z.object({
  actionType: z.enum(ACTION_TYPES),
  riskLevel: z.enum(RISK_LEVELS),
  allowedFields: z.array(z.string()).default([]),
  outputSchema: z.record(z.string(), z.unknown()).default({}),
  qualityThreshold: z.number().min(0).max(10),
  requiresApproval: z.boolean().default(true),
  maxLength: z.number().nullable().default(null),
  generationRules: z.array(z.string()).default([]),
});

export const GuardrailsSchema = z.object({
  allowedClaims: z.array(z.string()).default([]),
  riskyClaims: z.array(z.string()).default([]),
  forbiddenClaims: z.array(z.string()).default([]),
  safeAlternatives: z.record(z.string(), z.string()).default({}),
  unverifiedProofCannotBeUsedAsFact: z.boolean().default(true),
  forbiddenWords: z.array(z.string()).default([]),
});

export const GrowthContextSchema = z.object({
  tenantId: z.string().uuid(),
  auditId: z.string().uuid(),
  pageId: z.string().uuid(),
  issueId: z.string(),

  readiness: ReadinessSchema,

  business: z.object({
    status: z.string(),
    confidenceScore: z.number(),
    identity: z.record(z.string(), z.unknown()),
    offer: z.record(z.string(), z.unknown()),
    icp: z.record(z.string(), z.unknown()),
    location: z.record(z.string(), z.unknown()),
    conversion: z.record(z.string(), z.unknown()),
    proof: z.record(z.string(), z.unknown()),
    claims: z.record(z.string(), z.unknown()),
    primaryStrategyAngle: z.string().nullable(),
  }).nullable(),

  tone: z.object({
    status: z.string(),
    confidenceScore: z.number().nullable(),
    summary: z.string(),
    formality: z.string(),
    preferredWords: z.array(z.string()),
    avoidWords: z.array(z.string()),
    forbiddenWords: z.array(z.string()),
    goodExamples: z.array(z.string()),
    badExamples: z.array(z.string()),
    ctaStyle: z.string(),
  }).nullable(),

  page: z.object({
    pageUrl: z.string().nullable(),
    pageType: z.string(),
    intent: z.string(),
    funnelStage: z.string().nullable(),
    commercialPriority: z.string(),
    seoRole: z.string().nullable(),
    primaryTopic: z.string().nullable(),
    contentSummary: z.string().nullable(),
    targetAudience: z.string().nullable(),
    desiredAction: z.string().nullable(),
    recommendedCTA: z.string().nullable(),
    relevantStrategyAngle: z.string().nullable(),
    localRelevance: z.record(z.string(), z.unknown()),
    riskFlags: z.array(z.record(z.string(), z.unknown())),
    missingPageContext: z.array(z.record(z.string(), z.unknown())),
    confidence: z.number(),
  }).nullable(),

  issue: z.object({
    issueId: z.string(),
    issueType: z.string(),
    severity: z.string(),
    message: z.string(),
    currentValue: z.unknown().nullable(),
    targetField: z.string().nullable(),
  }),

  action: ActionContextSchema,
  guardrails: GuardrailsSchema,

  instructions: z.object({
    language: z.string(),
    locale: z.string(),
    preferredCTA: z.string(),
    primaryAngle: z.string(),
    mustUse: z.array(z.string()),
    mustAvoid: z.array(z.string()),
    shouldMentionLocation: z.boolean(),
    shouldUseProof: z.boolean(),
    pagePriority: z.string(),
  }),
});

export type GrowthContext = z.infer<typeof GrowthContextSchema>;

// ---------- Issue → Action mapping ----------

export interface ActionContextDef {
  actionType: ActionType;
  riskLevel: "low" | "medium" | "high";
  allowedFields: string[];
  outputSchema: Record<string, unknown>;
  qualityThreshold: number;
  requiresApproval: boolean;
  maxLength: number | null;
  generationRules: string[];
}

const ACTION_BY_ISSUE: Record<string, ActionContextDef> = {
  long_meta: {
    actionType: "rewrite_meta_description",
    riskLevel: "low",
    allowedFields: ["meta_description"],
    outputSchema: { text: "string" },
    qualityThreshold: 7,
    requiresApproval: true,
    maxLength: 160,
    generationRules: [
      "120-160 characters",
      "Include primary keyword/topic naturally",
      "End with a soft CTA aligned with preferredCTA",
      "No generic hype words",
    ],
  },
  missing_meta: {
    actionType: "write_meta_description",
    riskLevel: "low",
    allowedFields: ["meta_description"],
    outputSchema: { text: "string" },
    qualityThreshold: 7,
    requiresApproval: true,
    maxLength: 160,
    generationRules: [
      "120-160 characters",
      "Anchor on primaryTopic and desiredAction",
      "Match tone: formality + ctaStyle",
    ],
  },
  missing_h1: {
    actionType: "write_h1",
    riskLevel: "medium",
    allowedFields: ["h1"],
    outputSchema: { text: "string" },
    qualityThreshold: 7.5,
    requiresApproval: true,
    maxLength: 80,
    generationRules: ["One single H1", "Reflect primaryTopic", "Avoid generic verbs alone"],
  },
  bad_h1: {
    actionType: "rewrite_h1",
    riskLevel: "medium",
    allowedFields: ["h1"],
    outputSchema: { text: "string" },
    qualityThreshold: 7.5,
    requiresApproval: true,
    maxLength: 80,
    generationRules: ["Keep meaning", "Make scannable", "No forbidden words"],
  },
  images_no_alt: {
    actionType: "write_alt_text",
    riskLevel: "low",
    allowedFields: ["alt_text"],
    outputSchema: { alts: "string[]" },
    qualityThreshold: 6.5,
    requiresApproval: true,
    maxLength: 120,
    generationRules: [
      "Describe the image factually",
      "No keyword stuffing",
      "Skip decorative images (return empty string)",
    ],
  },
  no_schema: {
    actionType: "propose_schema",
    riskLevel: "high",
    allowedFields: ["jsonld"],
    outputSchema: { jsonld: "object" },
    qualityThreshold: 8,
    requiresApproval: true,
    maxLength: null,
    generationRules: [
      "Only include verified facts from proof_profile",
      "Never invent ratings, prices, addresses",
      "Choose schema.org type that matches pageType",
    ],
  },
  thin_content: {
    actionType: "propose_intro_or_content_expansion",
    riskLevel: "medium",
    allowedFields: ["intro_html", "section_html"],
    outputSchema: { html: "string" },
    qualityThreshold: 7,
    requiresApproval: true,
    maxLength: 1200,
    generationRules: [
      "Address target audience pain points",
      "Use safe claims only",
      "Lead with desiredAction angle",
    ],
  },
  missing_cta: {
    actionType: "write_cta",
    riskLevel: "medium",
    allowedFields: ["cta_text", "cta_href"],
    outputSchema: { text: "string", href: "string" },
    qualityThreshold: 7.5,
    requiresApproval: true,
    maxLength: 60,
    generationRules: ["Match preferredCTA wording", "Active voice", "No generic 'Click here'"],
  },
  broken_internal_link: {
    actionType: "fix_internal_link",
    riskLevel: "low",
    allowedFields: ["href"],
    outputSchema: { href: "string" },
    qualityThreshold: 6,
    requiresApproval: true,
    maxLength: 500,
    generationRules: ["Use existing valid URL on the same domain"],
  },
};

const FALLBACK_ACTION: ActionContextDef = {
  actionType: "general_recommendation",
  riskLevel: "low",
  allowedFields: [],
  outputSchema: { recommendation: "string" },
  qualityThreshold: 6,
  requiresApproval: true,
  maxLength: 600,
  generationRules: ["Be concrete", "Tie to the audit issue"],
};

export function mapIssueToAction(issueCode: string): ActionContextDef {
  return ACTION_BY_ISSUE[issueCode] ?? FALLBACK_ACTION;
}
