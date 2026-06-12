/**
 * Reporting math layer — Sprint E #5.
 *
 * Computes whether the active growth goal is on track based on real lead
 * activity from the `leads` table. Returns the structured shape the
 * upcoming reporting UI / Execution Board summary will consume:
 *
 *   { requiredLeads, actualLeads, gap, projectedCloseDate }
 *
 * Pure math + a couple of admin reads — no LLM, no side effects.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

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

export type GoalProgressStatus =
  | "no_goal"
  | "no_data"
  | "on_track"
  | "behind"
  | "ahead"
  | "complete";

export interface GoalProgressReport {
  status: GoalProgressStatus;
  goalId: string | null;
  goalTitle: string | null;
  /** Total leads required across the whole timeframe to hit the target. */
  requiredLeads: number;
  /** Leads logged since the goal was created. */
  actualLeads: number;
  /** Pro-rated leads required by today (linear pacing). */
  paceRequiredToDate: number;
  /** Pro-rated gap (paceRequiredToDate - actualLeads). Positive = behind. */
  gap: number;
  /** Calendar projection of when the goal will be hit at the current rate. */
  projectedCloseDate: string | null;
  /** Implied wins so far = actualLeads * close_rate. */
  projectedWins: number;
  targetCount: number | null;
  closeRate: number | null;
  timeframeMonths: number | null;
  startedAt: string | null;
  deadline: string | null;
  daysElapsed: number;
  daysRemaining: number;
  leadsPerDay: number;
  notes: string[];
}

function emptyReport(status: GoalProgressStatus): GoalProgressReport {
  return {
    status,
    goalId: null,
    goalTitle: null,
    requiredLeads: 0,
    actualLeads: 0,
    paceRequiredToDate: 0,
    gap: 0,
    projectedCloseDate: null,
    projectedWins: 0,
    targetCount: null,
    closeRate: null,
    timeframeMonths: null,
    startedAt: null,
    deadline: null,
    daysElapsed: 0,
    daysRemaining: 0,
    leadsPerDay: 0,
    notes: [],
  };
}

export const getGoalProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ report: GoalProgressReport }> => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    const { data: goal } = await admin
      .from("growth_goals")
      .select(
        "id, title, target_count, current_count, timeframe_months, lead_value, close_rate, required_leads, created_at",
      )
      .eq("tenant_id", data.tenantId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (!goal) {
      const r = emptyReport("no_goal");
      r.notes.push("No active growth goal — set one to enable reporting.");
      return { report: r };
    }

    const targetCount = goal.target_count != null ? Number(goal.target_count) : null;
    const closeRate = goal.close_rate != null ? Number(goal.close_rate) : null;
    const timeframeMonths =
      goal.timeframe_months != null ? Number(goal.timeframe_months) : null;
    const startedAt = goal.created_at as string;

    let requiredLeads = goal.required_leads != null ? Number(goal.required_leads) : 0;
    if (!requiredLeads && targetCount && closeRate && closeRate > 0) {
      requiredLeads = Math.ceil(targetCount / closeRate);
    }

    const notes: string[] = [];
    const startMs = new Date(startedAt).getTime();
    const now = Date.now();
    const totalDays = timeframeMonths ? Math.max(1, Math.round(timeframeMonths * 30.4)) : 0;
    const deadline = totalDays
      ? new Date(startMs + totalDays * 86_400_000).toISOString()
      : null;
    const daysElapsed = Math.max(0, Math.floor((now - startMs) / 86_400_000));
    const daysRemaining = totalDays ? Math.max(0, totalDays - daysElapsed) : 0;

    if (!requiredLeads) notes.push("Required leads is 0 — fill in target & close rate.");
    if (!timeframeMonths) notes.push("Timeframe ontbreekt — pacing kan niet worden berekend.");

    // Count all active leads for this tenant (not limited to post-goal date so seeded
    // historical leads contribute to goal progress as expected).
    const { data: leadRows, error: leadErr } = await admin
      .from("leads")
      .select("status, created_at")
      .eq("tenant_id", data.tenantId);
    if (leadErr) throw leadErr;

    const countableStatuses = new Set(["new", "qualified", "won"]);
    const actualLeads = ((leadRows ?? []) as Array<{ status: string }>).filter((r) =>
      countableStatuses.has(r.status ?? "new"),
    ).length;

    const leadsPerDay = daysElapsed > 0 ? actualLeads / daysElapsed : 0;
    const paceRequiredToDate =
      totalDays > 0 && requiredLeads > 0
        ? Math.round((requiredLeads * daysElapsed) / totalDays)
        : 0;
    const gap = paceRequiredToDate - actualLeads;
    const projectedWins = closeRate ? Math.round(actualLeads * closeRate * 100) / 100 : 0;

    let projectedCloseDate: string | null = null;
    if (requiredLeads > 0 && leadsPerDay > 0 && actualLeads < requiredLeads) {
      const remaining = requiredLeads - actualLeads;
      const daysToFinish = Math.ceil(remaining / leadsPerDay);
      projectedCloseDate = new Date(now + daysToFinish * 86_400_000).toISOString();
    } else if (requiredLeads > 0 && actualLeads >= requiredLeads) {
      projectedCloseDate = new Date(now).toISOString();
    }

    let status: GoalProgressStatus;
    if (actualLeads === 0 && daysElapsed === 0) status = "no_data";
    else if (requiredLeads > 0 && actualLeads >= requiredLeads) status = "complete";
    else if (gap <= -1) status = "ahead";
    else if (gap >= 1) status = "behind";
    else status = "on_track";

    return {
      report: {
        status,
        goalId: goal.id,
        goalTitle: goal.title ?? null,
        requiredLeads,
        actualLeads,
        paceRequiredToDate,
        gap,
        projectedCloseDate,
        projectedWins,
        targetCount,
        closeRate,
        timeframeMonths,
        startedAt,
        deadline,
        daysElapsed,
        daysRemaining,
        leadsPerDay: Math.round(leadsPerDay * 100) / 100,
        notes,
      },
    };
  });
