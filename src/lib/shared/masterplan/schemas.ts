/**
 * Masterplan V1 — schemas + types.
 * Translates an active Growth Goal into a concrete execution plan
 * with prioritized items.
 */
import { z } from "zod";

export const MASTERPLAN_STATUSES = ["draft", "active", "archived"] as const;
export type MasterplanStatus = (typeof MASTERPLAN_STATUSES)[number];

export const MASTERPLAN_ITEM_TYPES = [
  "tracking",
  "service_page",
  "location_page",
  "website_fix",
  "gbp",
  "review",
  "content",
  "conversion",
  "reporting",
] as const;
export type MasterplanItemType = (typeof MASTERPLAN_ITEM_TYPES)[number];

export const MASTERPLAN_ITEM_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type MasterplanItemPriority = (typeof MASTERPLAN_ITEM_PRIORITIES)[number];

export const MASTERPLAN_ITEM_STATUSES = [
  "proposed",
  "approved",
  "in_progress",
  "done",
  "skipped",
] as const;
export type MasterplanItemStatus = (typeof MASTERPLAN_ITEM_STATUSES)[number];

export const MASTERPLAN_EFFORT = ["low", "medium", "high"] as const;
export const MASTERPLAN_IMPACT = ["low", "medium", "high"] as const;

export const MASTERPLAN_ITEM_SOURCES = [
  "goal",
  "audit",
  "business_profile",
  "page_intelligence",
  "ai",
  "operator",
] as const;
export type MasterplanItemSource = (typeof MASTERPLAN_ITEM_SOURCES)[number];

export const LeadMathSchema = z.object({
  targetCount: z.number().nullable(),
  currentCount: z.number().nullable(),
  closeRate: z.number().nullable(),
  requiredLeads: z.number().nullable(),
  leadGap: z.number().nullable(),
  leadValue: z.number().nullable(),
  timeframeMonths: z.number().nullable(),
});
export type LeadMath = z.infer<typeof LeadMathSchema>;

export const MasterPlanSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  growthGoalId: z.string().uuid().nullable(),
  status: z.enum(MASTERPLAN_STATUSES),
  summary: z.string().nullable(),
  strategySummary: z.string().nullable(),
  leadMath: LeadMathSchema.partial().nullable(),
  mainConstraints: z.array(z.string()),
  generatedFrom: z.record(z.string(), z.unknown()),
  missingContext: z.array(z.string()),
  confidence: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MasterPlan = z.infer<typeof MasterPlanSchema>;

export const MasterplanItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  masterPlanId: z.string().uuid(),
  linkedGoalId: z.string().uuid().nullable(),
  type: z.enum(MASTERPLAN_ITEM_TYPES),
  title: z.string(),
  description: z.string().nullable(),
  reason: z.string().nullable(),
  priority: z.enum(MASTERPLAN_ITEM_PRIORITIES),
  status: z.enum(MASTERPLAN_ITEM_STATUSES),
  effort: z.enum(MASTERPLAN_EFFORT).nullable(),
  expectedImpact: z.enum(MASTERPLAN_IMPACT).nullable(),
  source: z.enum(MASTERPLAN_ITEM_SOURCES).nullable(),
  linkedPageId: z.string().uuid().nullable(),
  linkedAuditId: z.string().uuid().nullable(),
  linkedIssueId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MasterplanItem = z.infer<typeof MasterplanItemSchema>;

export const UpdateMasterplanItemInputSchema = z.object({
  status: z.enum(MASTERPLAN_ITEM_STATUSES).optional(),
  priority: z.enum(MASTERPLAN_ITEM_PRIORITIES).optional(),
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(4000).nullable().optional(),
  reason: z.string().max(4000).nullable().optional(),
});
export type UpdateMasterplanItemInput = z.infer<typeof UpdateMasterplanItemInputSchema>;

export function rowToMasterPlan(row: Record<string, unknown>): MasterPlan {
  return MasterPlanSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    growthGoalId: (row.growth_goal_id as string | null) ?? null,
    status: row.status,
    summary: (row.summary as string | null) ?? null,
    strategySummary: (row.strategy_summary as string | null) ?? null,
    leadMath: (row.lead_math as object | null) ?? null,
    mainConstraints: Array.isArray(row.main_constraints) ? (row.main_constraints as string[]) : [],
    generatedFrom: (row.generated_from as Record<string, unknown> | null) ?? {},
    missingContext: Array.isArray(row.missing_context) ? (row.missing_context as string[]) : [],
    confidence: row.confidence == null ? null : Number(row.confidence),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  });
}

export function rowToMasterplanItem(row: Record<string, unknown>): MasterplanItem {
  return MasterplanItemSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    masterPlanId: row.master_plan_id,
    linkedGoalId: (row.linked_goal_id as string | null) ?? null,
    type: row.type,
    title: row.title,
    description: (row.description as string | null) ?? null,
    reason: (row.reason as string | null) ?? null,
    priority: row.priority,
    status: row.status,
    effort: (row.effort as string | null) ?? null,
    expectedImpact: (row.expected_impact as string | null) ?? null,
    source: (row.source as string | null) ?? null,
    linkedPageId: (row.linked_page_id as string | null) ?? null,
    linkedAuditId: (row.linked_audit_id as string | null) ?? null,
    linkedIssueId: (row.linked_issue_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  });
}

export function priorityRank(p: MasterplanItemPriority): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[p];
}

/** 30/60/90 day bucket derived from priority+effort. */
export function roadmapBucket(item: MasterplanItem): "30" | "60" | "90" {
  if (item.priority === "critical") return "30";
  if (item.priority === "high") return item.effort === "high" ? "60" : "30";
  if (item.priority === "medium") return "60";
  return "90";
}
