/**
 * Execution Artifact gates — server-only.
 *
 * Checks that run before page_brief generation.
 * Gates control artifact generation quality, NOT WordPress delivery.
 *
 * WordPress connection is checked separately for delivery_readiness.
 * A missing WP connection should NOT block artifact creation.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ArtifactQualityGates, ArtifactDeliveryReadiness } from "./schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

export interface GateCheckInput {
  tenantId: string;
  masterplanItemType: string;
}

export interface GateCheckResult {
  passed: boolean;
  gates: ArtifactQualityGates;
  blockerMessage: string | null;
}

const PAGE_BRIEF_TYPES = new Set(["service_page", "location_page"]);

export async function checkPageBriefGates(input: GateCheckInput): Promise<GateCheckResult> {
  const { tenantId, masterplanItemType } = input;
  const failures: string[] = [];

  if (!PAGE_BRIEF_TYPES.has(masterplanItemType)) {
    return {
      passed: false,
      gates: emptyGates([
        `Item type "${masterplanItemType}" is not eligible for page_brief generation.`,
      ]),
      blockerMessage: `page_brief is only available for service_page and location_page items.`,
    };
  }

  // Load BP
  const { data: bp } = await admin
    .from("business_profiles_v2")
    .select("status, confidence_score, claim_guardrails")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  // Load Tone
  const { data: tone } = await admin
    .from("tone_profiles")
    .select("status, profile")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const bpStatus = (bp?.status as string | null) ?? null;
  const toneStatus = (tone?.status as string | null) ?? null;

  // BP gate: must be approved/locked, OR review_ready with confidence >= 5/10.
  // Valid BP statuses: draft | review_ready | approved | locked.
  const bpReviewed =
    bpStatus === "approved" ||
    bpStatus === "locked" ||
    (bpStatus === "review_ready" && (bp?.confidence_score ?? 0) >= 5);

  if (!bp) {
    failures.push("Business Profile not found — complete and review it before generating artifacts.");
  } else if (!bpReviewed) {
    failures.push(
      `Business Profile status is "${bpStatus}" — it must be reviewed/approved before generating page briefs.`,
    );
  }

  // Tone gate: must exist and have been analyzed (not placeholder)
  const toneAnalyzed =
    toneStatus === "approved" ||
    toneStatus === "locked" ||
    toneStatus === "review_ready" ||
    (toneStatus === "draft" &&
      tone?.profile &&
      typeof tone.profile === "object" &&
      (tone.profile as Record<string, unknown>).voiceIdentity);

  if (!tone) {
    failures.push("Tone Profile not found — create and review it before generating artifacts.");
  } else if (!toneAnalyzed) {
    failures.push(
      `Tone Profile status is "${toneStatus}" and appears unanalyzed — run the tone analyzer first.`,
    );
  }

  // Claim guardrails: present OR explicitly noted as missing
  const guardrails = (bp?.claim_guardrails as Record<string, unknown> | null) ?? {};
  const hasGuardrails =
    (Array.isArray(guardrails.allowedClaims) && (guardrails.allowedClaims as unknown[]).length > 0) ||
    (Array.isArray(guardrails.forbiddenClaims) && (guardrails.forbiddenClaims as unknown[]).length > 0);

  const inputQualityOk = !bp ||
    (bpReviewed && (bp.confidence_score ?? 0) >= 3);

  const passed = failures.length === 0;
  const gates: ArtifactQualityGates = {
    businessProfileReviewed: bpReviewed && !!bp,
    toneProfileReviewed: !!tone && !!toneAnalyzed,
    claimGuardrailsPresent: hasGuardrails,
    inputQualityOk,
    gatesPassedAt: passed ? new Date().toISOString() : null,
    gateFailureReasons: failures,
  };

  return {
    passed,
    gates,
    blockerMessage: passed ? null : failures.join(" | "),
  };
}

function emptyGates(failures: string[]): ArtifactQualityGates {
  return {
    businessProfileReviewed: false,
    toneProfileReviewed: false,
    claimGuardrailsPresent: false,
    inputQualityOk: false,
    gatesPassedAt: null,
    gateFailureReasons: failures,
  };
}

// ------------------------------------------------------------------
// WordPress delivery readiness (does NOT block artifact generation)
// ------------------------------------------------------------------

export async function checkWordpressDeliveryReadiness(input: {
  tenantId: string;
  masterplanItemId: string;
}): Promise<ArtifactDeliveryReadiness> {
  const { tenantId, masterplanItemId } = input;

  // Find WP connection for this tenant
  const { data: conn } = await admin
    .from("wordpress_connections")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conn || conn.status === "not_connected" || conn.status === "failed") {
    return {
      wordpress: "missing",
      wordpressConnectionId: conn?.id ?? null,
      inventoryCount: 0,
      hasMappingForThisItem: false,
      draftReadyAfterApproval: false,
      blockers: [
        "WordPress connection is not configured. Connect a WordPress site to enable draft creation later.",
      ],
    };
  }

  // Check inventory count
  const { count: invCount } = await admin
    .from("wordpress_site_inventory")
    .select("id", { count: "exact", head: true })
    .eq("wordpress_connection_id", conn.id);

  const inventoryCount = (invCount as number | null) ?? 0;

  // Check if there's a mapping for this masterplan item
  const { data: mapping } = await admin
    .from("wordpress_page_mappings")
    .select("id, mapping_type")
    .eq("wordpress_connection_id", conn.id)
    .eq("masterplan_item_id", masterplanItemId)
    .maybeSingle();

  const hasMappingForThisItem = !!mapping;
  const deliveryState =
    inventoryCount > 0 ? "inventory_synced" : "connected";

  const blockers: string[] = [];
  if (inventoryCount === 0) {
    blockers.push(
      "WordPress inventory not synced. Run inventory sync from the Sites page to enable draft creation.",
    );
  }
  if (!hasMappingForThisItem && inventoryCount > 0) {
    blockers.push(
      "No WordPress page mapping found for this masterplan item. Run 'Build page mappings' from the inventory screen.",
    );
  }

  const draftReadyAfterApproval =
    deliveryState === "inventory_synced" && hasMappingForThisItem && conn.status === "connected";

  return {
    wordpress: deliveryState,
    wordpressConnectionId: conn.id as string,
    inventoryCount,
    hasMappingForThisItem,
    draftReadyAfterApproval,
    blockers,
  };
}
