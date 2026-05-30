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

  // Page brief review data — populated so the UI can render a review panel without a second fetch
  artifactPrimaryKeyword: string | null;
  artifactKeywordVolume: number | null;
  artifactH1: string | null;
  artifactMetaTitle: string | null;
  artifactMetaDescription: string | null;
  artifactIntroPreview: string | null;    // first 300 chars of introBlock
  artifactOperatorNotes: string | null;
  artifactRiskFlags: string[];
  artifactMissingContext: string[];
  artifactSectionCount: number;
  artifactFaqCount: number;

  // WordPress draft fields
  wpDraftId: string | null;
  wpDraftStatus: string | null; // 'created' | 'published' | 'failed' | 'needs_review' | ...
  wpEditLink: string | null;
  wpPreviewLink: string | null;
  wpPublishedAt: string | null;
  wpPublishedUrl: string | null;
  wpSeoMetaStatus: string | null; // 'pushed_yoast' | 'pushed_rankmath' | 'manual_required' | 'skipped'
  wpMetaTitle: string | null;
  wpMetaDescription: string | null;
  wpPublishSource: string | null; // 'leadlayer_publish' | 'operator_manual'

  // Existing page optimization fields
  isOptimizationTarget: boolean;
  optimizationInventoryId: string | null;
  optimizationWpPostId: number | null;
  optimizationConnectionId: string | null;
  optimizationMappingType: string | null; // 'existing_page' | 'candidate_match'
  optimizationSnapshotId: string | null;
  optimizationSnapshotEligibility: string | null; // 'safe' | 'meta_only' | 'manual_mode' | 'blocked'
  optimizationSnapshotBuilder: string | null;
  optimizationArtifactId: string | null;
  optimizationArtifactStatus: string | null; // artifact status
  optimizationDeliveryStatus: string | null; // 'optimized' | 'delivery_failed' | 'pending'
  optimizationUpdateId: string | null;
  optimizationUpdateStatus: string | null; // 'applied' | 'failed'
  optimizationAppliedAt: string | null;

  // Optimization brief review data — populated for UI review panel
  optimizationArtifactUpdateMode: string | null;     // 'full_content' | 'meta_only' | 'manual'
  optimizationArtifactRecommendedTitle: string | null;
  optimizationArtifactMetaTitle: string | null;
  optimizationArtifactMetaDescription: string | null;
  optimizationArtifactRiskFlags: string[];
  optimizationArtifactMissingContext: string[];
  optimizationArtifactOperatorChecklist: string[];

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

