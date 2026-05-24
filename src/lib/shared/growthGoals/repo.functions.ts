/**
 * Growth Goals — repo serverFns.
 * Goal Intake V1: CRUD + active goal + BP sync (respect locked fields).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  GrowthGoalInputSchema,
  computeRequiredLeads,
  rowToGrowthGoal,
  type GrowthGoal,
  type GrowthGoalInput,
} from "./schemas";
import { applySuggestionValue } from "@/lib/shared/businessProfile/analyzer.server";

// growth_goals table isn't in generated types yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

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

function inputToRow(input: GrowthGoalInput, tenantId: string) {
  const required = computeRequiredLeads(input.targetCount ?? null, input.closeRate ?? null);
  return {
    tenant_id: tenantId,
    title: input.title || null,
    target_type: input.targetType,
    target_count: input.targetCount ?? null,
    current_count: input.currentCount ?? null,
    timeframe_months: input.timeframeMonths ?? null,
    lead_value: input.leadValue ?? null,
    close_rate: input.closeRate ?? null,
    required_leads: required,
    service_focus: input.serviceFocus ?? [],
    locations: input.locations ?? [],
    good_fit_leads: input.goodFitLeads ?? [],
    bad_fit_leads: input.badFitLeads ?? [],
    capacity_notes: input.capacityNotes || null,
    tracking_notes: input.trackingNotes || null,
    status: input.status,
    source: input.source,
  };
}

export const listGrowthGoals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase as any)
      .from("growth_goals")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const goals: GrowthGoal[] = (rows ?? []).map(rowToGrowthGoal);
    return { goals };
  });

export const getActiveGrowthGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row } = await (supabase as any)
      .from("growth_goals")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .eq("status", "active")
      .maybeSingle();
    return { goal: row ? rowToGrowthGoal(row) : null };
  });

export const createGrowthGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; input: unknown }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        input: z.unknown(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    const parsed = GrowthGoalInputSchema.parse(data.input ?? {});

    // If creating as active, demote any existing active goal to archived
    // (partial unique index would otherwise reject).
    if (parsed.status === "active") {
      await admin
        .from("growth_goals")
        .update({ status: "archived" })
        .eq("tenant_id", data.tenantId)
        .eq("status", "active");
    }

    const { data: row, error } = await admin
      .from("growth_goals")
      .insert(inputToRow(parsed, data.tenantId))
      .select("*")
      .single();
    if (error) throw error;
    return { goal: rowToGrowthGoal(row) };
  });

export const updateGrowthGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; goalId: string; input: unknown }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        goalId: z.string().uuid(),
        input: z.unknown(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    const parsed = GrowthGoalInputSchema.parse(data.input ?? {});

    if (parsed.status === "active") {
      await admin
        .from("growth_goals")
        .update({ status: "archived" })
        .eq("tenant_id", data.tenantId)
        .eq("status", "active")
        .neq("id", data.goalId);
    }

    const { data: row, error } = await admin
      .from("growth_goals")
      .update(inputToRow(parsed, data.tenantId))
      .eq("id", data.goalId)
      .eq("tenant_id", data.tenantId)
      .select("*")
      .single();
    if (error) throw error;
    return { goal: rowToGrowthGoal(row) };
  });

export const archiveGrowthGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; goalId: string }) =>
    z
      .object({ tenantId: z.string().uuid(), goalId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    const { error } = await admin
      .from("growth_goals")
      .update({ status: "archived" })
      .eq("id", data.goalId)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    return { ok: true };
  });

export const setActiveGrowthGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; goalId: string }) =>
    z
      .object({ tenantId: z.string().uuid(), goalId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    await admin
      .from("growth_goals")
      .update({ status: "archived" })
      .eq("tenant_id", data.tenantId)
      .eq("status", "active")
      .neq("id", data.goalId);
    const { error } = await admin
      .from("growth_goals")
      .update({ status: "active" })
      .eq("id", data.goalId)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    return { ok: true };
  });

// ----------------------------------------------------------------------------
// Business Profile sync — write goal context into BP_v2 only where field is
// empty AND not locked. Returns list of warnings for skipped fields.
// ----------------------------------------------------------------------------

type SyncWarning = { fieldPath: string; reason: "locked" | "already_set" | "error"; detail?: string };

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "number") return !isFinite(value);
  return false;
}

function readPath(obj: Record<string, unknown> | undefined, path: string): unknown {
  if (!obj) return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function isLocked(path: string, locked: string[]): boolean {
  if (locked.includes(path)) return true;
  // Section-level lock blocks all sub-paths
  const section = path.split(".")[0];
  if (locked.includes(section)) return true;
  return false;
}

export const syncGrowthGoalToBusinessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; goalId: string }) =>
    z
      .object({ tenantId: z.string().uuid(), goalId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const { data: goalRow, error: gErr } = await admin
      .from("growth_goals")
      .select("*")
      .eq("id", data.goalId)
      .eq("tenant_id", data.tenantId)
      .single();
    if (gErr || !goalRow) throw new Error("Growth goal niet gevonden");
    const goal = rowToGrowthGoal(goalRow);

    const { data: bpRow } = await admin
      .from("business_profiles_v2")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    const locked: string[] = Array.isArray(bpRow?.locked_fields)
      ? (bpRow!.locked_fields as string[])
      : [];

    const warnings: SyncWarning[] = [];
    const applied: string[] = [];

    type SyncEntry = { fieldPath: string; value: unknown };
    const candidates: SyncEntry[] = [];

    if (goal.serviceFocus.length > 0) {
      candidates.push({ fieldPath: "offer_profile.highValueOffers", value: goal.serviceFocus });
    }
    if (goal.locations.length > 0) {
      candidates.push({ fieldPath: "location_profile.serviceAreas", value: goal.locations });
    }
    if (goal.goodFitLeads.length > 0) {
      candidates.push({ fieldPath: "icp_profile.bestFitSegments", value: goal.goodFitLeads });
    }
    if (goal.badFitLeads.length > 0) {
      candidates.push({ fieldPath: "icp_profile.badFitSegments", value: goal.badFitLeads });
    }
    if (typeof goal.leadValue === "number") {
      candidates.push({ fieldPath: "conversion_profile.leadValueEstimate", value: goal.leadValue });
    }
    if (typeof goal.closeRate === "number") {
      candidates.push({ fieldPath: "conversion_profile.closeRateEstimate", value: goal.closeRate });
    }
    if (typeof goal.targetCount === "number") {
      candidates.push({ fieldPath: "conversion_profile.monthlyCapacity", value: goal.targetCount });
    }
    if (goal.capacityNotes) {
      candidates.push({
        fieldPath: "offer_profile.capacityConstraints",
        value: goal.capacityNotes,
      });
    }

    for (const c of candidates) {
      if (isLocked(c.fieldPath, locked)) {
        warnings.push({ fieldPath: c.fieldPath, reason: "locked" });
        continue;
      }
      const current = readPath(bpRow as Record<string, unknown> | undefined, c.fieldPath);
      if (!isEmpty(current)) {
        warnings.push({ fieldPath: c.fieldPath, reason: "already_set" });
        continue;
      }
      try {
        await applySuggestionValue({
          tenantId: data.tenantId,
          fieldPath: c.fieldPath,
          value: c.value,
        });
        applied.push(c.fieldPath);
      } catch (e) {
        warnings.push({
          fieldPath: c.fieldPath,
          reason: "error",
          detail: (e as Error).message,
        });
      }
    }

    return { applied, warnings };
  });
