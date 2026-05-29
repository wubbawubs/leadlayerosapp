/**
 * Sprint C — Execution Board V1.
 *
 * Composes a single viewmodel that combines:
 *   - masterplan_items
 *   - linked proposal_v2 (latest per item)
 *   - QA review status via proposal_comparisons
 *   - execution_artifacts (page briefs for service_page / location_page)
 *
 * No publishing. No WordPress writes. No mutation. Pure read/compose.
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

  // Execution artifact fields (page_brief for service_page / location_page)
  isPageBriefTarget: boolean;
  artifactId: string | null;
  artifactStatus: string | null;
  artifactCreatedAt: string | null;
  artifactDeliveryReadiness: string | null; // 'missing' | 'connected' | 'inventory_synced'

  // WordPress draft fields (V1)
  wpDraftId: string | null;
  wpDraftStatus: string | null; // 'created' | 'published' | 'failed' | 'needs_review' | ...
  wpEditLink: string | null;
  wpPreviewLink: string | null;
  wpPublishedAt: string | null;
  wpPublishedUrl: string | null;

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

const PAGE_BRIEF_TYPES: ReadonlySet<MasterplanItemType> = new Set(["service_page", "location_page"]);

function mapExecutionStatus(args: {
  item: MasterplanItem;
  proposal: {
    status: string | null;
    riskFlags: string[];
  } | null;
  comparison: {
    winner: string | null;
  } | null;
  artifact: {
    id: string;
    status: string;
  } | null;
  wpDraft: {
    status: string;
  } | null;
}): { executionStatus: ExecutionStatus; blockingReason: string | null; nextAction: string } {
  const { item, proposal, comparison, artifact, wpDraft } = args;

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

  // Page brief path (service_page / location_page)
  if (PAGE_BRIEF_TYPES.has(item.type)) {
    if (!artifact) {
      return {
        executionStatus: "planned",
        blockingReason: null,
        nextAction: "Generate page brief",
      };
    }
    if (artifact.status === "rejected") {
      return {
        executionStatus: "blocked",
        blockingReason: "Page brief rejected",
        nextAction: "Regenerate page brief",
      };
    }
    if (artifact.status === "approved") {
      if (wpDraft?.status === "published") {
        return {
          executionStatus: "done",
          blockingReason: null,
          nextAction: "Published — page is live",
        };
      }
      if (wpDraft?.status === "created") {
        return {
          executionStatus: "approved",
          blockingReason: null,
          nextAction: "WordPress draft created — review in WP admin, then mark as published",
        };
      }
      if (wpDraft?.status === "failed") {
        return {
          executionStatus: "approved",
          blockingReason: "WordPress draft creation failed",
          nextAction: "Retry WordPress draft creation",
        };
      }
      return {
        executionStatus: "approved",
        blockingReason: null,
        nextAction: "Create WordPress draft",
      };
    }
    // draft or needs_review
    return {
      executionStatus: "in_qa",
      blockingReason: null,
      nextAction: "Review page brief",
    };
  }

  // Legacy proposal path (website_fix, conversion, content, etc.)
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

    // 4b. Latest execution_artifact per item (page_brief targets)
    const pageBriefItemIds = items
      .filter((i) => PAGE_BRIEF_TYPES.has(i.type))
      .map((i) => i.id);


    const artifactByItem = new Map<
      string,
      { id: string; status: string; createdAt: string; deliveryReadiness: string | null }
    >();
    if (pageBriefItemIds.length > 0) {
      const { data: artRows } = await admin
        .from("execution_artifacts")
        .select("id, status, masterplan_item_id, created_at, delivery_readiness")
        .eq("tenant_id", data.tenantId)
        .in("masterplan_item_id", pageBriefItemIds)
        .eq("artifact_type", "page_brief")
        .order("created_at", { ascending: false });
      for (const r of (artRows ?? []) as Array<{
        id: string;
        status: string;
        masterplan_item_id: string;
        created_at: string;
        delivery_readiness: Record<string, unknown> | null;
      }>) {
        if (artifactByItem.has(r.masterplan_item_id)) continue;
        const dr = r.delivery_readiness;
        artifactByItem.set(r.masterplan_item_id, {
          id: r.id,
          status: r.status,
          createdAt: r.created_at,
          deliveryReadiness: typeof dr?.wordpress === "string" ? (dr.wordpress as string) : null,
        });
      }
    }

    // 4c. Latest wordpress_draft per artifact
    const approvedArtifactIds = [...artifactByItem.values()]
      .filter((a) => a.status === "approved")
      .map((a) => a.id);

    const draftByArtifact = new Map<
      string,
      { id: string; status: string; wpEditLink: string | null; wpPreviewLink: string | null; publishedAt: string | null; publishedUrl: string | null }
    >();
    if (approvedArtifactIds.length > 0) {
      const { data: draftRows } = await admin
        .from("wordpress_drafts")
        .select("id, status, execution_artifact_id, wp_edit_link, wp_preview_link, published_at, published_url")
        .eq("tenant_id", data.tenantId)
        .in("execution_artifact_id", approvedArtifactIds)
        .order("created_at", { ascending: false });
      for (const r of (draftRows ?? []) as Array<{
        id: string;
        status: string;
        execution_artifact_id: string;
        wp_edit_link: string | null;
        wp_preview_link: string | null;
        published_at: string | null;
        published_url: string | null;
      }>) {
        if (draftByArtifact.has(r.execution_artifact_id)) continue;
        draftByArtifact.set(r.execution_artifact_id, {
          id: r.id,
          status: r.status,
          wpEditLink: r.wp_edit_link,
          wpPreviewLink: r.wp_preview_link,
          publishedAt: r.published_at,
          publishedUrl: r.published_url,
        });
      }
    }

    // 5. Compose
    const board: ExecutionBoardItem[] = items.map((item) => {
      const proposal = latestByItem.get(item.id) ?? null;
      const comp = proposal ? compByProposal.get(proposal.id) ?? null : null;
      const artifact = artifactByItem.get(item.id) ?? null;
      const wpDraft = artifact ? draftByArtifact.get(artifact.id) ?? null : null;
      const isPageBriefTarget = PAGE_BRIEF_TYPES.has(item.type);
      const mapped = mapExecutionStatus({
        item,
        proposal: proposal
          ? { status: proposal.status, riskFlags: proposal.riskFlags }
          : null,
        comparison: comp ? { winner: comp.winner } : null,
        artifact: artifact ? { id: artifact.id, status: artifact.status } : null,
        wpDraft: wpDraft ? { status: wpDraft.status } : null,
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
        isPageBriefTarget,
        artifactId: artifact?.id ?? null,
        artifactStatus: artifact?.status ?? null,
        artifactCreatedAt: artifact?.createdAt ?? null,
        artifactDeliveryReadiness: artifact?.deliveryReadiness ?? null,
        wpDraftId: wpDraft?.id ?? null,
        wpDraftStatus: wpDraft?.status ?? null,
        wpEditLink: wpDraft?.wpEditLink ?? null,
        wpPreviewLink: wpDraft?.wpPreviewLink ?? null,
        wpPublishedAt: wpDraft?.publishedAt ?? null,
        wpPublishedUrl: wpDraft?.publishedUrl ?? null,
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
