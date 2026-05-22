/**
 * Proposal V2 — server functions (V2.2).
 * - Per-batch proposalRunId
 * - latestRunOnly filter
 * - Returns runId + blockReason for the UI
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runProposalV2 } from "./orchestrator.server";

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

function newRunId(): string {
  return crypto.randomUUID();
}

export const generateProposalV2ForIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { auditId: string; pageId: string; issueId: string }) =>
    z
      .object({
        auditId: z.string().uuid(),
        pageId: z.string().uuid(),
        issueId: z.string().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: audit, error } = await supabase
      .from("audits")
      .select("id, tenant_id")
      .eq("id", data.auditId)
      .maybeSingle();
    if (error) throw error;
    if (!audit) throw new Error("Audit not found");
    await assertMember(supabase, userId, audit.tenant_id);

    const proposalRunId = newRunId();
    const result = await runProposalV2({
      tenantId: audit.tenant_id,
      auditId: data.auditId,
      pageId: data.pageId,
      issueId: data.issueId,
      proposalRunId,
    });
    return { ok: true as const, proposal: result, proposalRunId };
  });

export const generateProposalV2ForAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { auditId: string; limit?: number }) =>
    z.object({ auditId: z.string().uuid(), limit: z.number().min(1).max(100).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: audit, error } = await supabase
      .from("audits")
      .select("id, tenant_id")
      .eq("id", data.auditId)
      .maybeSingle();
    if (error) throw error;
    if (!audit) throw new Error("Audit not found");
    await assertMember(supabase, userId, audit.tenant_id);

    const { data: pages, error: pErr } = await supabase
      .from("audit_pages")
      .select("id, url, issues")
      .eq("audit_id", data.auditId);
    if (pErr) throw pErr;

    type Job = { pageId: string; issueCode: string };
    const jobs: Job[] = [];
    for (const p of pages ?? []) {
      const issues = Array.isArray(p.issues) ? (p.issues as Array<{ code?: string }>) : [];
      for (const i of issues) {
        if (i?.code) jobs.push({ pageId: p.id as string, issueCode: i.code });
      }
    }
    const limit = data.limit ?? 12;
    const slice = jobs.slice(0, limit);

    const proposalRunId = newRunId();
    let generated = 0;
    const failures: Array<{ pageId: string; issueCode: string; error: string }> = [];
    for (const j of slice) {
      try {
        await runProposalV2({
          tenantId: audit.tenant_id,
          auditId: data.auditId,
          pageId: j.pageId,
          issueId: `${j.pageId}:${j.issueCode}`,
          proposalRunId,
        });
        generated++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[proposalV2] failed", j.pageId, j.issueCode, msg);
        failures.push({ pageId: j.pageId, issueCode: j.issueCode, error: msg });
      }
    }
    return { ok: true as const, attempted: slice.length, generated, failures, proposalRunId };
  });

export const listProposalV2ForAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { auditId: string; latestRunOnly?: boolean }) =>
    z
      .object({
        auditId: z.string().uuid(),
        latestRunOnly: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: audit, error } = await supabase
      .from("audits")
      .select("id, tenant_id")
      .eq("id", data.auditId)
      .maybeSingle();
    if (error) throw error;
    if (!audit) throw new Error("Audit not found");
    await assertMember(supabase, userId, audit.tenant_id);

    const { data: rows, error: lErr } = await supabaseAdmin
      .from("proposal_v2")
      .select(
        "id, page_id, issue_id, action_type, status, title, summary, reasoning, before, after, scores, context_used, keywords_used, risk_flags, publishable, model_used, created_at, proposal_run_id, block_reason",
      )
      .eq("audit_id", data.auditId)
      .order("created_at", { ascending: false });
    if (lErr) throw lErr;

    // Determine runs (ordered by most recent created_at within each run).
    const runs = new Map<string, string>(); // runId -> first-seen created_at (which is newest because of DESC sort)
    for (const r of rows ?? []) {
      const runId = (r.proposal_run_id as string | null) ?? "legacy";
      if (!runs.has(runId)) runs.set(runId, r.created_at as string);
    }
    const runSummaries = Array.from(runs.entries()).map(([runId, createdAt]) => ({
      runId,
      createdAt,
    }));
    const latestRunId = runSummaries[0]?.runId ?? null;

    const latestOnly = data.latestRunOnly !== false; // default true
    const filteredRows = latestOnly && latestRunId
      ? (rows ?? []).filter((r) => ((r.proposal_run_id as string | null) ?? "legacy") === latestRunId)
      : (rows ?? []);

    const pageIds = Array.from(new Set(filteredRows.map((r) => r.page_id as string)));
    let pageMap: Record<string, string> = {};
    if (pageIds.length > 0) {
      const { data: pages } = await supabaseAdmin
        .from("audit_pages")
        .select("id, url")
        .in("id", pageIds);
      pageMap = Object.fromEntries((pages ?? []).map((p) => [p.id as string, p.url as string]));
    }

    const serializable = filteredRows.map((r) => ({
      id: r.id as string,
      pageId: r.page_id as string,
      pageUrl: pageMap[r.page_id as string] ?? null,
      issueId: r.issue_id as string,
      actionType: r.action_type as string,
      status: r.status as string,
      title: r.title as string,
      summary: r.summary as string,
      reasoning: r.reasoning as string,
      beforeJson: JSON.stringify(r.before ?? {}),
      afterJson: JSON.stringify(r.after ?? {}),
      scoresJson: JSON.stringify(r.scores ?? {}),
      contextUsedJson: JSON.stringify(r.context_used ?? {}),
      keywordsUsed: (r.keywords_used ?? []) as string[],
      riskFlags: (r.risk_flags ?? []) as string[],
      publishable: !!r.publishable,
      modelUsed: (r.model_used as string) ?? "",
      createdAt: r.created_at as string,
      proposalRunId: (r.proposal_run_id as string | null) ?? null,
      blockReason: (r.block_reason as string | null) ?? null,
    }));

    return {
      proposals: serializable,
      runs: runSummaries,
      latestRunId,
      latestRunOnly: latestOnly,
    };
  });
