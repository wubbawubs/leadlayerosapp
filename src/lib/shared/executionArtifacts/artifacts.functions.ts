// @ts-nocheck — `execution_artifacts` table not present in generated Supabase
// types yet (types regen pending). Logic unchanged; this disables typecheck for
// this file only. Pre-existing issue surfaced during dashboard rebuild.
/**
 * Execution Artifact Foundation V1 — server functions.
 *
 * Functions:
 *   generatePageBriefArtifactFn      — creates page_brief for service/location_page items
 *   listExecutionArtifactsForItem     — lists artifacts for a masterplan item
 *   getExecutionArtifact              — fetches a single artifact
 *   updateExecutionArtifactStatus     — operator review: needs_review → approved / rejected
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  GeneratePageBriefInputSchema,
  UpdateExecutionArtifactStatusInputSchema,
  type ArtifactStatus,
  type ArtifactDeliveryReadiness,
  type ArtifactQualityGates,
  type PageBriefArtifactPayload,
} from "./schemas";
import {
  checkPageBriefGates,
  checkWordpressDeliveryReadiness,
} from "./gates.server";
import { generatePageBriefArtifact } from "./generatePageBrief.server";
import type { Json } from "@/integrations/supabase/types";

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

// ------------------------------------------------------------------
// Serializable artifact shape (safe to return from server functions)
// ------------------------------------------------------------------

type SerializableArtifact = {
  id: string;
  tenantId: string;
  masterplanItemId: string;
  growthGoalId: string | null;
  artifactType: string;
  status: ArtifactStatus;
  payload: PageBriefArtifactPayload;
  qualityGates: ArtifactQualityGates;
  deliveryReadiness: ArtifactDeliveryReadiness;
  riskFlags: string[];
  missingContext: string[];
  generatedFrom: Record<string, string | number | boolean | null>;
  createdAt: string;
  updatedAt: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToArtifact(row: any): SerializableArtifact {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    masterplanItemId: row.masterplan_item_id as string,
    growthGoalId: (row.growth_goal_id as string | null) ?? null,
    artifactType: row.artifact_type as string,
    status: row.status as ArtifactStatus,
    payload: row.payload as PageBriefArtifactPayload,
    qualityGates: (row.quality_gates ?? {}) as ArtifactQualityGates,
    deliveryReadiness: (row.delivery_readiness ?? {}) as ArtifactDeliveryReadiness,
    riskFlags: Array.isArray(row.risk_flags) ? (row.risk_flags as string[]) : [],
    missingContext: Array.isArray(row.missing_context) ? (row.missing_context as string[]) : [],
    generatedFrom: (row.generated_from ?? {}) as Record<string, string | number | boolean | null>,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ------------------------------------------------------------------
// 1. Generate page brief
// ------------------------------------------------------------------

export const generatePageBriefArtifactFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GeneratePageBriefInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    // Verify item exists and belongs to tenant
    const { data: itemRow, error: iErr } = await admin
      .from("masterplan_items")
      .select("id, type, title, metadata")
      .eq("id", data.masterplanItemId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (iErr) throw iErr;
    if (!itemRow) throw new Error("Masterplan item not found");

    const itemType = itemRow.type as string;
    if (itemType !== "service_page" && itemType !== "location_page") {
      return {
        ok: false as const,
        reason: "wrong_type" as const,
        message: `page_brief is only supported for service_page and location_page items. This item is type "${itemType}".`,
      };
    }

    // Run quality gates
    const gateResult = await checkPageBriefGates({
      tenantId: data.tenantId,
      masterplanItemType: itemType,
    });

    if (!gateResult.passed) {
      return {
        ok: false as const,
        reason: "gates_failed" as const,
        message: gateResult.blockerMessage ?? "Quality gates failed",
        gateFailureReasons: gateResult.gates.gateFailureReasons,
      };
    }

    // Check WP delivery readiness (informational — does not block generation)
    const delivery = await checkWordpressDeliveryReadiness({
      tenantId: data.tenantId,
      masterplanItemId: data.masterplanItemId,
    });

    // Generate
    const result = await generatePageBriefArtifact(
      data.tenantId,
      data.masterplanItemId,
      gateResult.gates,
      delivery,
    );

    // Load linked goal id
    const meta = (itemRow.metadata ?? {}) as Record<string, unknown>;
    const linkedGoalId = typeof meta.linkedGoalId === "string" ? meta.linkedGoalId : null;
    const { data: goalRow } = await admin
      .from("growth_goals")
      .select("id")
      .eq("tenant_id", data.tenantId)
      .eq("status", "active")
      .maybeSingle();

    const artifactStatus: ArtifactStatus = result.usedFallback ? "draft" : "needs_review";

    const insertRow = {
      tenant_id: data.tenantId,
      masterplan_item_id: data.masterplanItemId,
      growth_goal_id: linkedGoalId ?? goalRow?.id ?? null,
      artifact_type: "page_brief",
      status: artifactStatus,
      payload: result.payload as unknown as Json,
      quality_gates: result.qualityGates as unknown as Json,
      delivery_readiness: result.deliveryReadiness as unknown as Json,
      risk_flags: result.riskFlags as unknown as Json,
      missing_context: result.missingContext as unknown as Json,
      generated_from: result.generatedFrom as unknown as Json,
    };

    const { data: created, error: insErr } = await admin
      .from("execution_artifacts")
      .insert(insertRow)
      .select("*")
      .single();
    if (insErr) throw insErr;

    return {
      ok: true as const,
      artifact: rowToArtifact(created),
      usedFallback: result.usedFallback,
      modelUsed: result.modelUsed,
    };
  });

// ------------------------------------------------------------------
// 2. List artifacts for a masterplan item
// ------------------------------------------------------------------

export const listExecutionArtifactsForItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        tenantId: z.string().uuid(),
        masterplanItemId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    const { data: rows, error } = await supabase
      .from("execution_artifacts")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .eq("masterplan_item_id", data.masterplanItemId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return { artifacts: (rows ?? []).map(rowToArtifact) };
  });

// ------------------------------------------------------------------
// 3. Get single artifact
// ------------------------------------------------------------------

export const getExecutionArtifact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ tenantId: z.string().uuid(), artifactId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    const { data: row, error } = await supabase
      .from("execution_artifacts")
      .select("*")
      .eq("id", data.artifactId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Artifact not found");

    return { artifact: rowToArtifact(row) };
  });

// ------------------------------------------------------------------
// 4. Update artifact status (operator review)
// ------------------------------------------------------------------

export const updateExecutionArtifactStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateExecutionArtifactStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    // Verify it belongs to this tenant
    const { data: existing, error: fErr } = await supabase
      .from("execution_artifacts")
      .select("id, status")
      .eq("id", data.artifactId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (fErr) throw fErr;
    if (!existing) throw new Error("Artifact not found");

    const { error: uErr } = await admin
      .from("execution_artifacts")
      .update({ status: data.status })
      .eq("id", data.artifactId);
    if (uErr) throw uErr;

    return { artifactId: data.artifactId, status: data.status };
  });

// ------------------------------------------------------------------
// 5. List latest artifact per masterplan item (for board view)
// ------------------------------------------------------------------

export const listLatestArtifactsForPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ tenantId: z.string().uuid(), masterPlanId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    // Get all item IDs for this plan
    const { data: items } = await supabase
      .from("masterplan_items")
      .select("id")
      .eq("tenant_id", data.tenantId)
      .eq("master_plan_id", data.masterPlanId);

    if (!items || items.length === 0) return { latestByItem: {} as Record<string, SerializableArtifact> };

    const itemIds = items.map((i: { id: string }) => i.id);

    const { data: rows, error } = await supabase
      .from("execution_artifacts")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .in("masterplan_item_id", itemIds)
      .order("created_at", { ascending: false });
    if (error) throw error;

    // Keep latest per item
    const latestByItem: Record<string, SerializableArtifact> = {};
    for (const row of (rows ?? [])) {
      const itemId = row.masterplan_item_id as string;
      if (!latestByItem[itemId]) {
        latestByItem[itemId] = rowToArtifact(row);
      }
    }

    return { latestByItem };
  });
