/**
 * Lead Engine Blueprint — Output Schemas (Ticket 1b).
 *
 * Defines the structured Blueprint object that the generator produces and
 * that Ticket 1c will render. Pure types + Zod schemas. No I/O.
 *
 * See: docs/LEAD_ENGINE_BLUEPRINT_ROADMAP.md §4 Ticket 1b
 *      docs/LEAD_ENGINE_BLUEPRINT_GENERATOR.md
 */

import { z } from "zod";

export const BLUEPRINT_SCHEMA_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Score wrappers (mirror scoring.ts but in a UI-friendly shape)
// ---------------------------------------------------------------------------

export const scoreReasonSchema = z.object({
  kind: z.enum(["affirmative", "penalty", "info"]),
  message: z.string(),
  delta: z.number().optional(),
});
export type ScoreReason = z.infer<typeof scoreReasonSchema>;

export const blueprintScoreSchema = z.object({
  /** Either 0..100 score or a structured value (model). */
  value: z.number().nullable(),
  label: z.string(),
  reasoning: z.array(scoreReasonSchema),
  missingInputs: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
export type BlueprintScore = z.infer<typeof blueprintScoreSchema>;

export const growthVelocityScoreSchema = blueprintScoreSchema.extend({
  monthlyLeads: z.array(z.number()),
  cumulativeLeads: z.array(z.number()),
  baselineMonthly: z.number(),
  monthlyGrowthRate: z.number(),
  horizonMonths: z.number(),
});
export type GrowthVelocityScore = z.infer<typeof growthVelocityScoreSchema>;

export const financialScenarioSchema = z.object({
  label: z.enum(["conservative", "expected", "aggressive"]),
  monthlyLeads: z.number().nullable(),
  closeRate: z.number().nullable(),
  newClientsPerMonth: z.number().nullable(),
  averageLeadValue: z.number().nullable(),
  estimatedMonthlyRevenue: z.number().nullable(),
  estimatedAnnualRevenue: z.number().nullable(),
  assumptions: z.array(z.string()),
});
export type BlueprintFinancialScenario = z.infer<typeof financialScenarioSchema>;

export const financialModelSchema = z.object({
  available: z.boolean(),
  conservative: financialScenarioSchema,
  expected: financialScenarioSchema,
  aggressive: financialScenarioSchema,
  notes: z.array(z.string()),
});
export type FinancialModel = z.infer<typeof financialModelSchema>;

export const blueprintScoresSchema = z.object({
  leadEngineScore: blueprintScoreSchema,
  conversionReadinessScore: blueprintScoreSchema,
  demandCoverageIndex: blueprintScoreSchema,
  growthVelocityModel: growthVelocityScoreSchema,
  financialImpact: blueprintScoreSchema,
});
export type BlueprintScores = z.infer<typeof blueprintScoresSchema>;

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export const blueprintSectionTypeSchema = z.enum([
  "goal",
  "current_situation",
  "growth_gap",
  "market_intelligence",
  "competitive_position",
  "page_diagnostics",
  "strategy",
  "roadmap",
  "lead_engine_map",
  "tracking_plan",
  "client_inputs",
  "risks_assumptions",
  "next_actions",
]);
export type BlueprintSectionType = z.infer<typeof blueprintSectionTypeSchema>;

export const blueprintSectionItemSchema = z.object({
  title: z.string(),
  detail: z.string().optional(),
  meta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});
export type BlueprintSectionItem = z.infer<typeof blueprintSectionItemSchema>;

export const blueprintMetricSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number(), z.null()]),
  unit: z.string().optional(),
  hint: z.string().optional(),
});
export type BlueprintMetric = z.infer<typeof blueprintMetricSchema>;

