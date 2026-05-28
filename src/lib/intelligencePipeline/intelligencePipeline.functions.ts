/**
 * Intelligence Pipeline Orchestrator V1 — server functions.
 *
 * Auth: every fn validates operator/owner role before touching the engine.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  advanceIntelligenceRun,
  getLatestIntelligenceRun,
  listIntelligenceRunsAdmin,
  startIntelligenceRun,
} from "./intelligencePipeline.server";

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
  return data.role as string;
}

function assertOperator(role: string) {
  if (role !== "owner" && role !== "operator") {
    throw new Error("Forbidden: requires operator or owner role");
  }
}

export const startIntelligenceRunFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tenantId: z.string().uuid(),
        siteId: z.string().uuid().nullable().optional(),
        growthGoalId: z.string().uuid().nullable().optional(),
        triggeredBy: z
          .enum(["auto", "operator", "system", "scheduled"])
          .optional(),
        triggerReason: z.string().max(500).nullable().optional(),
        autoAdvance: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await assertMember(supabase, userId, data.tenantId);
    assertOperator(role);
    const run = await startIntelligenceRun({
      tenantId: data.tenantId,
      siteId: data.siteId ?? null,
      growthGoalId: data.growthGoalId ?? null,
      triggeredBy: data.triggeredBy ?? "operator",
      triggerReason: data.triggerReason ?? null,
    });
    if (data.autoAdvance !== false) {
      return {
        run: await advanceIntelligenceRun({
          tenantId: data.tenantId,
          intelligenceRunId: run.id,
        }),
      };
    }
    return { run };
  });

export const advanceIntelligenceRunFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tenantId: z.string().uuid(),
        intelligenceRunId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await assertMember(supabase, userId, data.tenantId);
    assertOperator(role);
    const run = await advanceIntelligenceRun({
      tenantId: data.tenantId,
      intelligenceRunId: data.intelligenceRunId,
    });
    return { run };
  });

export const getLatestIntelligenceRunFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tenantId: z.string().uuid(),
        siteId: z.string().uuid().nullable().optional(),
        growthGoalId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);
    const run = await getLatestIntelligenceRun({
      tenantId: data.tenantId,
      siteId: data.siteId ?? null,
      growthGoalId: data.growthGoalId ?? null,
    });
    return { run };
  });

export const listIntelligenceRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tenantId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);
    const runs = await listIntelligenceRunsAdmin(data.tenantId, data.limit ?? 10);
    return { runs };
  });
