/**
 * Stale Proposal Cleanup — Sprint E #2.
 *
 * Marks old draft / needs_review proposals as `stale` so the QA review
 * surface only shows fresh work. We never auto-stale approved, rejected,
 * or already-stale proposals.
 *
 * The `proposal_v2.status` column is free text — `stale` is treated as a
 * terminal "out of the active pipeline" state, equivalent to rejected for
 * filtering purposes. The Execution Board and QA listings should pass
 * `includeStale: false` (default) to hide them.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

const ACTIVE_STATUSES = ["draft", "ready", "needs_review", "needs_context"] as const;
const DEFAULT_STALE_AFTER_DAYS = 14;

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

export const markStaleProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; staleAfterDays?: number }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        staleAfterDays: z.number().int().min(1).max(365).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const days = data.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

    const { data: rows, error } = await admin
      .from("proposal_v2")
      .update({
        status: "stale",
        block_reason: `Auto-marked stale after ${days} days without review`,
      })
      .eq("tenant_id", data.tenantId)
      .in("status", ACTIVE_STATUSES as unknown as string[])
      .lt("updated_at", cutoff)
      .select("id");
    if (error) throw error;

    return {
      markedStale: rows?.length ?? 0,
      cutoff,
      staleAfterDays: days,
    };
  });

/**
 * Helper: hide stale proposals from listings unless explicitly requested.
 * Centralizes the filter so every read site stays consistent.
 */
export function applyStaleFilter<T extends { status?: string | null }>(
  rows: T[],
  includeStale: boolean,
): T[] {
  if (includeStale) return rows;
  return rows.filter((r) => (r.status ?? "") !== "stale");
}