// Mapping types that indicate an existing page can be optimized
const OPTIMIZATION_MAPPING_TYPES = new Set(["existing_page", "candidate_match"]);

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
    artifactType?: string;
    deliveryStatus?: string | null;
  } | null;
  wpDraft: {
    status: string;
  } | null;
  optimization: {
    snapshotId: string | null;
    artifactId: string | null;
    artifactStatus: string | null;
    deliveryStatus: string | null;
    updateStatus: string | null;
  } | null;
}): { executionStatus: ExecutionStatus; blockingReason: string | null; nextAction: string } {
  const { item, proposal, comparison, artifact, wpDraft, optimization } = args;

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

  // Existing page optimization path
  if (optimization) {
    if (optimization.deliveryStatus === "optimized" || optimization.updateStatus === "applied") {
      return { executionStatus: "done", blockingReason: null, nextAction: "Optimized — page updated" };
    }
    if (optimization.deliveryStatus === "delivery_failed" || optimization.updateStatus === "failed") {
      return {
        executionStatus: "blocked",
        blockingReason: "Optimization PATCH failed",
        nextAction: "Retry optimization",
      };
    }
    if (optimization.artifactStatus === "approved") {
      return {
        executionStatus: "approved",
        blockingReason: null,
        nextAction: "Apply optimization",
      };
    }
    if (optimization.artifactId) {
      return {
        executionStatus: "in_qa",
        blockingReason: null,
        nextAction: "Review optimization brief",
      };
    }
    if (optimization.snapshotId) {
      return {
        executionStatus: "planned",
        blockingReason: null,
        nextAction: "Generate optimization brief",
      };
    }
    return {
      executionStatus: "planned",
      blockingReason: null,
      nextAction: "Fetch current page snapshot",
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
      {
        id: string;
        status: string;
        createdAt: string;
        deliveryReadiness: string | null;
        primaryKeyword: string | null;
        keywordVolume: number | null;
        h1: string | null;
        metaTitle: string | null;
        metaDescription: string | null;
        introPreview: string | null;
        operatorNotes: string | null;
        riskFlags: string[];
        missingContext: string[];
        sectionCount: number;
        faqCount: number;
      }
    >();
    if (pageBriefItemIds.length > 0) {
      const { data: artRows } = await admin
        .from("execution_artifacts")
        .select("id, status, masterplan_item_id, created_at, delivery_readiness, payload, risk_flags, missing_context")
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
        payload: Record<string, unknown> | null;
        risk_flags: string[] | null;
        missing_context: string[] | null;
      }>) {
        if (artifactByItem.has(r.masterplan_item_id)) continue;
        const dr = r.delivery_readiness;
        const p = r.payload ?? {};
        const intro = typeof p.introBlock === "string" ? p.introBlock : null;
        artifactByItem.set(r.masterplan_item_id, {
          id: r.id,
          status: r.status,
          createdAt: r.created_at,
          deliveryReadiness: typeof dr?.wordpress === "string" ? (dr.wordpress as string) : null,
          primaryKeyword: typeof p.primaryKeyword === "string" ? p.primaryKeyword : null,
          keywordVolume: typeof p.keywordVolume === "number" ? p.keywordVolume : null,
          h1: typeof p.h1 === "string" ? p.h1 : null,
          metaTitle: typeof p.metaTitle === "string" ? p.metaTitle : null,
          metaDescription: typeof p.metaDescription === "string" ? p.metaDescription : null,
          introPreview: intro ? intro.slice(0, 300) : null,
          operatorNotes: typeof p.operatorNotes === "string" ? p.operatorNotes : null,
          riskFlags: Array.isArray(r.risk_flags) ? r.risk_flags : [],
          missingContext: Array.isArray(r.missing_context) ? r.missing_context : [],
          sectionCount: Array.isArray(p.serviceSections) ? (p.serviceSections as unknown[]).length : 0,
          faqCount: Array.isArray(p.faqBlock) ? (p.faqBlock as unknown[]).length : 0,
        });
      }
    }

    // 4c. Latest wordpress_draft per artifact
    const approvedArtifactIds = [...artifactByItem.values()]
      .filter((a) => a.status === "approved")
      .map((a) => a.id);

    const draftByArtifact = new Map<
      string,
      {
        id: string;
        status: string;
        wpEditLink: string | null;
        wpPreviewLink: string | null;
        publishedAt: string | null;
        publishedUrl: string | null;
        seoMetaStatus: string | null;
        metaTitle: string | null;
        metaDescription: string | null;
        publishSource: string | null;
      }
    >();
    if (approvedArtifactIds.length > 0) {
      const { data: draftRows } = await admin
        .from("wordpress_drafts")
        .select("id, status, execution_artifact_id, wp_edit_link, wp_preview_link, published_at, published_url, seo_meta_status, meta_title, meta_description, publish_source")
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
        seo_meta_status: string | null;
        meta_title: string | null;
        meta_description: string | null;
        publish_source: string | null;
      }>) {
        if (draftByArtifact.has(r.execution_artifact_id)) continue;
        draftByArtifact.set(r.execution_artifact_id, {
          id: r.id,
          status: r.status,
          wpEditLink: r.wp_edit_link,
          wpPreviewLink: r.wp_preview_link,
          publishedAt: r.published_at,
          publishedUrl: r.published_url,
          seoMetaStatus: r.seo_meta_status,
          metaTitle: r.meta_title,
          metaDescription: r.meta_description,
          publishSource: r.publish_source,
        });
      }
    }

    // 4d. Existing page optimization data — mappings, snapshots, briefs, updates
    const optimizationByItem = new Map<
      string,
      {
        inventoryId: string | null;
        wpPostId: number | null;
        connectionId: string | null;
        mappingType: string | null;
        snapshotId: string | null;
        snapshotEligibility: string | null;
        snapshotBuilder: string | null;
        artifactId: string | null;
        artifactStatus: string | null;
        deliveryStatus: string | null;
        updateId: string | null;
        updateStatus: string | null;
        appliedAt: string | null;
      }
    >();

    // Load optimization mappings for all items
    const { data: optMappingRows } = await admin
      .from("wordpress_page_mappings")
      .select("masterplan_item_id, mapping_type, inventory_id, wordpress_connection_id")
      .eq("tenant_id", data.tenantId)
      .in("mapping_type", Array.from(OPTIMIZATION_MAPPING_TYPES))
      .not("masterplan_item_id", "is", null);

    const optimizationMappingByItem = new Map<
      string,
      { inventoryId: string | null; connectionId: string; mappingType: string }
    >();
    for (const r of (optMappingRows ?? []) as Array<{
      masterplan_item_id: string | null;
      mapping_type: string;
      inventory_id: string | null;
      wordpress_connection_id: string;
    }>) {
      if (!r.masterplan_item_id) continue;
      if (!optimizationMappingByItem.has(r.masterplan_item_id)) {
        optimizationMappingByItem.set(r.masterplan_item_id, {
          inventoryId: r.inventory_id,
          connectionId: r.wordpress_connection_id,
          mappingType: r.mapping_type,
        });
      }
    }

    // Load wp_post_id from inventory for the mappings
    const inventoryIds = [...optimizationMappingByItem.values()]
      .map((m) => m.inventoryId)
      .filter(Boolean) as string[];
    const wpPostIdByInventory = new Map<string, number>();
    if (inventoryIds.length > 0) {
      const { data: invRows } = await admin
        .from("wordpress_site_inventory")
        .select("id, wp_post_id")
        .in("id", inventoryIds);
      for (const r of (invRows ?? []) as Array<{ id: string; wp_post_id: number }>) {
        wpPostIdByInventory.set(r.id, r.wp_post_id);
      }
    }

    // Load latest snapshot per item
    const connectionIds = [...new Set([...optimizationMappingByItem.values()].map((m) => m.connectionId))];
    const snapshotByItemPost = new Map<string, {
      id: string;
      eligibilityStatus: string;
      detectedBuilder: string | null;
    }>();
    if (connectionIds.length > 0) {
      const wpPostIds = [...new Set(
        [...optimizationMappingByItem.values()]
          .map((m) => m.inventoryId ? wpPostIdByInventory.get(m.inventoryId) : null)
          .filter((v): v is number => v != null),
      )];
      if (wpPostIds.length > 0) {
        const { data: snapRows } = await admin
          .from("page_optimization_snapshots")
          .select("id, wp_post_id, wordpress_connection_id, eligibility_status, detected_builder, created_at")
          .eq("tenant_id", data.tenantId)
          .in("wp_post_id", wpPostIds)
          .order("created_at", { ascending: false });
        for (const r of (snapRows ?? []) as Array<{
          id: string;
          wp_post_id: number;
          wordpress_connection_id: string;
          eligibility_status: string;
          detected_builder: string | null;
          created_at: string;
        }>) {
          const key = `${r.wordpress_connection_id}:${r.wp_post_id}`;
          if (!snapshotByItemPost.has(key)) {
            snapshotByItemPost.set(key, {
              id: r.id,
              eligibilityStatus: r.eligibility_status,
              detectedBuilder: r.detected_builder,
            });
          }
        }
      }
    }

    // Load latest page_optimization_brief artifact per item
    const optItemIds = [...optimizationMappingByItem.keys()];
    const optArtifactByItem = new Map<
      string,
      {
        id: string;
        status: string;
        deliveryStatus: string | null;
        updateMode: string | null;
        recommendedTitle: string | null;
        metaTitle: string | null;
        metaDescription: string | null;
        riskFlags: string[];
        missingContext: string[];
        operatorChecklist: string[];
      }
    >();
    if (optItemIds.length > 0) {
      const { data: optArtRows } = await admin
        .from("execution_artifacts")
        .select("id, status, masterplan_item_id, delivery_status, created_at, payload, risk_flags, missing_context")
        .eq("tenant_id", data.tenantId)
        .in("masterplan_item_id", optItemIds)
        .eq("artifact_type", "page_optimization_brief")
        .order("created_at", { ascending: false });
      for (const r of (optArtRows ?? []) as Array<{
        id: string;
        status: string;
        masterplan_item_id: string;
        delivery_status: string | null;
        created_at: string;
        payload: Record<string, unknown> | null;
        risk_flags: string[] | null;
        missing_context: string[] | null;
      }>) {
        if (!optArtifactByItem.has(r.masterplan_item_id)) {
          const p = r.payload ?? {};
          optArtifactByItem.set(r.masterplan_item_id, {
            id: r.id,
            status: r.status,
            deliveryStatus: r.delivery_status,
            updateMode: typeof p.updateMode === "string" ? p.updateMode : null,
            recommendedTitle: typeof p.recommendedTitle === "string" ? p.recommendedTitle : null,
            metaTitle: typeof p.metaTitle === "string" ? p.metaTitle : null,
            metaDescription: typeof p.metaDescription === "string" ? p.metaDescription : null,
            riskFlags: Array.isArray(r.risk_flags) ? r.risk_flags : [],
            missingContext: Array.isArray(r.missing_context) ? r.missing_context : [],
            operatorChecklist: Array.isArray(p.operatorChecklist) ? (p.operatorChecklist as string[]) : [],
          });
        }
      }
    }

    // Load latest page_update per artifact
    const optArtifactIds = [...optArtifactByItem.values()].map((a) => a.id);
    const optUpdateByArtifact = new Map<
      string,
      { id: string; status: string; appliedAt: string | null }
    >();
    if (optArtifactIds.length > 0) {
      const { data: updateRows } = await admin
        .from("wordpress_page_updates")
        .select("id, status, execution_artifact_id, applied_at, created_at")
        .eq("tenant_id", data.tenantId)
        .in("execution_artifact_id", optArtifactIds)
        .order("created_at", { ascending: false });
      for (const r of (updateRows ?? []) as Array<{
        id: string;
        status: string;
        execution_artifact_id: string | null;
        applied_at: string | null;
        created_at: string;
      }>) {
        if (!r.execution_artifact_id) continue;
        if (!optUpdateByArtifact.has(r.execution_artifact_id)) {
          optUpdateByArtifact.set(r.execution_artifact_id, {
            id: r.id,
            status: r.status,
            appliedAt: r.applied_at,
          });
        }
      }
    }

    // Compose optimization data per item
    for (const [itemId, mapping] of optimizationMappingByItem) {
      const wpPostId = mapping.inventoryId ? (wpPostIdByInventory.get(mapping.inventoryId) ?? null) : null;
      const snapKey = wpPostId ? `${mapping.connectionId}:${wpPostId}` : null;
      const snap = snapKey ? snapshotByItemPost.get(snapKey) ?? null : null;
      const art = optArtifactByItem.get(itemId) ?? null;
      const upd = art ? optUpdateByArtifact.get(art.id) ?? null : null;

      optimizationByItem.set(itemId, {
        inventoryId: mapping.inventoryId,
        wpPostId,
        connectionId: mapping.connectionId,
        mappingType: mapping.mappingType,
        snapshotId: snap?.id ?? null,
        snapshotEligibility: snap?.eligibilityStatus ?? null,
        snapshotBuilder: snap?.detectedBuilder ?? null,
        artifactId: art?.id ?? null,
        artifactStatus: art?.status ?? null,
        deliveryStatus: art?.deliveryStatus ?? null,
        updateId: upd?.id ?? null,
        updateStatus: upd?.status ?? null,
        appliedAt: upd?.appliedAt ?? null,
      });
    }

    // 5. Compose
    const board: ExecutionBoardItem[] = items.map((item) => {
      const proposal = latestByItem.get(item.id) ?? null;
      const comp = proposal ? compByProposal.get(proposal.id) ?? null : null;
      const artifact = artifactByItem.get(item.id) ?? null;
      const wpDraft = artifact ? draftByArtifact.get(artifact.id) ?? null : null;
      const isPageBriefTarget = PAGE_BRIEF_TYPES.has(item.type);
      const optData = optimizationByItem.get(item.id) ?? null;
      const mapped = mapExecutionStatus({
        item,
        proposal: proposal
          ? { status: proposal.status, riskFlags: proposal.riskFlags }
          : null,
        comparison: comp ? { winner: comp.winner } : null,
        artifact: artifact ? { id: artifact.id, status: artifact.status } : null,
        wpDraft: wpDraft ? { status: wpDraft.status } : null,
        optimization: optData
          ? {
              snapshotId: optData.snapshotId,
              artifactId: optData.artifactId,
              artifactStatus: optData.artifactStatus,
              deliveryStatus: optData.deliveryStatus,
              updateStatus: optData.updateStatus,
            }
          : null,
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
        artifactPrimaryKeyword: artifact?.primaryKeyword ?? null,
        artifactKeywordVolume: artifact?.keywordVolume ?? null,
        artifactH1: artifact?.h1 ?? null,
        artifactMetaTitle: artifact?.metaTitle ?? null,
        artifactMetaDescription: artifact?.metaDescription ?? null,
        artifactIntroPreview: artifact?.introPreview ?? null,
        artifactOperatorNotes: artifact?.operatorNotes ?? null,
        artifactRiskFlags: artifact?.riskFlags ?? [],
        artifactMissingContext: artifact?.missingContext ?? [],
        artifactSectionCount: artifact?.sectionCount ?? 0,
        artifactFaqCount: artifact?.faqCount ?? 0,
        wpDraftId: wpDraft?.id ?? null,
        wpDraftStatus: wpDraft?.status ?? null,
        wpEditLink: wpDraft?.wpEditLink ?? null,
        wpPreviewLink: wpDraft?.wpPreviewLink ?? null,
        wpPublishedAt: wpDraft?.publishedAt ?? null,
        wpPublishedUrl: wpDraft?.publishedUrl ?? null,
        wpSeoMetaStatus: wpDraft?.seoMetaStatus ?? null,
        wpMetaTitle: wpDraft?.metaTitle ?? null,
        wpMetaDescription: wpDraft?.metaDescription ?? null,
        wpPublishSource: wpDraft?.publishSource ?? null,
        isOptimizationTarget: optData !== null,
        optimizationInventoryId: optData?.inventoryId ?? null,
        optimizationWpPostId: optData?.wpPostId ?? null,
        optimizationConnectionId: optData?.connectionId ?? null,
        optimizationMappingType: optData?.mappingType ?? null,
        optimizationSnapshotId: optData?.snapshotId ?? null,
        optimizationSnapshotEligibility: optData?.snapshotEligibility ?? null,
        optimizationSnapshotBuilder: optData?.snapshotBuilder ?? null,
        optimizationArtifactId: optData?.artifactId ?? null,
        optimizationArtifactStatus: optData?.artifactStatus ?? null,
        optimizationDeliveryStatus: optData?.deliveryStatus ?? null,
        optimizationUpdateId: optData?.updateId ?? null,
        optimizationUpdateStatus: optData?.updateStatus ?? null,
        optimizationAppliedAt: optData?.appliedAt ?? null,
        optimizationArtifactUpdateMode: optArtifactByItem.get(item.id)?.updateMode ?? null,
        optimizationArtifactRecommendedTitle: optArtifactByItem.get(item.id)?.recommendedTitle ?? null,
        optimizationArtifactMetaTitle: optArtifactByItem.get(item.id)?.metaTitle ?? null,
        optimizationArtifactMetaDescription: optArtifactByItem.get(item.id)?.metaDescription ?? null,
        optimizationArtifactRiskFlags: optArtifactByItem.get(item.id)?.riskFlags ?? [],
        optimizationArtifactMissingContext: optArtifactByItem.get(item.id)?.missingContext ?? [],
        optimizationArtifactOperatorChecklist: optArtifactByItem.get(item.id)?.operatorChecklist ?? [],
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
