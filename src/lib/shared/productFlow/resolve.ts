/**
 * Product Flow Orchestration V1 — pure resolver.
 *
 * Given a GrowthIntelligenceSnapshot, derives lifecycle stage, automation
 * checklist, review gates, blockers, and client/operator copy.
 *
 * Pure. No DB, no fetching. Safe to import from client and server.
 */
import type {
  GrowthIntelligenceSnapshot,
  ModuleStatus,
} from "@/lib/shared/growthIntelligence/schemas";
import {
  CLIENT_VISIBLE_COPY,
  LIFECYCLE_LABELS,
  LIFECYCLE_PROGRESS,
  PRODUCT_FLOW_SCHEMA_VERSION,
  type AutomationChecklistItem,
  type AutomationStatus,
  type ClientLifecycleStage,
  type ProductFlowBlocker,
  type ProductFlowState,
  type ReviewGateState,
} from "./schemas";

const isPresent = (s: ModuleStatus) =>
  s === "available" || s === "reviewed" || s === "connected";
const isReviewed = (s: ModuleStatus) =>
  s === "reviewed" || s === "connected";

function moduleToAutomation(s: ModuleStatus): AutomationStatus {
  switch (s) {
    case "missing":
    case "placeholder":
      return "not_started";
    case "partial":
      return "partial";
    case "available":
    case "reviewed":
    case "connected":
      return "complete";
  }
}