export const blueprintSectionSchema = z.object({
  type: blueprintSectionTypeSchema,
  title: z.string(),
  summary: z.string(),
  items: z.array(blueprintSectionItemSchema).optional(),
  metrics: z.array(blueprintMetricSchema).optional(),
  evidence: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  placeholder: z.boolean().optional(),
  /** Names downstream ticket that will fill real data. */
  pendingDataFrom: z.string().optional(),
});
export type BlueprintSection = z.infer<typeof blueprintSectionSchema>;

// ---------------------------------------------------------------------------
// Lead Engine Map
// ---------------------------------------------------------------------------

export const leadEngineNodeSchema = z.object({
  name: z.string(),
  detail: z.string().optional(),
  status: z.enum(["active", "planned", "missing", "unknown"]).default("planned"),
});
export type LeadEngineNode = z.infer<typeof leadEngineNodeSchema>;

export const leadEngineMapSchema = z.object({
  trafficSources: z.array(leadEngineNodeSchema),
  landingAssets: z.array(leadEngineNodeSchema),
  conversionPaths: z.array(leadEngineNodeSchema),
  trustBuilders: z.array(leadEngineNodeSchema),
  measurementLayer: z.array(leadEngineNodeSchema),
});
export type LeadEngineMap = z.infer<typeof leadEngineMapSchema>;

// ---------------------------------------------------------------------------
// Data availability matrix
// ---------------------------------------------------------------------------

export const dataAvailabilityStateSchema = z.enum([
  "available",
  "partial",
  "placeholder",
  "missing",
]);
export type DataAvailabilityState = z.infer<typeof dataAvailabilityStateSchema>;

export const dataAvailabilitySchema = z.object({
  marketData: dataAvailabilityStateSchema,
  competitorData: dataAvailabilityStateSchema,
  gbpData: dataAvailabilityStateSchema,
  rankingData: dataAvailabilityStateSchema,
  trackingData: dataAvailabilityStateSchema,
  pageIntelligence: dataAvailabilityStateSchema,
  audit: dataAvailabilityStateSchema,
});
export type DataAvailability = z.infer<typeof dataAvailabilitySchema>;

// ---------------------------------------------------------------------------
// Client questions & next actions
// ---------------------------------------------------------------------------

export const clientQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  why: z.string(),
  category: z.enum([
    "lead_math",
    "gbp",
    "proof",
    "operations",
    "services",
    "tracking",
    "other",
  ]),
  required: z.boolean().default(false),
});
export type ClientQuestion = z.infer<typeof clientQuestionSchema>;

export const nextActionSchema = z.object({
  id: z.string(),
  title: z.string(),
  why: z.string(),
  type: z.string(),
  sourceMasterplanItemId: z.string().nullable(),
});
export type NextAction = z.infer<typeof nextActionSchema>;

export const assumptionSchema = z.object({
  label: z.string(),
  detail: z.string(),
});
export type BlueprintAssumption = z.infer<typeof assumptionSchema>;

// ---------------------------------------------------------------------------
// Blueprint
// ---------------------------------------------------------------------------

export const blueprintStatusSchema = z.enum(["draft", "review_ready", "approved"]);
export type BlueprintStatus = z.infer<typeof blueprintStatusSchema>;

export const leadEngineBlueprintSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().optional(),
  masterPlanId: z.string().optional(),
  growthGoalId: z.string().optional(),
  language: z.string(),
  title: z.string(),
  summary: z.string(),
  status: blueprintStatusSchema.default("draft"),
  generatedAt: z.string(),
  schemaVersion: z.string(),
  scores: blueprintScoresSchema,
  sections: z.array(blueprintSectionSchema),
  leadEngineMap: leadEngineMapSchema,
  financialModel: financialModelSchema,
  assumptions: z.array(assumptionSchema),
  clientQuestions: z.array(clientQuestionSchema),
  nextActions: z.array(nextActionSchema),
  dataAvailability: dataAvailabilitySchema,
  confidence: z.number().min(0).max(1),
});
export type LeadEngineBlueprint = z.infer<typeof leadEngineBlueprintSchema>;
