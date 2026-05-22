/**
 * Proposal V2 — orchestrator (V2.2).
 * - Groups proposals by proposal_run_id (caller passes one per batch).
 * - Action-aware block_reason instead of generic "Blocked by readiness".
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildGrowthContext } from "@/lib/shared/growthContext/builder.server";
import type { GrowthContext } from "@/lib/shared/growthContext/schemas";
import { runActionGenerator } from "./generator.server";
import { evaluateProposalV2 } from "./evaluator.server";

interface RunInput {
  tenantId: string;
  auditId: string;
  pageId: string;
  issueId: string;
  proposalRunId: string;
}

export interface PersistedProposalV2 {
  id: string;
  status: string;
  actionType: string;
  pageId: string;
  issueId: string;
}

function contextUsed(ctx: GrowthContext) {
  // businessProfile=true ONLY when the BP was actually hydrated into ctx.business
  // with at least one usable section. A bare row with no usable fields is NOT
  // counted as "business profile used" — that would mislead the evaluator.
  const diag = ctx.diagnostics;
  const businessHydrated = diag
    ? diag.businessHydrated
    : !!ctx.business && Object.keys(ctx.business.identity ?? {}).length > 0;
  return {
    toneProfile: !!ctx.tone,
    businessProfile: businessHydrated,
    pageIntelligence: !!ctx.page,
    primaryAngle: ctx.instructions.primaryAngle || undefined,
    claimGuardrails:
      (ctx.guardrails.allowedClaims.length + ctx.guardrails.forbiddenClaims.length) > 0,
  };
}

function describeBlockReason(ctx: GrowthContext): string {
  const missing = ctx.readiness.missing ?? [];
  const action = ctx.action.actionType;
  if (action === "propose_schema") {
    const proof = (ctx.business?.proof as { verifiedProofPoints?: unknown[] } | undefined)
      ?.verifiedProofPoints;
    if (!Array.isArray(proof) || proof.length === 0) {
      return "Schema proposal blocked: verified business proof points are missing.";
    }
    return "Schema proposal blocked: required verified business fields are missing.";
  }
  if (missing.length > 0) {
    return `Blocked by missing context: ${missing.join(", ")}.`;
  }
  return "Blocked by readiness guardrails.";
}

function describeNeedsContext(ctx: GrowthContext): string {
  const missing = ctx.readiness.missing ?? [];
  if (missing.length > 0) {
    return `Missing context: ${missing.join(", ")}. Complete these to enable a full proposal.`;
  }
  return "Missing context — please complete Business/Tone/Page intelligence.";
}

export async function runProposalV2(input: RunInput): Promise<PersistedProposalV2> {
  const ctx = await buildGrowthContext(input);

  if (ctx.readiness.status === "blocked") {
    const reason = describeBlockReason(ctx);
    return persistStub(ctx, input.proposalRunId, "rejected", reason, ["readiness:blocked"], reason);
  }
  if (ctx.readiness.status === "needs_context") {
    const reason = describeNeedsContext(ctx);
    return persistStub(
      ctx,
      input.proposalRunId,
      "needs_context",
      reason,
      ["readiness:needs_context"],
      reason,
    );
  }

  const gen = await runActionGenerator(ctx);
  const evald = evaluateProposalV2(ctx, gen.output);

  const extraFlags = [
    ...(gen.bannedPhraseRetry ? ["generator:banned_phrase_retry"] : []),
    ...(gen.compactedDeterministically ? ["generator:compacted_deterministic"] : []),
  ];
  const allFlags = Array.from(new Set([...evald.riskFlags, ...extraFlags]));

  const row = {
    tenant_id: ctx.tenantId,
    audit_id: ctx.auditId,
    page_id: ctx.pageId,
    issue_id: ctx.issueId,
    proposal_run_id: input.proposalRunId,
    action_type: ctx.action.actionType,
    status: evald.status,
    title: gen.output.title,
    summary: gen.output.summary,
    reasoning: gen.output.reasoning,
    before: { value: ctx.issue.currentValue ?? null, field: ctx.issue.targetField } as never,
    after: gen.output.after as never,
    scores: { ...evald.scores, weighted: evald.weighted } as never,
    context_used: contextUsed(ctx) as never,
    keywords_used: gen.output.keywordsUsed as never,
    risk_flags: allFlags as never,
    context_snapshot: ctx as never,
    publishable: evald.publishable,
    model_used: gen.modelUsed,
    block_reason: null as string | null,
  };

  const { data, error } = await supabaseAdmin
    .from("proposal_v2")
    .insert(row)
    .select("id, status, action_type, page_id, issue_id")
    .single();
  if (error || !data) throw error ?? new Error("proposal_v2 insert failed");
  return {
    id: data.id as string,
    status: data.status as string,
    actionType: data.action_type as string,
    pageId: data.page_id as string,
    issueId: data.issue_id as string,
  };
}

async function persistStub(
  ctx: GrowthContext,
  proposalRunId: string,
  status: "rejected" | "needs_context",
  summary: string,
  riskFlags: string[],
  blockReason: string,
): Promise<PersistedProposalV2> {
  const { data, error } = await supabaseAdmin
    .from("proposal_v2")
    .insert({
      tenant_id: ctx.tenantId,
      audit_id: ctx.auditId,
      page_id: ctx.pageId,
      issue_id: ctx.issueId,
      proposal_run_id: proposalRunId,
      action_type: ctx.action.actionType,
      status,
      title: `${ctx.action.actionType} (${status})`,
      summary,
      reasoning: blockReason,
      before: { value: ctx.issue.currentValue ?? null } as never,
      after: {} as never,
      scores: {} as never,
      context_used: contextUsed(ctx) as never,
      keywords_used: [] as never,
      risk_flags: riskFlags as never,
      context_snapshot: ctx as never,
      publishable: false,
      model_used: "n/a",
      block_reason: blockReason,
    })
    .select("id, status, action_type, page_id, issue_id")
    .single();
  if (error || !data) throw error ?? new Error("proposal_v2 stub insert failed");
  return {
    id: data.id as string,
    status: data.status as string,
    actionType: data.action_type as string,
    pageId: data.page_id as string,
    issueId: data.issue_id as string,
  };
}
