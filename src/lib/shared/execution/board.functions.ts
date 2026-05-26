/**
 * Sprint C — Execution Board V1.
 *
 * Composes a single viewmodel that combines:
 *   - masterplan_items
 *   - linked proposal_v2 (latest per item)
 *   - QA review status via proposal_comparisons
 *
 * No publishing. No WordPress. No mutation. Pure read/compose.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  rowToMasterplanItem,
  type MasterplanItem,
  type MasterplanItemType,
} from "@/lib/shared/masterplan/schemas";
import { isSupportedItemType } from "@/lib/shared/masterplan/proposalMapping";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

export const EXECUTION_STATUSES = [
  "planned",
  "in_qa",
  "needs_edit",
  "approved",
  "manual_task",
  "blocked",
  "done",
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export interface ExecutionBoardItem {
  masterplanItemId: string;
  title: string;
  type: MasterplanItemType;
  priority: string;
  effort: string | null;
  expectedImpact: string | null;
  itemStatus: string;
  reason: string | null;
  source: string | null;
  supportedForProposalGeneration: boolean;

  proposalId: string | null;
  proposalStatus: string | null;
  proposalRiskFlags: string[];
  proposalCreatedAt: string | null;

  qaStatus: string | null; // winner value
  qaReviewedAt: string | null;
  qaReasonTags: string[];

  executionStatus: ExecutionStatus;
  blockingReason: string | null;
  nextAction: string;
}

const UNSUPPORTED_TYPES: ReadonlySet<MasterplanItemType> = new Set([
  "tracking",
  "gbp",
  "review",
  "reporting",
]);

function mapExecutionStatus(args: {
  item: MasterplanItem;
  proposal: {
    status: string | null;
    riskFlags: string[];
  } | null;
  comparison: {
    winner: string | null;
  } | null;
}): { executionStatus: ExecutionStatus; blockingReason: string | null; nextAction: string } {
  const { item, proposal, comparison } = args;

  if (item.status === "done") {
    return { executionStatus: "done", blockingReason: null, nextAction: "Done" };
  }
  if (item.status === "skipped") {
    return { executionStatus: "done", blockingReason: null, nextAction: "Skipped" };
  }
  if (UNSUPPORTED_TYPES.has(item.type)) {
    return {
      executionStatus: "manual_task",
      blockingReason: null,
      nextAction: "Handle manually for now",
    };
  }
  if (!proposal) {
    return {
      executionStatus: "planned",
      blockingReason: null,
      nextAction: "Generate proposal",
    };
  }
  if (proposal.status === "rejected") {
    return {
      executionStatus: "blocked",
      blockingReason: "Proposal rejected by safety gate",
      nextAction: "Regenerate or handle manually",
    };
  }
  if (proposal.status === "needs_context") {
    return {
      executionStatus: "blocked",
      blockingReason: "Proposal needs more context",
      nextAction: "Enrich business/tone/page context",
    };
  }

  const winner = comparison?.winner ?? null;
  if (!winner || winner === "unreviewed") {
    return {
      executionStatus: "in_qa",
      blockingReason: null,
      nextAction: "Review proposal",
    };
  }
  if (winner === "needs_edit") {
    return {
      executionStatus: "needs_edit",
      blockingReason: null,
      nextAction: "Edit proposal",
    };
  }
  if (winner === "both_bad" || winner === "v1") {
    return {
      executionStatus: "blocked",
      blockingReason: "Proposal rejected in QA",
      nextAction: "Regenerate or handle manually",
    };
  }
  if (winner === "v2" || winner === "both_good") {
    return {
      executionStatus: "approved",
      blockingReason: null,
      nextAction: "Ready for execution (publishing TBD)",
    };
  }
  return {
    executionStatus: "in_qa",
    blockingReason: null,
    nextAction: "Review proposal",
  };
}

export const getExecutionBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; masterPlanId?: string }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        masterPlanId: z.string().uuid().optional(),
      })
      .parse(input),
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

    // 1. Resolve plan
    let planId = data.masterPlanId ?? null;
    let planRow: { id: string; status: string } | null = null;
    if (planId) {
      const { data: row } = await admin
        .from("master_plans")
        .select("id, status")
        .eq("id", planId)
        .eq("tenant_id", data.tenantId)
        .maybeSingle();
      planRow = row ?? null;
    } else {
      const { data: row } = await admin
        .from("master_plans")
        .select("id, status")
        .eq("tenant_id", data.tenantId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .maybeSingle();
      planRow = row ?? null;
      planId = row?.id ?? null;
    }

    if (!planId || !planRow) {
      return {
        plan: null,
        items: [] as ExecutionBoardItem[],
        summary: emptySummary(),
        nextAction: "Generate the masterplan",
      };
    }

    // 2. Items
    const { data: itemRows, error: iErr } = await admin
      .from("masterplan_items")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .eq("master_plan_id", planId)
      .order("created_at", { ascending: true });
    if (iErr) throw iErr;
    const items: MasterplanItem[] = (itemRows ?? []).map(rowToMasterplanItem);

    if (items.length === 0) {
      return {
        plan: { id: planId, status: planRow.status },
        items: [] as ExecutionBoardItem[],
        summary: emptySummary(),
        nextAction: "Generate masterplan items",
      };
    }

    // 3. Latest proposal per item
    const itemIds = items.map((i) => i.id);
    const { data: propRows } = await admin
      .from("proposal_v2")
      .select("id, status, risk_flags, masterplan_item_id, created_at")
      .eq("tenant_id", data.tenantId)
      .in("masterplan_item_id", itemIds)
      .order("created_at", { ascending: false });
    const latestByItem = new Map<
      string,
      { id: string; status: string; riskFlags: string[]; createdAt: string }
    >();
    for (const r of (propRows ?? []) as Array<{
      id: string;
      status: string;
      risk_flags: string[] | null;
      masterplan_item_id: string;
      created_at: string;
    }>) {
      if (latestByItem.has(r.masterplan_item_id)) continue;
      latestByItem.set(r.masterplan_item_id, {
        id: r.id,
        status: r.status,
        riskFlags: Array.isArray(r.risk_flags) ? r.risk_flags : [],
        createdAt: r.created_at,
      });
    }

    // 4. QA comparisons keyed by proposal_v2_id
    const proposalIds = [...latestByItem.values()].map((p) => p.id);
    const compByProposal = new Map<
      string,
      { winner: string | null; reviewedAt: string | null; reasonTags: string[] }
    >();
    if (proposalIds.length > 0) {
      const { data: compRows } = await admin
        .from("proposal_comparisons")
        .select("proposal_v2_id, winner, reviewed_at, reason_tags")
        .eq("tenant_id", data.tenantId)
        .in("proposal_v2_id", proposalIds);
      for (const r of (compRows ?? []) as Array<{
        proposal_v2_id: string | null;
        winner: string | null;
        reviewed_at: string | null;
        reason_tags: string[] | null;
      }>) {
        if (!r.proposal_v2_id) continue;
        compByProposal.set(r.proposal_v2_id, {
          winner: r.winner,
          reviewedAt: r.reviewed_at,
          reasonTags: Array.isArray(r.reason_tags) ? r.reason_tags : [],
        });
      }
    }

    // 5. Compose
    const board: ExecutionBoardItem[] = items.map((item) => {
      const proposal = latestByItem.get(item.id) ?? null;
      const comp = proposal ? compByProposal.get(proposal.id) ?? null : null;
      const mapped = mapExecutionStatus({
        item,
        proposal: proposal
          ? { status: proposal.status, riskFlags: proposal.riskFlags }
          : null,
        comparison: comp ? { winner: comp.winner } : null,
      });
      return {
        masterplanItemId: item.id,
        title: item.title,
        type: item.type,
        priority: item.priority,
        effort: item.effort,
        expectedImpact: item.expectedImpact,
        itemStatus: item.status,
        reason: item.reason,
        source: item.source,
        supportedForProposalGeneration: isSupportedItemType(item.type),
        proposalId: proposal?.id ?? null,
        proposalStatus: proposal?.status ?? null,
        proposalRiskFlags: proposal?.riskFlags ?? [],
        proposalCreatedAt: proposal?.createdAt ?? null,
        qaStatus: comp?.winner ?? null,
        qaReviewedAt: comp?.reviewedAt ?? null,
        qaReasonTags: comp?.reasonTags ?? [],
        executionStatus: mapped.executionStatus,
        blockingReason: mapped.blockingReason,
        nextAction: mapped.nextAction,
      };
    });

    const summary = summarize(board);
    const nextAction = pickNextAction(board);

    return {
      plan: { id: planId, status: planRow.status },
      items: board,
      summary,
      nextAction,
    };
  });

function emptySummary() {
  return {
    total: 0,
    planned: 0,
    in_qa: 0,
    needs_edit: 0,
    approved: 0,
    manual_task: 0,
    blocked: 0,
    done: 0,
  };
}

function summarize(items: ExecutionBoardItem[]) {
  const s = emptySummary();
  s.total = items.length;
  for (const it of items) {
    s[it.executionStatus] += 1;
  }
  return s;
}

function pickNextAction(items: ExecutionBoardItem[]): string {
  const order: ExecutionStatus[] = ["needs_edit", "in_qa", "planned", "blocked", "manual_task"];
  for (const s of order) {
    const hit = items.find((i) => i.executionStatus === s);
    if (hit) return `${hit.nextAction}: ${hit.title}`;
  }
  return "All items handled";
}
