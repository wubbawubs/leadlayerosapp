/**
 * Product Flow Orchestration V1 — server function.
 *
 * Builds the GrowthIntelligenceSnapshot and resolves the derived
 * ProductFlowState. Serialized for transport.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildGrowthIntelligenceSnapshot } from "@/lib/growthIntelligence/buildGrowthIntelligenceSnapshot.server";
import { resolveProductFlowState } from "@/lib/shared/productFlow/resolve";

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

export const getProductFlowState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      tenantId: string;
      growthGoalId?: string | null;
      siteId?: string | null;
    }) =>
      z
        .object({
          tenantId: z.string().uuid(),
          growthGoalId: z.string().uuid().nullable().optional(),
          siteId: z.string().uuid().nullable().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);
    const snapshot = await buildGrowthIntelligenceSnapshot({
      tenantId: data.tenantId,
      growthGoalId: data.growthGoalId ?? null,
      siteId: data.siteId ?? null,
    });
    const flow = resolveProductFlowState(snapshot);
    return { flowJson: JSON.stringify(flow) };
  });
