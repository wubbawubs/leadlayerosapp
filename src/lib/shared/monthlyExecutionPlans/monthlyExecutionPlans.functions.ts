/**
 * Monthly Execution Plans V1 — server functions.
 *
 * generateMonthlyExecutionPlan  — builds + inserts a new plan row
 * getLatestMonthlyExecutionPlan — fetches most recent plan for tenant
 * listMonthlyExecutionPlans     — lists plans newest first
 * updateMonthlyExecutionPlanStatus — operator review transitions
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  GenerateMonthlyExecutionPlanInputSchema,
  GetLatestMonthlyExecutionPlanInputSchema,
  ListMonthlyExecutionPlansInputSchema,
  UpdateMonthlyExecutionPlanStatusInputSchema,
  type MonthlyExecutionPlan,
  type PackageTier,
  type PlanStatus,
} from "./schemas";
import { buildMonthlyExecutionPlan } from "./monthlyExecutionPlanBuilder.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

// ------------------------------------------------------------------
// Auth helpers
// ------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertOperator(supabase: any, userId: string, tenantId: string) {
  const { data, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: not a member of this tenant");
  if (data.role !== "owner" && data.role !== "operator") {
    throw new Error("Forbidden: requires operator or owner role");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertMember(supabase: any, userId: string, tenantId: string) {
  const { data, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: not a member of this tenant");
}

function rowToPlan(r: Record<string, unknown>): MonthlyExecutionPlan {
  return {
    id: r.id as string,
    tenantId: r.tenant_id as string,
    growthGoalId: (r.growth_goal_id as string | null) ?? null,
    monthlyReportId: (r.monthly_report_id as string | null) ?? null,
    periodStart: r.period_start as string,
    periodEnd: r.period_end as string,
    packageTier: (r.package_tier as PackageTier) ?? "growth",
    status: (r.status as PlanStatus) ?? "draft",
    leadGapSummary: (r.lead_gap_summary ?? {}) as MonthlyExecutionPlan["leadGapSummary"],
    selectedActions: Array.isArray(r.selected_actions)
      ? (r.selected_actions as MonthlyExecutionPlan["selectedActions"])
      : [],
    rationale: (r.rationale as string | null) ?? null,
    expectedImpact: (r.expected_impact ?? {}) as MonthlyExecutionPlan["expectedImpact"],
    requiredInputs: Array.isArray(r.required_inputs) ? (r.required_inputs as string[]) : [],
    risks: Array.isArray(r.risks) ? (r.risks as string[]) : [],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// ------------------------------------------------------------------
// 1. generateMonthlyExecutionPlan
// ------------------------------------------------------------------

export const generateMonthlyExecutionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateMonthlyExecutionPlanInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const built = await buildMonthlyExecutionPlan({
      tenantId: data.tenantId,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      packageTier: data.packageTier ?? "growth",
      monthlyReportId: data.monthlyReportId ?? null,
    });

    const { data: row, error } = await admin
      .from("monthly_execution_plans")
      .insert({
        tenant_id: built.tenantId,
        growth_goal_id: built.growthGoalId,
        monthly_report_id: built.monthlyReportId,
        period_start: built.periodStart,
        period_end: built.periodEnd,
        package_tier: built.packageTier,
        status: built.status,
        lead_gap_summary: built.leadGapSummary,
        selected_actions: built.selectedActions,
        rationale: built.rationale,
        expected_impact: built.expectedImpact,
        required_inputs: built.requiredInputs,
        risks: built.risks,
      })
      .select("*")
      .single();
    if (error) throw error;

    return { ok: true, plan: rowToPlan(row as Record<string, unknown>) };
  });

// ------------------------------------------------------------------
// 2. getLatestMonthlyExecutionPlan
// ------------------------------------------------------------------

export const getLatestMonthlyExecutionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GetLatestMonthlyExecutionPlanInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    const { data: row, error } = await admin
      .from("monthly_execution_plans")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    return { plan: row ? rowToPlan(row as Record<string, unknown>) : null };
  });

// ------------------------------------------------------------------
// 3. listMonthlyExecutionPlans
// ------------------------------------------------------------------

export const listMonthlyExecutionPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListMonthlyExecutionPlansInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    const { data: rows, error } = await admin
      .from("monthly_execution_plans")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .order("period_start", { ascending: false })
      .limit(data.limit ?? 12);
    if (error) throw error;

    return {
      plans: (rows ?? []).map((r: Record<string, unknown>) => rowToPlan(r)),
    };
  });

// ------------------------------------------------------------------
// 4. updateMonthlyExecutionPlanStatus
// ------------------------------------------------------------------

export const updateMonthlyExecutionPlanStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateMonthlyExecutionPlanStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const { data: row, error } = await admin
      .from("monthly_execution_plans")
      .update({ status: data.status })
      .eq("id", data.planId)
      .eq("tenant_id", data.tenantId)
      .select("*")
      .single();
    if (error) throw error;

    return { ok: true, plan: rowToPlan(row as Record<string, unknown>) };
  });
