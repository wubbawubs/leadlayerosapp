/**
 * Proposal V2 — orchestrator: GrowthContext → generator → evaluator → persist.
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
}

export interface PersistedProposalV2 {
  id: string;
  status: string;
  actionType: string;
  pageId: string;
  issueId: string;
}

function contextUsed(ctx: GrowthContext) {
  return {
    toneProfile: !!ctx.tone,
    businessProfile: !!ctx.business,
    pageIntelligence: !!ctx.page,
    primaryAngle: ctx.instructions.primaryAngle || undefined,
    claimGuardrails:
      (ctx.guardrails.allowedClaims.length + ctx.guardrails.forbiddenClaims.length) > 0,
  };
}

export async function runProposalV2(input: RunInput): Promise<PersistedProposalV2> {
  const ctx = await buildGrowthContext(input);

  // If blocked/needs_context, still persist a stub proposal so the UI shows it.
  if (ctx.readiness.status === "blocked") {
    const stub = await persistStub(ctx, "rejected", "Blocked by readiness", ["readiness:blocked"]);
    return stub;
  }
  if (ctx.readiness.status === "needs_context") {
    const stub = await persistStub(
      ctx,
      "needs_context",
      "Missing context — please complete Business/Tone/Page intelligence",
      ["readiness:needs_context"],
    );
    return stub;
  }

  const gen = await runActionGenerator(ctx);
  const evald = evaluateProposalV2(ctx, gen.output);

  const row = {
    tenant_id: ctx.tenantId,
    audit_id: ctx.auditId,
    page_id: ctx.pageId,
    issue_id: ctx.issueId,
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
    risk_flags: evald.riskFlags as never,
    context_snapshot: ctx as never,
    publishable: evald.publishable,
    model_used: gen.modelUsed,
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
  status: "rejected" | "needs_context",
  summary: string,
  riskFlags: string[],
): Promise<PersistedProposalV2> {
  const { data, error } = await supabaseAdmin
    .from("proposal_v2")
    .insert({
      tenant_id: ctx.tenantId,
      audit_id: ctx.auditId,
      page_id: ctx.pageId,
      issue_id: ctx.issueId,
      action_type: ctx.action.actionType,
      status,
      title: `${ctx.action.actionType} (${status})`,
      summary,
      reasoning: `Readiness ${ctx.readiness.score}/10 — missing: ${ctx.readiness.missing.join(", ") || "n/a"}`,
      before: { value: ctx.issue.currentValue ?? null } as never,
      after: {} as never,
      scores: {} as never,
      context_used: contextUsed(ctx) as never,
      keywords_used: [] as never,
      risk_flags: riskFlags as never,
      context_snapshot: ctx as never,
      publishable: false,
      model_used: "n/a",
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
