/**
 * Masterplan V1 — repo serverFns.
 * CRUD + generate from active growth goal.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  UpdateMasterplanItemInputSchema,
  rowToMasterPlan,
  rowToMasterplanItem,
  type MasterPlan,
  type MasterplanItem,
} from "./schemas";
import { generateMasterplanV1, type GeneratorContext } from "./generator.server";

// master_plans / masterplan_items not in generated types yet
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

export const getActiveMasterplan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row } = await (supabase as any)
      .from("master_plans")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .maybeSingle();
    return { plan: row ? rowToMasterPlan(row) : null };
  });

export const listMasterplans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase as any)
      .from("master_plans")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const plans: MasterPlan[] = (rows ?? []).map(rowToMasterPlan);
    return { plans };
  });

export const listMasterplanItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; masterPlanId: string }) =>
    z
      .object({ tenantId: z.string().uuid(), masterPlanId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase as any)
      .from("masterplan_items")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .eq("master_plan_id", data.masterPlanId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const items: MasterplanItem[] = (rows ?? []).map(rowToMasterplanItem);
    return { items };
  });

export const updateMasterplanItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { tenantId: string; itemId: string; patch: unknown }) =>
      z
        .object({
          tenantId: z.string().uuid(),
          itemId: z.string().uuid(),
          patch: z.unknown(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    const patch = UpdateMasterplanItemInputSchema.parse(data.patch ?? {});
    const update: Record<string, unknown> = {};
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.priority !== undefined) update.priority = patch.priority;
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.description !== undefined) update.description = patch.description;
    if (patch.reason !== undefined) update.reason = patch.reason;
    const { data: row, error } = await admin
      .from("masterplan_items")
      .update(update)
      .eq("id", data.itemId)
      .eq("tenant_id", data.tenantId)
      .select("*")
      .single();
    if (error) throw error;
    return { item: rowToMasterplanItem(row) };
  });

export const setActiveMasterplan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; masterPlanId: string }) =>
    z
      .object({ tenantId: z.string().uuid(), masterPlanId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);
    await admin
      .from("master_plans")
      .update({ status: "archived" })
      .eq("tenant_id", data.tenantId)
      .eq("status", "active")
      .neq("id", data.masterPlanId);
    const { error } = await admin
      .from("master_plans")
      .update({ status: "active" })
      .eq("id", data.masterPlanId)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    return { ok: true };
  });

// ----------------------------------------------------------------------------
// Generate Masterplan V1 from active growth goal
// ----------------------------------------------------------------------------

export const generateMasterplan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; growthGoalId?: string }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        growthGoalId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    // 1. Resolve goal
    let goalQuery = admin
      .from("growth_goals")
      .select("*")
      .eq("tenant_id", data.tenantId);
    goalQuery = data.growthGoalId
      ? goalQuery.eq("id", data.growthGoalId)
      : goalQuery.eq("status", "active");
    const { data: goalRow } = await goalQuery.maybeSingle();
    if (!goalRow) {
      return {
        ok: false as const,
        reason: "needs_goal" as const,
        message:
          "Geen actieve growth goal gevonden. Maak eerst een growth goal aan voordat je een masterplan kunt genereren.",
      };
    }

    // 2. Business profile v2
    const { data: bpRow } = await admin
      .from("business_profiles_v2")
      .select("offer_profile, location_profile, conversion_profile, proof_profile")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();

    // 3. Latest audit + page intelligence + issues
    const { data: latestAudit } = await admin
      .from("audits")
      .select("id, summary")
      .eq("tenant_id", data.tenantId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const auditId: string | null = latestAudit?.id ?? null;

    let issueCodes: string[] = [];
    if (auditId) {
      const { data: auditPages } = await admin
        .from("audit_pages")
        .select("issues")
        .eq("audit_id", auditId)
        .eq("tenant_id", data.tenantId)
        .limit(50);
      const codes = new Map<string, number>();
      for (const p of (auditPages ?? []) as Array<{ issues: unknown }>) {
        const arr = Array.isArray(p.issues) ? (p.issues as unknown[]) : [];
        for (const i of arr) {
          const code =
            typeof i === "object" && i !== null && "code" in i
              ? String((i as { code: unknown }).code ?? "")
              : "";
          if (code) codes.set(code, (codes.get(code) ?? 0) + 1);
        }
      }
      issueCodes = [...codes.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([c]) => c);
    }

    const { data: piRows } = await admin
      .from("page_intelligence")
      .select("page_id, page_url, page_type, primary_topic, target_keyword")
      .eq("tenant_id", data.tenantId)
      .order("analyzed_at", { ascending: false })
      .limit(40);

    const generatorCtx: GeneratorContext = {
      tenantId: data.tenantId,
      goal: {
        id: goalRow.id,
        targetType: goalRow.target_type ?? "clients",
        targetCount: goalRow.target_count == null ? null : Number(goalRow.target_count),
        currentCount: goalRow.current_count == null ? null : Number(goalRow.current_count),
        timeframeMonths:
          goalRow.timeframe_months == null ? null : Number(goalRow.timeframe_months),
        leadValue: goalRow.lead_value == null ? null : Number(goalRow.lead_value),
        closeRate: goalRow.close_rate == null ? null : Number(goalRow.close_rate),
        requiredLeads:
          goalRow.required_leads == null ? null : Number(goalRow.required_leads),
        serviceFocus: Array.isArray(goalRow.service_focus)
          ? (goalRow.service_focus as string[])
          : [],
        locations: Array.isArray(goalRow.locations) ? (goalRow.locations as string[]) : [],
        trackingNotes: goalRow.tracking_notes ?? null,
        capacityNotes: goalRow.capacity_notes ?? null,
        goodFitLeads: Array.isArray(goalRow.good_fit_leads)
          ? (goalRow.good_fit_leads as string[])
          : [],
        badFitLeads: Array.isArray(goalRow.bad_fit_leads)
          ? (goalRow.bad_fit_leads as string[])
          : [],
      },
      businessProfile: bpRow
        ? {
            offerProfile: bpRow.offer_profile ?? {},
            locationProfile: bpRow.location_profile ?? {},
            conversionProfile: bpRow.conversion_profile ?? {},
            proofProfile: bpRow.proof_profile ?? {},
            businessIdentity: bpRow.business_identity ?? {},
          }
        : null,
      pageIntel: (piRows ?? []).map(
        (r: {
          page_id: string | null;
          page_url: string | null;
          page_type: string | null;
          primary_topic: string | null;
          target_keyword: string | null;
        }) => ({
          pageId: r.page_id ?? null,
          pageUrl: r.page_url ?? null,
          pageType: r.page_type ?? "other",
          primaryTopic: r.primary_topic ?? null,
          targetKeyword: r.target_keyword ?? null,
        }),
      ),
      audit: { id: auditId, issueCodes },
    };

    const result = generateMasterplanV1(generatorCtx);

    // 4. Archive previous active plan, then insert new active plan
    await admin
      .from("master_plans")
      .update({ status: "archived" })
      .eq("tenant_id", data.tenantId)
      .eq("status", "active");

    const { data: planRow, error: planErr } = await admin
      .from("master_plans")
      .insert({
        tenant_id: data.tenantId,
        growth_goal_id: goalRow.id,
        status: "active",
        summary: result.summary,
        strategy_summary: result.strategySummary,
        lead_math: result.leadMath,
        main_constraints: result.mainConstraints,
        generated_from: result.generatedFrom,
        missing_context: result.missingContext,
        confidence: result.confidence,
      })
      .select("*")
      .single();
    if (planErr) throw planErr;

    // 5. Insert items
    if (result.items.length > 0) {
      const itemRows = result.items.map((it) => ({
        tenant_id: data.tenantId,
        master_plan_id: planRow.id,
        linked_goal_id: goalRow.id,
        type: it.type,
        title: it.title,
        description: it.description,
        reason: it.reason,
        priority: it.priority,
        effort: it.effort,
        expected_impact: it.expectedImpact,
        source: it.source,
        linked_page_id: it.linkedPageId ?? null,
        linked_audit_id: auditId,
        linked_issue_id:
          it.metadata && typeof it.metadata.issueCode === "string"
            ? it.metadata.issueCode
            : null,
        metadata: it.metadata ?? {},
      }));
      const { error: itemsErr } = await admin.from("masterplan_items").insert(itemRows);
      if (itemsErr) throw itemsErr;
    }

    return {
      ok: true as const,
      plan: rowToMasterPlan(planRow),
      itemCount: result.items.length,
    };
  });
