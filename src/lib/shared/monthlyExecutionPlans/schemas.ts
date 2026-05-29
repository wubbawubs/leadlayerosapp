import { z } from "zod";

// ------------------------------------------------------------------
// Enums
// ------------------------------------------------------------------

export const PACKAGE_TIERS = ["starter", "growth", "pro"] as const;
export type PackageTier = (typeof PACKAGE_TIERS)[number];

export const PLAN_STATUSES = [
  "draft",
  "ready_for_review",
  "approved",
  "in_execution",
  "completed",
  "archived",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const ACTION_CATEGORIES = [
  "visibility_asset",
  "conversion_improvement",
  "trust_or_proof",
  "local_visibility",
  "measurement",
  "reporting_or_review",
] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

export const DELIVERY_TYPES = ["software", "operator", "hybrid", "manual"] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

export const LEAD_IMPACTS = ["low", "medium", "high"] as const;
export type LeadImpact = (typeof LEAD_IMPACTS)[number];

// ------------------------------------------------------------------
// Selected action shape (stored in selected_actions JSONB)
// ------------------------------------------------------------------

export const PlanActionSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(ACTION_CATEGORIES),
  priority: z.enum(["low", "medium", "high", "critical"]),
  linkedMasterplanItemId: z.string().uuid().nullable().optional(),
  linkedExecutionArtifactId: z.string().uuid().nullable().optional(),
  linkedWordpressDraftId: z.string().uuid().nullable().optional(),
  deliveryType: z.enum(DELIVERY_TYPES),
  expectedLeadImpact: z.enum(LEAD_IMPACTS),
  rationale: z.string(),
  requiredInputs: z.array(z.string()),
  successMetric: z.string(),
  status: z.literal("planned"),
});
export type PlanAction = z.infer<typeof PlanActionSchema>;

// ------------------------------------------------------------------
// Lead gap summary stored on the plan
// ------------------------------------------------------------------

export const PlanLeadGapSummarySchema = z.object({
  requiredPerMonth: z.number().nullable(),
  actualLastPeriod: z.number().int(),
  gap: z.number().nullable(),
  onTrack: z.boolean(),
  paceNote: z.string(),
});
export type PlanLeadGapSummary = z.infer<typeof PlanLeadGapSummarySchema>;

// ------------------------------------------------------------------
// Expected impact
// ------------------------------------------------------------------

export const PlanExpectedImpactSchema = z.object({
  projectedLeadUplift: z.enum(LEAD_IMPACTS),
  pagesDelivered: z.number().int(),
  actionsCompleted: z.number().int(),
  note: z.string(),
});
export type PlanExpectedImpact = z.infer<typeof PlanExpectedImpactSchema>;

// ------------------------------------------------------------------
// Domain object
// ------------------------------------------------------------------

export const MonthlyExecutionPlanSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  growthGoalId: z.string().uuid().nullable(),
  monthlyReportId: z.string().uuid().nullable(),
  periodStart: z.string(),
  periodEnd: z.string(),
  packageTier: z.enum(PACKAGE_TIERS),
  status: z.enum(PLAN_STATUSES),
  leadGapSummary: PlanLeadGapSummarySchema,
  selectedActions: z.array(PlanActionSchema),
  rationale: z.string().nullable(),
  expectedImpact: PlanExpectedImpactSchema,
  requiredInputs: z.array(z.string()),
  risks: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MonthlyExecutionPlan = z.infer<typeof MonthlyExecutionPlanSchema>;

// ------------------------------------------------------------------
// Server function inputs
// ------------------------------------------------------------------

export const GenerateMonthlyExecutionPlanInputSchema = z.object({
  tenantId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  packageTier: z.enum(PACKAGE_TIERS).optional().default("growth"),
  monthlyReportId: z.string().uuid().nullable().optional(),
});
export type GenerateMonthlyExecutionPlanInput = z.infer<typeof GenerateMonthlyExecutionPlanInputSchema>;

export const GetLatestMonthlyExecutionPlanInputSchema = z.object({
  tenantId: z.string().uuid(),
});

export const ListMonthlyExecutionPlansInputSchema = z.object({
  tenantId: z.string().uuid(),
  limit: z.number().int().min(1).max(24).optional(),
});

export const UpdateMonthlyExecutionPlanStatusInputSchema = z.object({
  tenantId: z.string().uuid(),
  planId: z.string().uuid(),
  status: z.enum(PLAN_STATUSES),
});
