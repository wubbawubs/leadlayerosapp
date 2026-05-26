/**
 * Sprint E1 — Approval / Ready-for-Publishing Gate.
 *
 * Server functions to move a proposal from `needs_review` to either
 * `ready_for_publishing` (approved) or `rejected`. Publishing (Sprint F)
 * may ONLY run on proposals with status = 'ready_for_publishing'.
 *
 * Hard rules enforced server-side:
 *  - Only operator/owner may approve.
 *  - Proposals with `block_reason` cannot be approved.
 *  - Proposals with status `needs_context` cannot be approved (input is too vague).
 *  - Proposals with hard risk flags (`input:*`, `readiness:blocked`,
 *    `generator:llm_fallback`) cannot be approved without operator override
 *    via `approveProposalWithOverride`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

const HARD_BLOCK_FLAGS = new Set([
  "input:service_too_broad",
  "input:location_too_broad",
  "input:service_missing",
  "input:location_missing",
  "readiness:blocked",
]);

const WARN_FLAGS = new Set([
  "generator:llm_fallback",
  "generator:banned_phrase_retry",
  "readiness:needs_context",
]);

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

export interface ApprovalEligibility {
  canApprove: boolean;
  requiresOverride: boolean;
  reasons: string[];
}

/** Pure function — also exported for UI badges and tests. */
export function evaluateApprovalEligibility(args: {
  status: string;
  blockReason: string | null;
  riskFlags: string[];
}): ApprovalEligibility {
  const reasons: string[] = [];
  let requiresOverride = false;

  if (args.status === "needs_context") {
    reasons.push("Proposal staat op needs_context — los eerst de input-issues op.");
  }
  if (args.status === "rejected") {
    reasons.push("Proposal is al afgewezen.");
  }
  if (args.status === "ready_for_publishing") {
    reasons.push("Proposal is al goedgekeurd.");
  }
  if (args.blockReason) {
    reasons.push(`Geblokkeerd: ${args.blockReason}`);
  }

  const hardHits = args.riskFlags.filter((f) => HARD_BLOCK_FLAGS.has(f));
  if (hardHits.length > 0) {
    reasons.push(`Harde risico-flags blokkeren approval: ${hardHits.join(", ")}`);
  }

  const warnHits = args.riskFlags.filter((f) => WARN_FLAGS.has(f));
  if (warnHits.length > 0) {
    requiresOverride = true;
    reasons.push(`Waarschuwingen — vereist override: ${warnHits.join(", ")}`);
  }

  const blockingReasons = reasons.filter(
    (r) => !r.startsWith("Waarschuwingen"),
  );
  const canApprove = blockingReasons.length === 0;

  return { canApprove, requiresOverride, reasons };
}

export const approveProposalForPublishing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; proposalId: string; notes?: string; override?: boolean }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        proposalId: z.string().uuid(),
        notes: z.string().max(2000).optional(),
        override: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const { data: row, error } = await admin
      .from("proposal_v2")
      .select("id, status, block_reason, risk_flags")
      .eq("id", data.proposalId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Proposal not found");

    const eligibility = evaluateApprovalEligibility({
      status: row.status as string,
      blockReason: (row.block_reason as string | null) ?? null,
      riskFlags: (row.risk_flags as string[] | null) ?? [],
    });

    if (!eligibility.canApprove) {
      return { ok: false as const, eligibility };
    }
    if (eligibility.requiresOverride && !data.override) {
      return { ok: false as const, eligibility, needsOverride: true };
    }

    const { error: uErr } = await admin
      .from("proposal_v2")
      .update({
        status: "ready_for_publishing",
        approved_at: new Date().toISOString(),
        approved_by: userId,
        approval_notes: data.notes ?? null,
        rejected_at: null,
        rejected_by: null,
        rejection_reason: null,
      })
      .eq("id", data.proposalId)
      .eq("tenant_id", data.tenantId);
    if (uErr) throw uErr;

    return { ok: true as const, eligibility };
  });

export const rejectProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; proposalId: string; reason: string }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        proposalId: z.string().uuid(),
        reason: z.string().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const { error } = await admin
      .from("proposal_v2")
      .update({
        status: "rejected",
        rejected_at: new Date().toISOString(),
        rejected_by: userId,
        rejection_reason: data.reason,
        approved_at: null,
        approved_by: null,
        approval_notes: null,
      })
      .eq("id", data.proposalId)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;

    return { ok: true as const };
  });

export const reopenProposalForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; proposalId: string }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        proposalId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const { error } = await admin
      .from("proposal_v2")
      .update({
        status: "needs_review",
        approved_at: null,
        approved_by: null,
        approval_notes: null,
        rejected_at: null,
        rejected_by: null,
        rejection_reason: null,
      })
      .eq("id", data.proposalId)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;

    return { ok: true as const };
  });

export const listReadyForPublishing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: member } = await sb
      .from("memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (!member) throw new Error("Forbidden: not a member of this tenant");

    const { data: rows, error } = await admin
      .from("proposal_v2")
      .select(
        "id, title, summary, action_type, origin, approved_at, approved_by, masterplan_item_id, page_id",
      )
      .eq("tenant_id", data.tenantId)
      .eq("status", "ready_for_publishing")
      .order("approved_at", { ascending: false });
    if (error) throw error;

    return { proposals: rows ?? [] };
  });
