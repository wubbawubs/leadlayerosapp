/**
 * SEO Proposal repo — server functions to generate, list, and decide proposals.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateProposalsForAuditPage } from "@/lib/shared/proposals/generator.server";

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
async function loadAuditAndAuthorize(supabase: any, userId: string, auditId: string) {
  const { data: audit, error } = await supabase
    .from("audits")
    .select("id, tenant_id, status")
    .eq("id", auditId)
    .maybeSingle();
  if (error) throw error;
  if (!audit) throw new Error("Audit not found");
  await assertOperator(supabase, userId, audit.tenant_id);
  if (audit.status !== "succeeded") throw new Error("Audit is not finished");
  return audit;
}

export const listEligibleAuditPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { auditId: string }) =>
    z.object({ auditId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await loadAuditAndAuthorize(supabase, userId, data.auditId);

    const { data: pages, error } = await supabase
      .from("audit_pages")
      .select("id, url, issues")
      .eq("audit_id", data.auditId);
    if (error) throw error;

    const eligible = (pages ?? [])
      .map((p) => ({
        id: p.id as string,
        url: p.url as string,
        issueCount: Array.isArray(p.issues) ? p.issues.length : 0,
      }))
      .filter((p) => p.issueCount > 0)
      .sort((a, b) => b.issueCount - a.issueCount);
    return { pages: eligible };
  });

export const generateProposalsForPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { auditId: string; auditPageId: string }) =>
    z
      .object({
        auditId: z.string().uuid(),
        auditPageId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await loadAuditAndAuthorize(supabase, userId, data.auditId);
    try {
      const r = await generateProposalsForAuditPage(data.auditId, data.auditPageId);
      return { ok: true as const, ...r };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[proposals] page generation failed", data.auditPageId, message);
      return { ok: false as const, error: message, proposalsCreated: 0, pageUrl: "" };
    }
  });

export const listProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { auditId: string }) =>
    z.object({ auditId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: groups, error: gErr } = await supabase
      .from("fix_proposal_groups")
      .select("id, theme, status, audit_page_id, created_at")
      .eq("audit_id", data.auditId)
      .order("created_at", { ascending: true });
    if (gErr) throw gErr;

    const groupIds = (groups ?? []).map((g) => g.id);
    type ProposalRow = {
      id: string;
      group_id: string;
      audit_page_id: string | null;
      issue_code: string;
      proposal_type: string;
      before: unknown;
      after: unknown;
      rationale: string;
      confidence: number;
      status: string;
    };
    let proposals: ProposalRow[] = [];
    if (groupIds.length > 0) {
      const { data: pRows, error: pErr } = await supabase
        .from("fix_proposals")
        .select(
          "id, group_id, audit_page_id, issue_code, proposal_type, before, after, rationale, confidence, status",
        )
        .in("group_id", groupIds);
      if (pErr) throw pErr;
      proposals = (pRows ?? []) as ProposalRow[];
    }
    proposals.sort((a, b) => b.confidence - a.confidence);

    const pageIds = Array.from(
      new Set((groups ?? []).map((g) => g.audit_page_id).filter(Boolean) as string[]),
    );
    let pageMap: Record<string, string> = {};
    if (pageIds.length > 0) {
      const { data: pages, error: apErr } = await supabase
        .from("audit_pages")
        .select("id, url")
        .in("id", pageIds);
      if (apErr) throw apErr;
      pageMap = Object.fromEntries((pages ?? []).map((p) => [p.id, p.url]));
    }

    const serializable = proposals.map((p) => ({
      ...p,
      before: JSON.stringify(p.before ?? {}),
      after: JSON.stringify(p.after ?? {}),
    }));
    return { groups: groups ?? [], proposals: serializable, pageMap };
  });

export const decideProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { proposalId: string; decision: "approved" | "rejected" }) =>
    z
      .object({
        proposalId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prop, error } = await supabase
      .from("fix_proposals")
      .select("id, tenant_id, after, rationale")
      .eq("id", data.proposalId)
      .maybeSingle();
    if (error) throw error;
    if (!prop) throw new Error("Proposal not found");
    await assertOperator(supabase, userId, prop.tenant_id);

    const { error: uErr } = await supabaseAdmin
      .from("fix_proposals")
      .update({
        status: data.decision,
        decided_at: new Date().toISOString(),
        decided_by: userId,
      })
      .eq("id", data.proposalId);
    if (uErr) throw uErr;

    // Capture feedback for tone profile learning loop
    const { data: tp } = await supabaseAdmin
      .from("tone_profiles")
      .select("id")
      .eq("tenant_id", prop.tenant_id)
      .maybeSingle();
    const afterText =
      typeof (prop.after as { text?: string })?.text === "string"
        ? (prop.after as { text: string }).text
        : JSON.stringify(prop.after ?? {}).slice(0, 400);
    await supabaseAdmin.from("tone_feedback_examples").insert({
      tenant_id: prop.tenant_id,
      tone_profile_id: tp?.id ?? null,
      example_type: data.decision === "approved" ? "approved" : "rejected",
      after_text: afterText,
      reason: prop.rationale ?? null,
      proposal_id: data.proposalId,
    });
    return { ok: true };
  });
