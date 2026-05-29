/**
 * Monthly Execution Plan Builder — server-only.
 *
 * Deterministic. No LLM. Selects concrete retainer-value actions for the
 * next month based on: goal, lead gap, Snapshot, Masterplan items,
 * Execution Artifacts, WordPress draft status, and package tier.
 *
 * Report = backward-looking. Plan = forward-looking.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildGrowthIntelligenceSnapshot } from "@/lib/growthIntelligence/buildGrowthIntelligenceSnapshot.server";
import type { GrowthIntelligenceSnapshot } from "@/lib/shared/growthIntelligence/schemas";
import type {
  ActionCategory,
  DeliveryType,
  LeadImpact,
  MonthlyExecutionPlan,
  PackageTier,
  PlanAction,
  PlanExpectedImpact,
  PlanLeadGapSummary,
  PlanStatus,
} from "./schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

// Tier → max actions
const TIER_LIMITS: Record<PackageTier, { min: number; max: number }> = {
  starter: { min: 2, max: 3 },
  growth: { min: 4, max: 5 },
  pro: { min: 6, max: 8 },
};

export interface BuildPlanInput {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  packageTier: PackageTier;
  monthlyReportId?: string | null;
}

export async function buildMonthlyExecutionPlan(
  input: BuildPlanInput,
): Promise<Omit<MonthlyExecutionPlan, "id" | "createdAt" | "updatedAt">> {
  const { tenantId, periodStart, periodEnd, packageTier, monthlyReportId } = input;

  // ------------------------------------------------------------------
  // Load all context in parallel
  // ------------------------------------------------------------------

  const [
    goalRow,
    latestLeadsData,
    masterplanItems,
    artifactRows,
    draftRows,
    wpConnRow,
    reportRow,
    snapshotResult,
  ] = await Promise.all([
    // Active growth goal
    admin
      .from("growth_goals")
      .select("id, target_type, target_count, close_rate, lead_value, required_leads, timeframe_months, service_focus, locations, tracking_notes")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r: { data: unknown }) => r.data as Record<string, unknown> | null),

    // Lead count for last 30 days (current pace)
    admin
      .from("leads")
      .select("id, status, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
      .then((r: { data: unknown[] | null }) => r.data ?? []),

    // All non-done masterplan items (highest priority first)
    admin
      .from("masterplan_items")
      .select("id, type, title, status, priority, metadata")
      .eq("tenant_id", tenantId)
      .not("status", "in", '("done","skipped")')
      .order("created_at", { ascending: true })
      .limit(30)
      .then((r: { data: unknown[] | null }) => r.data ?? []),

    // Execution artifacts: all non-rejected, newest first
    admin
      .from("execution_artifacts")
      .select("id, artifact_type, status, masterplan_item_id, payload, delivery_readiness")
      .eq("tenant_id", tenantId)
      .not("status", "eq", "rejected")
      .order("created_at", { ascending: false })
      .limit(20)
      .then((r: { data: unknown[] | null }) => r.data ?? []),

    // WordPress drafts: created status
    admin
      .from("wordpress_drafts")
      .select("id, title, status, execution_artifact_id, wp_edit_link")
      .eq("tenant_id", tenantId)
      .eq("status", "created")
      .order("created_at", { ascending: false })
      .limit(20)
      .then((r: { data: unknown[] | null }) => r.data ?? []),

    // WordPress connection
    admin
      .from("wordpress_connections")
      .select("id, status, capabilities")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r: { data: unknown }) => r.data as Record<string, unknown> | null),

    // Latest monthly report (provided ID or latest)
    monthlyReportId
      ? admin
          .from("monthly_reports")
          .select("id, goal_progress_summary, lead_summary, execution_summary")
          .eq("id", monthlyReportId)
          .eq("tenant_id", tenantId)
          .maybeSingle()
          .then((r: { data: unknown }) => r.data as Record<string, unknown> | null)
      : admin
          .from("monthly_reports")
          .select("id, goal_progress_summary, lead_summary, execution_summary")
          .eq("tenant_id", tenantId)
          .order("period_start", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then((r: { data: unknown }) => r.data as Record<string, unknown> | null),

    // Growth Intelligence Snapshot — built on-demand (not a stored table).
    // Wrapped in catch so a snapshot build failure does not abort the full plan build.
    buildGrowthIntelligenceSnapshot({ tenantId }).catch((): null => null),
  ]);

  // ------------------------------------------------------------------
  // Derive context
  // ------------------------------------------------------------------

  const goal = goalRow;
  const serviceFocus: string[] = Array.isArray(goal?.service_focus)
    ? (goal.service_focus as string[])
    : [];
  const locations: string[] = Array.isArray(goal?.locations)
    ? (goal.locations as string[])
    : [];

  // Lead gap
  const requiredPerMonth =
    goal?.required_leads != null && goal?.timeframe_months != null
      ? Math.ceil(Number(goal.required_leads) / Number(goal.timeframe_months))
      : null;
  const actualLastPeriod = (latestLeadsData as Array<unknown>).length;
  const gap = requiredPerMonth != null ? requiredPerMonth - actualLastPeriod : null;
  const onTrack = gap != null ? gap <= 0 : false;

  const leadGapSummary: PlanLeadGapSummary = {
    requiredPerMonth,
    actualLastPeriod,
    gap,
    onTrack,
    paceNote:
      gap == null
        ? "No lead target set — configure the growth goal."
        : gap > 0
          ? `${gap} leads behind target this month — delivery must increase.`
          : `On track — ${actualLastPeriod} leads in last 30 days.`,
  };

  // Snapshot — typed result from the on-demand builder. Null if build failed.
  const snapshot = snapshotResult as GrowthIntelligenceSnapshot | null;
  const snapshotFailed = snapshot === null;

  const trackingWeak = !snapshot || snapshot.tracking.status === "missing";
  const gbpWeak = !snapshot || snapshot.gbp.status === "missing" || snapshot.gbp.status === "placeholder";
  const wpSlice = snapshot?.wordpress ?? null;
  const wpConnected = wpConnRow?.status === "connected";
  const canCreateDraft =
    wpConnected &&
    (wpConnRow?.capabilities as Record<string, unknown> | null)?.canCreateDraft === true;

  // Artifact map: artifactId → row
  type ArtRow = {
    id: string;
    artifact_type: string;
    status: string;
    masterplan_item_id: string;
    payload: Record<string, unknown>;
    delivery_readiness: Record<string, unknown>;
  };
  const artifacts = (artifactRows as ArtRow[]);
  const artifactByItem = new Map<string, ArtRow>();
  for (const a of artifacts) {
    if (!artifactByItem.has(a.masterplan_item_id)) artifactByItem.set(a.masterplan_item_id, a);
  }

  // Draft artifact IDs (already have a WP draft created)
  type DraftRow = { id: string; execution_artifact_id: string; title: string | null; wp_edit_link: string | null };
  const drafts = (draftRows as DraftRow[]);
  const draftArtifactIds = new Set(drafts.map((d) => d.execution_artifact_id));

  // Masterplan page brief items
  type ItemRow = { id: string; type: string; title: string; status: string; priority: string; metadata: Record<string, unknown> };
  const items = (masterplanItems as ItemRow[]);
  const PAGE_BRIEF_TYPES = new Set(["service_page", "location_page"]);

  // ------------------------------------------------------------------
  // Candidate action pools
  // ------------------------------------------------------------------

  const candidates: PlanAction[] = [];
  let actionIdx = 0;
  const nextId = () => `action-${++actionIdx}`;

  // --- VISIBILITY ASSETS ---
  // Priority 1: Approved artifact with no WP draft yet → create draft
  for (const art of artifacts) {
    if (art.status === "approved" && !draftArtifactIds.has(art.id) && wpConnected && canCreateDraft) {
      const item = items.find((i) => i.id === art.masterplan_item_id);
      const payload = art.payload ?? {};
      const title = (payload.h1 as string | undefined) ?? (item?.title ?? "page");
      candidates.push({
        id: nextId(),
        title: `Create WordPress draft: "${title}"`,
        category: "visibility_asset",
        priority: "high",
        linkedMasterplanItemId: art.masterplan_item_id,
        linkedExecutionArtifactId: art.id,
        deliveryType: "software",
        expectedLeadImpact: "high",
        rationale: `Page brief approved and ready — create the WordPress draft to move it toward publishing.`,
        requiredInputs: [],
        successMetric: `WordPress draft created and visible in WP admin for operator review.`,
        status: "planned",
      });
    }
  }

  // Priority 2: Planned service/location items without any artifact → generate brief
  for (const item of items) {
    if (!PAGE_BRIEF_TYPES.has(item.type)) continue;
    const art = artifactByItem.get(item.id);
    if (!art) {
      const service = typeof item.metadata?.linkedService === "string"
        ? item.metadata.linkedService
        : serviceFocus[0] ?? "service";
      const loc = typeof item.metadata?.linkedLocation === "string"
        ? item.metadata.linkedLocation
        : locations[0] ?? "";
      candidates.push({
        id: nextId(),
        title: `Generate + approve page brief: ${item.title}`,
        category: "visibility_asset",
        priority: item.priority === "critical" || item.priority === "high" ? "high" : "medium",
        linkedMasterplanItemId: item.id,
        deliveryType: "hybrid",
        expectedLeadImpact: "high",
        rationale: `No page brief exists for this ${item.type === "location_page" ? `${loc} location page` : `${service} service page`}. Generating it creates the asset that drives local search traffic.`,
        requiredInputs: ["Business profile approved", "Tone profile reviewed"],
        successMetric: `Page brief generated, reviewed by operator, and approved.`,
        status: "planned",
      });
    } else if (art.status === "draft" || art.status === "needs_review") {
      candidates.push({
        id: nextId(),
        title: `Review and approve page brief: ${item.title}`,
        category: "visibility_asset",
        priority: "high",
        linkedMasterplanItemId: item.id,
        linkedExecutionArtifactId: art.id,
        deliveryType: "operator",
        expectedLeadImpact: "medium",
        rationale: `Page brief generated but not yet approved. Approving it unlocks WordPress draft creation.`,
        requiredInputs: ["Operator reviews brief for accuracy and tone"],
        successMetric: `Brief approved — proceed to WordPress draft creation.`,
        status: "planned",
      });
    }
  }

  // --- CONVERSION IMPROVEMENT ---
  const reportExecSummary = (reportRow?.execution_summary as Record<string, unknown> | null) ?? null;
  const hasRecentDelivery = (reportExecSummary?.artifactsApproved as number | null ?? 0) > 0
    || (reportExecSummary?.masterplanItemsDone as number | null ?? 0) > 0;

  if (!wpConnected) {
    candidates.push({
      id: nextId(),
      title: "Connect WordPress site to enable draft delivery",
      category: "conversion_improvement",
      priority: "critical",
      deliveryType: "operator",
      expectedLeadImpact: "high",
      rationale: "No WordPress connection — approved page briefs cannot be delivered as drafts until the site is connected.",
      requiredInputs: ["WordPress site URL", "Application Password (from WordPress admin → Users → Application Passwords)"],
      successMetric: "WordPress connected and capability check passes.",
      status: "planned",
    });
  } else {
    candidates.push({
      id: nextId(),
      title: "Audit CTA placement on top service pages",
      category: "conversion_improvement",
      priority: gap != null && gap > 2 ? "high" : "medium",
      deliveryType: "operator",
      expectedLeadImpact: "medium",
      rationale: "Improving call-to-action placement on high-intent service pages directly increases lead conversion rate — often higher impact than creating new pages.",
      requiredInputs: ["List of top-traffic service pages", "Current CTA text and placement"],
      successMetric: "CTA visible above fold on top 3 service pages; click-to-call works on mobile.",
      status: "planned",
    });
  }

  // --- TRUST / PROOF ---
  candidates.push({
    id: nextId(),
    title: "Add or update verified proof points in Business Profile",
    category: "trust_or_proof",
    priority: "medium",
    deliveryType: "operator",
    expectedLeadImpact: "medium",
    rationale: "Verified proof points (licenses, certifications, case studies) feed directly into page briefs and reduce risky claim flags. Missing proof weakens every page we generate.",
    requiredInputs: ["Certifications or license numbers", "Recent client wins or case details"],
    successMetric: "At least 2 new verified proof points locked in Business Profile.",
    status: "planned",
  });

  // Review request action
  candidates.push({
    id: nextId(),
    title: "Request 3 Google reviews from recent clients",
    category: "trust_or_proof",
    priority: "medium",
    deliveryType: "manual",
    expectedLeadImpact: "medium",
    rationale: "Google reviews improve both GBP visibility and trust signals on landing pages. 3 new reviews this month maintains review velocity.",
    requiredInputs: ["List of 3 recent satisfied clients", "Google review link"],
    successMetric: "3 review requests sent; 1+ received and visible on Google.",
    status: "planned",
  });

  // --- LOCAL VISIBILITY ---
  if (gbpWeak) {
    candidates.push({
      id: nextId(),
      title: "Complete Google Business Profile audit and optimisation",
      category: "local_visibility",
      priority: "high",
      deliveryType: "operator",
      expectedLeadImpact: "high",
      rationale: `GBP profile shows ${snapshot?.gbp.status ?? "missing"} status — this directly limits local map pack visibility. Completing the profile is high-leverage for local lead flow.`,
      requiredInputs: ["GBP admin access", "NAP (name, address, phone) confirmation", "Service area list"],
      successMetric: "GBP completeness score above 80%; all service categories updated.",
      status: "planned",
    });
  } else {
    candidates.push({
      id: nextId(),
      title: "Update GBP posts and service list for this month",
      category: "local_visibility",
      priority: "low",
      deliveryType: "operator",
      expectedLeadImpact: "low",
      rationale: "Regular GBP posts maintain visibility in the local pack and signal activity to Google.",
      requiredInputs: ["One topical post (seasonal offer, completed job, tip)", "Updated service list if anything changed"],
      successMetric: "1 GBP post published and service list verified.",
      status: "planned",
    });
  }

  // --- MEASUREMENT ---
  if (trackingWeak) {
    candidates.push({
      id: nextId(),
      title: "Set up lead tracking: log all inbound leads this month",
      category: "measurement",
      priority: gap != null && gap > 0 ? "critical" : "high",
      deliveryType: "hybrid",
      expectedLeadImpact: "low",
      rationale: "Tracking status is missing — monthly goal progress cannot be proven without lead data. Either connect the form webhook or log leads manually.",
      requiredInputs: ["Form webhook configured (see Lead Inbox → Lead capture sources)", "Or: manual lead log for each inbound call/form"],
      successMetric: "All inbound leads logged; monthly report shows > 0 leads.",
      status: "planned",
    });
  } else {
    candidates.push({
      id: nextId(),
      title: "Review lead quality and update status in Lead Inbox",
      category: "measurement",
      priority: "medium",
      deliveryType: "operator",
      expectedLeadImpact: "low",
      rationale: "Marking leads as qualified, won, or lost gives the Monthly Report real conversion data and improves close-rate accuracy for the goal model.",
      requiredInputs: ["Access to Lead Inbox"],
      successMetric: "All leads from last month have a final status (qualified/won/lost/unqualified).",
      status: "planned",
    });
  }

  // --- REPORTING / REVIEW ---
  candidates.push({
    id: nextId(),
    title: "Generate and review Monthly Report for this period",
    category: "reporting_or_review",
    priority: "medium",
    deliveryType: "software",
    expectedLeadImpact: "low",
    rationale: "The Monthly Report closes the accountability loop with the client. It must be generated, reviewed, and shared to justify the retainer.",
    requiredInputs: [],
    successMetric: "Monthly Report status set to 'approved' or 'sent'.",
    status: "planned",
  });

  candidates.push({
    id: nextId(),
    title: "Review and refresh Masterplan priorities",
    category: "reporting_or_review",
    priority: "low",
    deliveryType: "operator",
    expectedLeadImpact: "low",
    rationale: "A monthly priority review keeps the Masterplan aligned with the current lead gap and ensures next month's execution plan is actionable.",
    requiredInputs: [],
    successMetric: "Top 5 Masterplan items reviewed and priorities confirmed or updated.",
    status: "planned",
  });

  // ------------------------------------------------------------------
  // Select actions by category priority, respecting tier limits
  // ------------------------------------------------------------------

  const { max } = TIER_LIMITS[packageTier];

  // Category selection order: measurement first if tracking is critical,
  // then visibility_asset (high impact), then local, conversion, trust, reporting
  const selectionOrder: ActionCategory[] =
    gap != null && gap > 0 && trackingWeak
      ? ["measurement", "visibility_asset", "local_visibility", "conversion_improvement", "trust_or_proof", "reporting_or_review"]
      : ["visibility_asset", "local_visibility", "conversion_improvement", "measurement", "trust_or_proof", "reporting_or_review"];

  // Priority within category: critical > high > medium > low
  const PRIORITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const sortByPriority = (a: PlanAction, b: PlanAction) =>
    (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0);

  // Pick at most 2 per category for growth/pro, 1 for starter
  const perCatLimit = packageTier === "starter" ? 1 : 2;
  const selected: PlanAction[] = [];
  const usedIds = new Set<string>();

  for (const cat of selectionOrder) {
    if (selected.length >= max) break;
    const pool = candidates
      .filter((c) => c.category === cat && !usedIds.has(c.id))
      .sort(sortByPriority)
      .slice(0, perCatLimit);
    for (const a of pool) {
      if (selected.length >= max) break;
      selected.push(a);
      usedIds.add(a.id);
    }
  }

  // Fill remaining slots from any leftover candidates
  if (selected.length < TIER_LIMITS[packageTier].min) {
    const remaining = candidates
      .filter((c) => !usedIds.has(c.id))
      .sort(sortByPriority);
    for (const a of remaining) {
      if (selected.length >= max) break;
      selected.push(a);
      usedIds.add(a.id);
    }
  }

  // ------------------------------------------------------------------
  // Compute expected impact
  // ------------------------------------------------------------------

  const pageActions = selected.filter((a) => a.category === "visibility_asset");
  const highImpactCount = selected.filter((a) => a.expectedLeadImpact === "high").length;
  const projectedLeadUplift: LeadImpact =
    highImpactCount >= 2 ? "high" : highImpactCount === 1 ? "medium" : "low";

  const expectedImpact: PlanExpectedImpact = {
    projectedLeadUplift,
    pagesDelivered: pageActions.filter((a) => a.deliveryType === "software" || a.deliveryType === "hybrid").length,
    actionsCompleted: selected.length,
    note:
      gap != null && gap > 0
        ? `Closing a ${gap}-lead gap requires ${gap > 5 ? "multiple months of compounding asset delivery and" : ""} consistent lead capture. This plan prioritises the highest-impact actions for this tier.`
        : "On track — this plan maintains and extends the current lead engine.",
  };

  // ------------------------------------------------------------------
  // Required inputs (aggregate across actions)
  // ------------------------------------------------------------------

  const requiredInputs = [
    ...new Set(selected.flatMap((a) => a.requiredInputs).filter(Boolean)),
  ];

  // ------------------------------------------------------------------
  // Risks
  // ------------------------------------------------------------------

  const risks: string[] = [];
  if (!wpConnected)
    risks.push("WordPress not connected — visibility asset delivery is blocked.");
  if (trackingWeak)
    risks.push("Tracking is missing — monthly lead count may be underreported.");
  if (gbpWeak)
    risks.push("GBP profile incomplete — local map pack visibility is limited.");
  if (gap != null && gap > 5)
    risks.push(`Large lead gap (${gap}) — single-month actions alone may not close it.`);
  if (!snapshot || snapshot.ranking.status === "missing")
    risks.push("Ranking baseline not set — cannot measure organic search improvement.");
  if (snapshotFailed)
    risks.push("Growth Intelligence Snapshot could not be loaded — plan uses direct DB data only. Re-run the intelligence pipeline if this persists.");

  // ------------------------------------------------------------------
  // Rationale
  // ------------------------------------------------------------------

  const tierLabel = packageTier.charAt(0).toUpperCase() + packageTier.slice(1);
  const rationale = [
    `${tierLabel} tier plan for ${periodStart} → ${periodEnd}.`,
    leadGapSummary.gap != null && leadGapSummary.gap > 0
      ? `Lead gap: ${leadGapSummary.gap} behind target. Plan prioritises actions with highest lead impact.`
      : "Currently on track. Plan maintains delivery pace and improves tracking.",
    wpSlice?.status === "missing" || wpSlice?.connectionStatus == null
      ? "WordPress not connected — plan includes connection as a prerequisite."
      : wpSlice?.connectionStatus === "connected"
        ? "WordPress connected — page brief delivery is enabled."
        : "",
    trackingWeak
      ? "Tracking is weak — measurement action included as a priority."
      : "Tracking is active — plan focuses on delivery and conversion.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    tenantId,
    growthGoalId: (goal?.id as string | null) ?? null,
    monthlyReportId: (reportRow?.id as string | null) ?? monthlyReportId ?? null,
    periodStart,
    periodEnd,
    packageTier,
    status: "draft" as PlanStatus,
    leadGapSummary,
    selectedActions: selected,
    rationale,
    expectedImpact,
    requiredInputs,
    risks,
  };
}
