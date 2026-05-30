/**
 * Growth Goal V1 — schemas + types.
 * Captures the concrete growth goal per tenant that feeds Masterplan V1.
 */
import { z } from "zod";

export const GROWTH_TARGET_TYPES = [
  "clients",
  "leads",
  "calls",
  "forms",
  "revenue",
] as const;
export type GrowthTargetType = (typeof GROWTH_TARGET_TYPES)[number];

export const GROWTH_GOAL_STATUSES = ["draft", "active", "archived"] as const;
export type GrowthGoalStatus = (typeof GROWTH_GOAL_STATUSES)[number];

export const GROWTH_GOAL_SOURCES = ["operator", "client", "ai_inferred"] as const;
export type GrowthGoalSource = (typeof GROWTH_GOAL_SOURCES)[number];

export const GROWTH_GOAL_TIERS = ["foundation", "growth", "authority"] as const;
export type GrowthGoalTier = (typeof GROWTH_GOAL_TIERS)[number];

export const CALL_CADENCES = ["monthly", "quarterly", "biweekly"] as const;
export type CallCadence = (typeof CALL_CADENCES)[number];

const StrList = z.array(z.string().trim().min(1).max(400)).max(40);

const nullableNonNeg = z.number().min(0).nullable().optional();

export const GrowthGoalSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  title: z.string().max(300).nullable().optional(),
  tier: z.enum(GROWTH_GOAL_TIERS).nullable().optional(),
  targetType: z.enum(GROWTH_TARGET_TYPES),
  targetCount: nullableNonNeg,
  currentCount: nullableNonNeg,
  timeframeMonths: z.number().int().min(1).max(36).nullable().optional(),
  leadValue: nullableNonNeg,
  closeRate: z.number().min(0).max(1).nullable().optional(),
  requiredLeads: z.number().min(0).nullable().optional(),
  serviceFocus: StrList.default([]),
  locations: StrList.default([]),
  goodFitLeads: StrList.default([]),
  badFitLeads: StrList.default([]),
  capacityNotes: z.string().max(2000).nullable().optional(),
  trackingNotes: z.string().max(2000).nullable().optional(),
  notificationEmail: z.string().email().nullable().optional(),
  notifyOnLead: z.boolean().default(false),
  nextCallAt: z.string().nullable().optional(),
  callCadence: z.enum(CALL_CADENCES).nullable().optional(),
  status: z.enum(GROWTH_GOAL_STATUSES),
  confidence: z.number().min(0).max(1).nullable().optional(),
  source: z.enum(GROWTH_GOAL_SOURCES),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GrowthGoal = z.infer<typeof GrowthGoalSchema>;

export const GrowthGoalInputSchema = z.object({
  title: z.string().trim().max(300).optional().default(""),
  tier: z.enum(GROWTH_GOAL_TIERS).nullable().optional(),
  targetType: z.enum(GROWTH_TARGET_TYPES).default("clients"),
  targetCount: z.number().min(0).nullable().optional(),
  currentCount: z.number().min(0).nullable().optional(),
  timeframeMonths: z.number().int().min(1).max(36).nullable().optional(),
  leadValue: z.number().min(0).nullable().optional(),
  closeRate: z.number().min(0).max(1).nullable().optional(),
  serviceFocus: StrList.default([]),
  locations: StrList.default([]),
  goodFitLeads: StrList.default([]),
  badFitLeads: StrList.default([]),
  capacityNotes: z.string().max(2000).optional().default(""),
  trackingNotes: z.string().max(2000).optional().default(""),
  notificationEmail: z.string().email().nullable().optional(),
  notifyOnLead: z.boolean().optional().default(false),
  nextCallAt: z.string().datetime().nullable().optional(),
  callCadence: z.enum(CALL_CADENCES).nullable().optional(),
  status: z.enum(GROWTH_GOAL_STATUSES).default("draft"),
  source: z.enum(GROWTH_GOAL_SOURCES).default("operator"),
});
export type GrowthGoalInput = z.infer<typeof GrowthGoalInputSchema>;

export function computeRequiredLeads(
  targetCount: number | null | undefined,
  closeRate: number | null | undefined,
): number | null {
  if (
    typeof targetCount !== "number" ||
    typeof closeRate !== "number" ||
    !isFinite(targetCount) ||
    !isFinite(closeRate) ||
    closeRate <= 0 ||
    targetCount < 0
  ) {
    return null;
  }
  return Math.ceil(targetCount / closeRate);
}

export function rowToGrowthGoal(row: Record<string, unknown>): GrowthGoal {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? (v as unknown[]).map((x) => String(x)).filter(Boolean) : [];
  const num = (v: unknown): number | null =>
    v === null || v === undefined || v === "" ? null : Number(v);
  return GrowthGoalSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    title: (row.title as string | null) ?? null,
    tier: (row.tier as string | null) ?? null,
    targetType: (row.target_type as GrowthTargetType) ?? "clients",
    targetCount: num(row.target_count),
    currentCount: num(row.current_count),
    timeframeMonths: row.timeframe_months == null ? null : Number(row.timeframe_months),
    leadValue: num(row.lead_value),
    closeRate: num(row.close_rate),
    requiredLeads: num(row.required_leads),
    serviceFocus: arr(row.service_focus),
    locations: arr(row.locations),
    goodFitLeads: arr(row.good_fit_leads),
    badFitLeads: arr(row.bad_fit_leads),
    capacityNotes: (row.capacity_notes as string | null) ?? null,
    trackingNotes: (row.tracking_notes as string | null) ?? null,
    notificationEmail: (row.notification_email as string | null) ?? null,
    notifyOnLead: (row.notify_on_lead as boolean | null) ?? false,
    nextCallAt: (row.next_call_at as string | null) ?? null,
    callCadence: (row.call_cadence as string | null) ?? null,
    status: (row.status as GrowthGoalStatus) ?? "draft",
    confidence: num(row.confidence),
    source: (row.source as GrowthGoalSource) ?? "operator",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  });
}
