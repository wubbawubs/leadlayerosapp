/**
 * QA Compare V1 — server functions.
 * Pairs Proposal V1 vs Proposal V2 per audit issue and records
 * operator feedback (winner + reason tags + score mismatch).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

// V2 action_type -> V1 proposal_type aliases.
const V2_TO_V1: Record<string, string[]> = {
  rewrite_meta_description: ["meta_description"],
  rewrite_title: ["title"],
  rewrite_h1: ["h1"],
  write_alt_text: ["alt_text"],
  propose_schema: ["schema"],
};

const WINNERS = ["unreviewed", "v1", "v2", "both_bad", "both_good", "needs_edit"] as const;

export const REASON_TAGS = [
  "better_tone",
  "better_seo",
  "better_business_fit",
  "better_page_fit",
  "safer_claims",
  "better_length",
  "less_generic",
  "better_cta",
  "better_alt_text",
  "v2_score_too_low",
  "v2_score_too_high",
  "v1_more_natural",
  "both_too_generic",
  "needs_manual_copy",
  "missing_context",
  "other",
] as const;

export const buildComparisonSetForAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { auditId: string; v2RunId?: string; forceRefresh?: boolean }) =>
    z
      .object({
        auditId: z.string().uuid(),
        v2RunId: z.string().uuid().optional(),
        forceRefresh: z.boolean().optional(),
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

    // Load V2 proposals for audit (latest run or supplied run).
    const { data: v2Rows, error: v2Err } = await supabaseAdmin
      .from("proposal_v2")
      .select("id, page_id, issue_id, action_type, proposal_run_id, created_at")
      .eq("audit_id", data.auditId)
      .order("created_at", { ascending: false });
    if (v2Err) throw v2Err;
    let runId: string | null = data.v2RunId ?? null;
    if (!runId) {
      for (const r of v2Rows ?? []) {
        if (r.proposal_run_id) {
          runId = r.proposal_run_id as string;
          break;
        }
      }
    }
    const v2 = (v2Rows ?? []).filter((r) =>
      runId ? r.proposal_run_id === runId : true,
    );

    // Load V1 proposals for the audit.
    const { data: groups } = await supabaseAdmin
      .from("fix_proposal_groups")
      .select("id, audit_page_id")
      .eq("audit_id", data.auditId);
    const groupIds = (groups ?? []).map((g) => g.id as string);
    let v1Rows: Array<{
      id: string;
      audit_page_id: string | null;
      issue_code: string;
      proposal_type: string;
    }> = [];
    if (groupIds.length > 0) {
      const { data: pRows } = await supabaseAdmin
        .from("fix_proposals")
        .select("id, audit_page_id, issue_code, proposal_type, group_id")
        .in("group_id", groupIds);
      v1Rows = (pRows ?? []) as typeof v1Rows;
    }

    // Index V1 by (pageId, proposal_type) keeping highest-confidence later via order.
    const v1Index = new Map<string, string>();
    for (const r of v1Rows) {
      if (!r.audit_page_id) continue;
      const key = `${r.audit_page_id}::${r.proposal_type}`;
      if (!v1Index.has(key)) v1Index.set(key, r.id);
    }

    // Existing comparisons to avoid duplicate unreviewed rows / preserve reviewed ones.
    const { data: existing } = await supabaseAdmin
      .from("proposal_comparisons")
      .select("id, page_id, issue_id, winner")
      .eq("audit_id", data.auditId)
      .eq("tenant_id", audit.tenant_id);
    const existingMap = new Map<string, { id: string; winner: string }>();
    for (const e of existing ?? []) {
      existingMap.set(`${e.page_id}::${e.issue_id}`, {
        id: e.id as string,
        winner: e.winner as string,
      });
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const r of v2) {
      const actionType = r.action_type as string;
      const pageId = r.page_id as string;
      const issueId = r.issue_id as string;
      const v1Aliases = V2_TO_V1[actionType] ?? [];
      let v1Id: string | null = null;
      for (const alias of v1Aliases) {
        const k = `${pageId}::${alias}`;
        const found = v1Index.get(k);
        if (found) {
          v1Id = found;
          break;
        }
      }

      const key = `${pageId}::${issueId}`;
      const ex = existingMap.get(key);
      if (ex) {
        if (ex.winner !== "unreviewed" && !data.forceRefresh) {
          skipped++;
          continue;
        }
        const { error: uErr } = await supabaseAdmin
          .from("proposal_comparisons")
          .update({
            proposal_v1_id: v1Id,
            proposal_v2_id: r.id as string,
            action_type: actionType,
          })
          .eq("id", ex.id);
        if (uErr) throw uErr;
        updated++;
      } else {
        const { error: iErr } = await supabaseAdmin.from("proposal_comparisons").insert({
          tenant_id: audit.tenant_id,
          audit_id: data.auditId,
          page_id: pageId,
          issue_id: issueId,
          action_type: actionType,
          proposal_v1_id: v1Id,
          proposal_v2_id: r.id as string,
        });
        if (iErr) throw iErr;
        created++;
      }
    }

    return { ok: true as const, created, updated, skipped, runId, total: v2.length };
  });

export const listProposalComparisons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { auditId: string }) =>
    z.object({ auditId: z.string().uuid() }).parse(input),
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

    const { data: comps, error: cErr } = await supabaseAdmin
      .from("proposal_comparisons")
      .select(
        "id, page_id, issue_id, action_type, proposal_v1_id, proposal_v2_id, winner, reason, reason_tags, score_mismatch, notes, reviewed_at, created_at, updated_at",
      )
      .eq("audit_id", data.auditId)
      .eq("tenant_id", audit.tenant_id)
      .order("created_at", { ascending: true });
    if (cErr) throw cErr;
    const rows = comps ?? [];

    const v1Ids = rows.map((r) => r.proposal_v1_id).filter(Boolean) as string[];
    const v2Ids = rows.map((r) => r.proposal_v2_id).filter(Boolean) as string[];
    const pageIds = Array.from(new Set(rows.map((r) => r.page_id as string)));

    const [v1Resp, v2Resp, pagesResp] = await Promise.all([
      v1Ids.length
        ? supabaseAdmin
            .from("fix_proposals")
            .select("id, issue_code, proposal_type, before, after, rationale, confidence, status")
            .in("id", v1Ids)
        : Promise.resolve({ data: [], error: null }),
      v2Ids.length
        ? supabaseAdmin
            .from("proposal_v2")
            .select(
              "id, action_type, status, title, summary, reasoning, before, after, scores, risk_flags, context_used, keywords_used, publishable, model_used, block_reason, proposal_run_id, created_at",
            )
            .in("id", v2Ids)
        : Promise.resolve({ data: [], error: null }),
      pageIds.length
        ? supabaseAdmin.from("audit_pages").select("id, url, issues").in("id", pageIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const v1Map = new Map<string, (typeof v1Resp.data extends Array<infer T> ? T : never)>();
    for (const r of v1Resp.data ?? []) v1Map.set((r as { id: string }).id, r as never);
    const v2Map = new Map<string, (typeof v2Resp.data extends Array<infer T> ? T : never)>();
    for (const r of v2Resp.data ?? []) v2Map.set((r as { id: string }).id, r as never);
    const pageMap = new Map<
      string,
      { url: string; issues: Array<{ code?: string; message?: string }> }
    >();
    for (const p of pagesResp.data ?? []) {
      const issues = Array.isArray((p as { issues?: unknown }).issues)
        ? ((p as { issues: unknown[] }).issues as Array<{ code?: string; message?: string }>)
        : [];
      pageMap.set((p as { id: string }).id, {
        url: (p as { url: string }).url,
        issues,
      });
    }

    const items = rows.map((r) => {
      const v1 = r.proposal_v1_id ? v1Map.get(r.proposal_v1_id as string) : null;
      const v2 = r.proposal_v2_id ? v2Map.get(r.proposal_v2_id as string) : null;
      const page = pageMap.get(r.page_id as string);
      // Extract just the code part of issue_id (`${pageId}:${code}`) for matching page issues.
      const issueCode = String(r.issue_id).split(":").slice(1).join(":") || String(r.issue_id);
      const issueMeta = page?.issues.find((i) => i.code === issueCode) ?? null;

      return {
        id: r.id as string,
        pageId: r.page_id as string,
        pageUrl: page?.url ?? null,
        issueId: r.issue_id as string,
        issueCode,
        issueMessage: issueMeta?.message ?? null,
        actionType: (r.action_type as string) ?? "",
        winner: r.winner as string,
        reason: (r.reason as string) ?? "",
        reasonTags: (r.reason_tags as string[]) ?? [],
        scoreMismatch: !!r.score_mismatch,
        notes: (r.notes as string) ?? "",
        reviewedAt: r.reviewed_at as string | null,
        v1: v1
          ? {
              id: (v1 as { id: string }).id,
              proposalType: (v1 as { proposal_type: string }).proposal_type,
              issueCode: (v1 as { issue_code: string }).issue_code,
              beforeJson: JSON.stringify((v1 as { before: unknown }).before ?? {}),
              afterJson: JSON.stringify((v1 as { after: unknown }).after ?? {}),
              rationale: (v1 as { rationale: string }).rationale ?? "",
              confidence: Number((v1 as { confidence: number }).confidence ?? 0),
              status: (v1 as { status: string }).status ?? "",
            }
          : null,
        v2: v2
          ? {
              id: (v2 as { id: string }).id,
              actionType: (v2 as { action_type: string }).action_type,
              status: (v2 as { status: string }).status,
              title: (v2 as { title: string }).title,
              summary: (v2 as { summary: string }).summary,
              reasoning: (v2 as { reasoning: string }).reasoning,
              beforeJson: JSON.stringify((v2 as { before: unknown }).before ?? {}),
              afterJson: JSON.stringify((v2 as { after: unknown }).after ?? {}),
              scoresJson: JSON.stringify((v2 as { scores: unknown }).scores ?? {}),
              riskFlags: ((v2 as { risk_flags: unknown }).risk_flags as string[]) ?? [],
              contextUsedJson: JSON.stringify((v2 as { context_used: unknown }).context_used ?? {}),
              keywordsUsed: ((v2 as { keywords_used: unknown }).keywords_used as string[]) ?? [],
              publishable: !!(v2 as { publishable: boolean }).publishable,
              modelUsed: ((v2 as { model_used: string }).model_used as string) ?? "",
              blockReason: ((v2 as { block_reason: string | null }).block_reason as string | null) ?? null,
              runId: ((v2 as { proposal_run_id: string | null }).proposal_run_id as string | null) ?? null,
            }
          : null,
      };
    });

    // Summary metrics.
    const total = items.length;
    const reviewed = items.filter((i) => i.winner !== "unreviewed").length;
    const v1Wins = items.filter((i) => i.winner === "v1").length;
    const v2Wins = items.filter((i) => i.winner === "v2").length;
    const bothBad = items.filter((i) => i.winner === "both_bad").length;
    const bothGood = items.filter((i) => i.winner === "both_good").length;
    const needsEdit = items.filter((i) => i.winner === "needs_edit").length;
    const scoreMismatches = items.filter((i) => i.scoreMismatch).length;

    // V2 average weighted score (parses scoresJson, falls back to NaN-safe avg).
    let weightedSum = 0;
    let weightedCount = 0;
    const winRateByAction: Record<string, { wins: number; reviewed: number }> = {};
    for (const it of items) {
      if (it.v2) {
        try {
          const s = JSON.parse(it.v2.scoresJson) as { weighted?: number };
          if (typeof s.weighted === "number" && Number.isFinite(s.weighted)) {
            weightedSum += s.weighted;
            weightedCount++;
          }
        } catch {
          // ignore parse errors
        }
      }
      if (it.winner !== "unreviewed") {
        const k = it.actionType || "unknown";
        const cur = winRateByAction[k] ?? { wins: 0, reviewed: 0 };
        cur.reviewed += 1;
        if (it.winner === "v2") cur.wins += 1;
        winRateByAction[k] = cur;
      }
    }
    const v2AverageWeighted = weightedCount > 0 ? weightedSum / weightedCount : null;

    return {
      items,
      summary: {
        total,
        reviewed,
        v1Wins,
        v2Wins,
        bothBad,
        bothGood,
        needsEdit,
        scoreMismatches,
        v2WinRate: reviewed > 0 ? v2Wins / reviewed : 0,
        v1WinRate: reviewed > 0 ? v1Wins / reviewed : 0,
        v2AverageWeighted,
        winRateByAction,
      },
    };
  });

export const updateProposalComparison = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      comparisonId: string;
      winner: (typeof WINNERS)[number];
      reasonTags?: string[];
      notes?: string;
      scoreMismatch?: boolean;
      reason?: string;
    }) =>
      z
        .object({
          comparisonId: z.string().uuid(),
          winner: z.enum(WINNERS),
          reasonTags: z.array(z.string().min(1).max(64)).max(20).optional(),
          notes: z.string().max(4000).optional(),
          scoreMismatch: z.boolean().optional(),
          reason: z.string().max(500).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Fetch row to verify tenant.
    const { data: row, error } = await supabaseAdmin
      .from("proposal_comparisons")
      .select("id, tenant_id")
      .eq("id", data.comparisonId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Comparison not found");
    await assertMember(supabase, userId, row.tenant_id as string);

    const reviewed = data.winner !== "unreviewed";
    const update = {
      winner: data.winner,
      reviewed_at: reviewed ? new Date().toISOString() : null,
      reviewed_by: reviewed ? userId : null,
      ...(data.reasonTags !== undefined ? { reason_tags: data.reasonTags } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.scoreMismatch !== undefined ? { score_mismatch: data.scoreMismatch } : {}),
      ...(data.reason !== undefined ? { reason: data.reason } : {}),
    };

    const { error: uErr } = await supabaseAdmin
      .from("proposal_comparisons")
      .update(update)
      .eq("id", data.comparisonId);
    if (uErr) throw uErr;
    return { ok: true as const };
  });
