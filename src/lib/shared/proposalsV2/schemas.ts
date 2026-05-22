/**
 * Proposal Engine V2 — schemas.
 * V2 proposals are produced exclusively from a GrowthContext object.
 */
import { z } from "zod";
import { ACTION_TYPES } from "@/lib/shared/growthContext/schemas";

export const PROPOSAL_V2_STATUS = [
  "draft",
  "needs_review",
  "needs_context",
  "rejected",
] as const;
export type ProposalV2Status = (typeof PROPOSAL_V2_STATUS)[number];

export const ScoresSchema = z.object({
  seoFit: z.number().min(0).max(10).default(0),
  toneFit: z.number().min(0).max(10).default(0),
  businessFit: z.number().min(0).max(10).default(0),
  pageFit: z.number().min(0).max(10).default(0),
  offerFit: z.number().min(0).max(10).default(0),
  icpFit: z.number().min(0).max(10).default(0),
  locationFit: z.number().min(0).max(10).default(0),
  claimSafety: z.number().min(0).max(10).default(0),
  proofSafety: z.number().min(0).max(10).default(0),
  conversionFit: z.number().min(0).max(10).default(0),
  genericnessRisk: z.number().min(0).max(10).default(0),
});
export type ProposalV2Scores = z.infer<typeof ScoresSchema>;

export const ContextUsedSchema = z.object({
  toneProfile: z.boolean(),
  businessProfile: z.boolean(),
  pageIntelligence: z.boolean(),
  primaryAngle: z.string().optional(),
  claimGuardrails: z.boolean(),
});

export const ProposalV2Schema = z.object({
  id: z.string().uuid().optional(),
  tenantId: z.string().uuid(),
  auditId: z.string().uuid(),
  pageId: z.string().uuid(),
  issueId: z.string(),
  actionType: z.enum(ACTION_TYPES),
  status: z.enum(PROPOSAL_V2_STATUS),
  title: z.string(),
  summary: z.string(),
  reasoning: z.string(),
  before: z.record(z.string(), z.unknown()),
  after: z.record(z.string(), z.unknown()),
  contextUsed: ContextUsedSchema,
  keywordsUsed: z.array(z.string()).default([]),
  riskFlags: z.array(z.string()).default([]),
  scores: ScoresSchema,
  publishable: z.boolean(),
  modelUsed: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type ProposalV2 = z.infer<typeof ProposalV2Schema>;

// Raw LLM output schema (text proposal + reasoning).
export const GeneratorTextOutputSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(400),
  reasoning: z.string().min(1).max(1500),
  after: z.record(z.string(), z.unknown()),
  keywordsUsed: z.array(z.string()).max(20).default([]),
  riskFlags: z.array(z.string()).max(20).default([]),
});
export type GeneratorTextOutput = z.infer<typeof GeneratorTextOutputSchema>;
