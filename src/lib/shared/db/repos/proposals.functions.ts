/**
 * SEO Proposal repo — server functions to generate, list, and decide proposals.
 * Never writes to WordPress.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateProposalsForAudit } from "@/lib/shared/proposals/generator.server";

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

export const generateProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { auditId: string }) =>
    z.object({ auditId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: audit, error } = await supabase
      .from("audits")
      .select("id, tenant_id, status")
      .eq("id", data.auditId)
      .maybeSingle();
    if (error) throw error;
    if (!audit) throw new Error("Audit not found");
    await assertOperator(supabase, userId, audit.tenant_id);
    if (audit.status !== "succeeded") {
      throw new Error("Audit is not finished");
    }

    const stats = await generateProposalsForAudit(data.auditId);
    return stats;
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
    let proposals: Array<{
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
    }> = [];
    if (groupIds.length > 0) {
      const { data: pRows, error: pErr } = await supabase
        .from("fix_proposals")
        .select(
          "id, group_id, audit_page_id, issue_code, proposal_type, before, after, rationale, confidence, status",
        )
        .in("group_id", groupIds)
        .order("confidence", { ascending: false });
      if (pErr) throw pErr;
      proposals = pRows ?? [];
    }

    // Page URL lookup
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

    return { groups: groups ?? [], proposals, pageMap };
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
      .select("id, tenant_id")
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
    return { ok: true };
  });