export function resolveProductFlowState(
  snapshot: GrowthIntelligenceSnapshot,
): ProductFlowState {
  const {
    goal,
    business,
    tone,
    website,
    pages,
    market,
    competitors,
    gbp,
    tracking,
    ranking,
    masterplan,
    wordpress,
  } = snapshot;

  // ---------- Lifecycle derivation ----------
  let lifecycleStage: ClientLifecycleStage;

  const hasGoal = goal.status !== "missing";
  const hasSite = !!website.siteUrl;
  const coreIntelligenceReady =
    isPresent(website.status) &&
    isPresent(pages.status) &&
    isPresent(market.status) &&
    business.status !== "missing" &&
    tone.status !== "missing";

  const needsOperatorReview =
    business.status === "placeholder" ||
    business.status === "partial" ||
    tone.status === "placeholder" ||
    tone.status === "partial" ||
    competitors.status === "partial" ||
    gbp.status === "partial" ||
    gbp.status === "available"; // available = collected, not yet reviewed

  const hasMasterplan = masterplan.status !== "missing" && !!masterplan.masterplanId;
  const blueprintReady =
    coreIntelligenceReady &&
    isReviewed(business.status) &&
    isReviewed(tone.status);

  if (!hasGoal || !hasSite) {
    lifecycleStage = "onboarding";
  } else if (!coreIntelligenceReady) {
    lifecycleStage = "collecting_intelligence";
  } else if (needsOperatorReview && !blueprintReady) {
    lifecycleStage = "operator_review";
  } else if (hasMasterplan) {
    lifecycleStage = "masterplan_ready";
  } else if (blueprintReady) {
    lifecycleStage = "blueprint_ready";
  } else {
    lifecycleStage = "operator_review";
  }

  // execution_ready: masterplan exists + no critical blockers
  if (
    lifecycleStage === "masterplan_ready" &&
    coreIntelligenceReady &&
    masterplan.activeItems > 0
  ) {
    lifecycleStage = "execution_ready";
  }

  // ---------- Automation checklist ----------
  const automationChecklist: AutomationChecklistItem[] = [
    {
      key: "goal",
      label: "Growth goal captured",
      status: hasGoal ? "complete" : "not_started",
      sourceModule: "goal",
      href: "/settings/growth-goal",
    },
    {
      key: "site",
      label: "Site connected",
      status: hasSite ? "complete" : "not_started",
      sourceModule: "website",
      href: "/sites",
    },
    {
      key: "audit",
      label: "Site audit",
      status: moduleToAutomation(website.status),
      sourceModule: "website",
      href: "/sites",
    },
    {
      key: "page_intelligence",
      label: "Page intelligence",
      status: moduleToAutomation(pages.status),
      sourceModule: "pages",
      href: "/growth/intelligence",
    },
    {
      key: "business_profile",
      label: "Business profile drafted",
      status: moduleToAutomation(business.status),
      sourceModule: "business",
      href: "/settings/business-profile",
    },
    {
      key: "tone_profile",
      label: "Tone profile drafted",
      status: moduleToAutomation(tone.status),
      sourceModule: "tone",
      href: "/settings/tone-profile",
    },
    {
      key: "market_scan",
      label: "Market scan",
      status: moduleToAutomation(market.status),
      sourceModule: "market",
      href: "/growth/intelligence",
    },
    {
      key: "competitor_scan",
      label: "Competitor scan",
      status: moduleToAutomation(competitors.status),
      sourceModule: "competitors",
      reason: competitors.warnings[0],
      href: "/growth/intelligence",
    },
    {
      key: "gbp",
      label: "GBP profile collected",
      status: moduleToAutomation(gbp.status),
      sourceModule: "gbp",
      href: "/growth/gbp",
    },
    {
      key: "snapshot",
      label: "Growth Intelligence Snapshot",
      status: snapshot.status.overall === "ready" ? "complete" : "partial",
      sourceModule: "snapshot",
      href: "/growth/intelligence",
    },
    {
      key: "blueprint",
      label: "Blueprint draft",
      status: blueprintReady ? "complete" : coreIntelligenceReady ? "partial" : "not_started",
      sourceModule: "blueprint",
      href: "/growth/blueprint",
    },
    {
      key: "masterplan",
      label: "Masterplan generated",
      status: hasMasterplan ? "complete" : "not_started",
      sourceModule: "masterplan",
      href: "/growth/masterplan",
    },
    {
      key: "tracking",
      label: "Tracking + analytics",
      status: moduleToAutomation(tracking.status),
      sourceModule: "tracking",
      reason: "Required for the monthly loop, not for Blueprint.",
    },
    {
      key: "ranking",
      label: "Ranking baseline",
      status: ranking.rankingBaselineAvailable ? "complete" : "not_started",
      sourceModule: "ranking",
      reason: "Required for the monthly loop, not for Blueprint.",
    },
    {
      key: "wordpress",
      label: "WordPress connection",
      status: moduleToAutomation(wordpress.status),
      sourceModule: "wordpress",
      href: "/sites",
      reason:
        wordpress.status === "missing" || wordpress.status === "placeholder"
          ? "Connect a WordPress site to enable delivery."
          : wordpress.inventoryCount > 0
            ? `Inventory synced (${wordpress.inventoryCount} items) — ready for delivery.`
            : "Connected — sync inventory from the Sites page to enable delivery.",
    },
  ];

  // ---------- Review gates ----------
  function gateFrom(
    status: ModuleStatus,
    extraBlocked = false,
  ): ReviewGateState["status"] {
    if (extraBlocked) return "blocked";
    if (status === "missing" || status === "placeholder") return "not_ready";
    if (status === "partial" || status === "available") return "ready_for_review";
    return "approved"; // reviewed | connected
  }

  const reviewGates: ReviewGateState[] = [
    {
      gate: "business_profile",
      label: "Business profile",
      status: gateFrom(business.status),
      href: "/settings/business-profile",
      missing: business.missing,
    },
    {
      gate: "tone_profile",
      label: "Tone profile",
      status: gateFrom(tone.status),
      href: "/settings/tone-profile",
      missing: tone.missing,
    },
    {
      gate: "gbp_profile",
      label: "Google Business Profile",
      status: gateFrom(gbp.status),
      href: "/growth/gbp",
      missing: gbp.missing,
    },
    {
      gate: "intelligence_snapshot",
      label: "Intelligence Snapshot",
      status:
        snapshot.status.overall === "ready"
          ? "approved"
          : snapshot.status.overall === "missing"
            ? "not_ready"
            : "ready_for_review",
      href: "/growth/intelligence",
    },
    {
      gate: "blueprint",
      label: "Lead Engine Blueprint",
      status: blueprintReady ? "ready_for_review" : "not_ready",
      href: "/growth/blueprint",
      reason: blueprintReady ? undefined : "Waiting on reviewed business/tone profiles.",
    },
    {
      gate: "masterplan",
      label: "Masterplan",
      status: hasMasterplan ? "ready_for_review" : "not_ready",
      href: "/growth/masterplan",
      reason: hasMasterplan ? undefined : "Generate from blueprint + goal.",
    },
    {
      gate: "execution_artifacts",
      label: "Execution artifacts",
      status: "not_ready",
      href: "/growth/execution",
      reason: "Execution Task Engine ships in the next sprint.",
    },
    {
      gate: "publishing_bundle",
      label: "Publishing bundle",
      status: "not_ready",
      reason: "Requires WordPress connection + execution artifacts.",
    },
  ];

  // ---------- Blockers ----------
  const blockers: ProductFlowBlocker[] = [];
  if (!hasGoal) {
    blockers.push({
      key: "no_goal",
      label: "No growth goal",
      severity: "critical",
      reason: "Every downstream layer needs an anchor goal.",
      href: "/settings/growth-goal",
    });
  }
  if (!hasSite) {
    blockers.push({
      key: "no_site",
      label: "No site connected",
      severity: "critical",
      reason: "Audit, page intelligence and blueprint all need a site.",
      href: "/sites",
    });
  }
  if (competitors.status === "partial" && competitors.warnings.length > 0) {
    blockers.push({
      key: "competitor_partial",
      label: "Competitor scan partial",
      severity: "medium",
      reason: competitors.warnings[0],
      href: "/growth/intelligence",
    });
  }
  if (business.status === "placeholder") {
    blockers.push({
      key: "business_placeholder",
      label: "Business profile is placeholder",
      severity: "high",
      reason: "Operator must review before Blueprint can be approved.",
      href: "/settings/business-profile",
    });
  }

  // ---------- Operator status string ----------
  const operatorBits: string[] = [];
  operatorBits.push(`market ${market.status}`);
  operatorBits.push(`competitors ${competitors.status}`);
  operatorBits.push(`gbp ${gbp.status}`);
  operatorBits.push(`business ${business.status}`);
  operatorBits.push(`tone ${tone.status}`);
  operatorBits.push(`tracking ${tracking.status}`);
  if (hasMasterplan) {
    operatorBits.push(`masterplan ${masterplan.activeItems} active`);
  } else {
    operatorBits.push("masterplan missing");
  }
  const operatorStatus = operatorBits.join(" · ");

  return {
    tenantId: snapshot.tenantId,
    siteId: snapshot.siteId,
    growthGoalId: snapshot.growthGoalId,
    generatedAt: new Date().toISOString(),
    schemaVersion: PRODUCT_FLOW_SCHEMA_VERSION,

    lifecycleStage,
    lifecycleLabel: LIFECYCLE_LABELS[lifecycleStage],
    progressPercent: LIFECYCLE_PROGRESS[lifecycleStage],

    primaryNextAction: snapshot.status.nextBestAction,
    secondaryActions: snapshot.nextActions.filter(
      (a) => a.type !== snapshot.status.nextBestAction.type,
    ),

    automationChecklist,
    reviewGates,
    blockers,

    clientVisibleStatus: CLIENT_VISIBLE_COPY[lifecycleStage],
    operatorStatus,
  };
}
