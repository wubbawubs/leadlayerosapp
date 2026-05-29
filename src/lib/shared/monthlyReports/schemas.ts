import { z } from "zod";

export const MONTHLY_REPORT_STATUSES = [
  "draft",
  "ready_for_review",
  "approved",
  "sent",
  "archived",
] as const;
export type MonthlyReportStatus = (typeof MONTHLY_REPORT_STATUSES)[number];

// ------------------------------------------------------------------
// JSONB sub-shapes
// ------------------------------------------------------------------

export const LeadSummarySchema = z.object({
  total: z.number().int(),
  qualified: z.number().int(),
  won: z.number().int(),
  lost: z.number().int(),
  new: z.number().int(),
  unqualified: z.number().int(),
  sources: z.record(z.string(), z.number().int()),
});
export type LeadSummary = z.infer<typeof LeadSummarySchema>;

export const GoalProgressSummarySchema = z.object({
  requiredLeadsPerMonth: z.number().nullable(),
  actualLeads: z.number().int(),
  gap: z.number().nullable(),
  onTrack: z.boolean(),
  paceNote: z.string(),
  wonLeadCount: z.number().int(),
  provenRevenue: z.number(),
  pipelineRevenue: z.number().nullable(),
});
export type GoalProgressSummary = z.infer<typeof GoalProgressSummarySchema>;

export const ExecutionSummarySchema = z.object({
  artifactsGenerated: z.number().int(),
  artifactsApproved: z.number().int(),
  masterplanItemsDone: z.number().int(),
  masterplanItemsInProgress: z.number().int(),
});
export type ExecutionSummary = z.infer<typeof ExecutionSummarySchema>;

export const WordpressSummarySchema = z.object({
  draftsCreated: z.number().int(),
  draftsPublished: z.number().int(),
  drafts: z.array(
    z.object({
      title: z.string().nullable(),
      targetSlug: z.string().nullable(),
      wpEditLink: z.string().nullable(),
      publishedUrl: z.string().nullable(),
      status: z.string(),
      publishedAt: z.string().nullable(),
    }),
  ),
});
export type WordpressSummary = z.infer<typeof WordpressSummarySchema>;

export const ReportNextActionSchema = z.object({
  label: z.string(),
  reason: z.string(),
  href: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]),
});
export type ReportNextAction = z.infer<typeof ReportNextActionSchema>;

export const ReportRiskSchema = z.object({
  key: z.string(),
  label: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string(),
});
export type ReportRisk = z.infer<typeof ReportRiskSchema>;

// ------------------------------------------------------------------
// Domain object
// ------------------------------------------------------------------

export const MonthlyReportSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  growthGoalId: z.string().uuid().nullable(),
  periodStart: z.string(),
  periodEnd: z.string(),
  status: z.enum(MONTHLY_REPORT_STATUSES),
  leadSummary: LeadSummarySchema,
  executionSummary: ExecutionSummarySchema,
  wordpressSummary: WordpressSummarySchema,
  goalProgressSummary: GoalProgressSummarySchema,
  nextActions: z.array(ReportNextActionSchema),
  risks: z.array(ReportRiskSchema),
  narrative: z.string().nullable(),
  shareToken: z.string().nullable(),
  shareTokenCreatedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MonthlyReport = z.infer<typeof MonthlyReportSchema>;

// ------------------------------------------------------------------
// Server function inputs
// ------------------------------------------------------------------

export const GenerateMonthlyReportInputSchema = z.object({
  tenantId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
});
export type GenerateMonthlyReportInput = z.infer<typeof GenerateMonthlyReportInputSchema>;

export const GetLatestMonthlyReportInputSchema = z.object({
  tenantId: z.string().uuid(),
});

export const ListMonthlyReportsInputSchema = z.object({
  tenantId: z.string().uuid(),
  limit: z.number().int().min(1).max(24).optional(),
});

export const UpdateMonthlyReportStatusInputSchema = z.object({
  tenantId: z.string().uuid(),
  reportId: z.string().uuid(),
  status: z.enum(MONTHLY_REPORT_STATUSES),
});

export const GenerateShareLinkInputSchema = z.object({
  tenantId: z.string().uuid(),
  reportId: z.string().uuid(),
});

export const RevokeShareLinkInputSchema = z.object({
  tenantId: z.string().uuid(),
  reportId: z.string().uuid(),
});
