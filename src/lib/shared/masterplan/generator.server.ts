/**
 * Masterplan V2 — deterministic strategy generator.
 *
 * Reads active growth goal + BPv2 + page intelligence + latest audit and
 * produces lead math, summary, missing-context list, and a phased set of
 * masterplan items covering: tracking, service_page, location_page,
 * gbp, review, conversion, content, reporting, website_fix.
 *
 * V2 changes:
 *  - Plan copy is English (business/brand-facing).
 *  - Each item gets `metadata.phase` (first_30_days | days_31_60 | days_61_90 | backlog).
 *  - Service items carry lead intent scores; existing high-intent pages
 *    outrank lower-intent new builds.
 *  - Per-phase focus limits push overflow to backlog.
 *  - Manual items carry English `playbookSteps`.
 *  - Confidence is recalibrated and explained via `confidenceReasons`.
 */

import type {
  MasterplanItemPriority,
  MasterplanItemType,
  LeadMath,
} from "./schemas";
import { rankAuditIssues, groupAuditIssuesByCategory } from "./auditPriorityMapping";
import {
  analyzeGoalInputQuality,
  type GoalQualityReport,
  type GoalQualityWarning,
} from "./inputQuality";
import {
  assignPhase,
  applyPhaseLimits,
  scoreServiceIntent,
  type MasterplanPhase,
  type ServiceIntentScore,
} from "./phasing";
import {
  TRACKING_PLAYBOOK,
  GBP_PLAYBOOK,
  REVIEW_PLAYBOOK,
  REPORTING_PLAYBOOK,
  CONVERSION_PLAYBOOK,
} from "./playbooks";

/** Per-item readiness — read by Execution Board + proposal generator. */
export type ItemReadiness = "ready" | "needs_context" | "manual_task" | "blocked";

export interface ItemMetadata {
  readiness?: ItemReadiness;
  needsContext?: boolean;
  missingContext?: string[];
  successMetric?: string;
  playbookSteps?: string[];
  linkedService?: string;
  linkedLocation?: string;
  goalContribution?: string;
  evidence?: Array<{ source: string; reason: string }>;
  phase?: MasterplanPhase;
  priorityReason?: string;
  intentScore?: ServiceIntentScore;
  isExistingPage?: boolean;
  [key: string]: unknown;
}

export type GeneratorContext = {
  tenantId: string;
  goal: {
    id: string;
    targetType: string;
    targetCount: number | null;
    currentCount: number | null;
    timeframeMonths: number | null;
    leadValue: number | null;
    closeRate: number | null;
    requiredLeads: number | null;
    serviceFocus: string[];
    locations: string[];
    trackingNotes: string | null;
    capacityNotes: string | null;
    goodFitLeads?: string[];
    badFitLeads?: string[];
  };
  businessProfile: {
    offerProfile?: Record<string, unknown>;
    locationProfile?: Record<string, unknown>;
    conversionProfile?: Record<string, unknown>;
    proofProfile?: Record<string, unknown>;
    businessIdentity?: Record<string, unknown>;
  } | null;
  pageIntel: Array<{
    pageId: string | null;
    pageUrl: string | null;
    pageType: string;
    primaryTopic: string | null;
    targetKeyword: string | null;
  }>;
  audit: {
    id: string | null;
    issueCodes: string[];
  };
};

export type GeneratedItem = {
  type: MasterplanItemType;
  title: string;
  description: string | null;
  reason: string;
  priority: MasterplanItemPriority;
  effort: "low" | "medium" | "high";
  expectedImpact: "low" | "medium" | "high";
  source: "goal" | "audit" | "business_profile" | "page_intelligence" | "ai" | "operator";
  linkedPageId?: string | null;
  metadata?: ItemMetadata;
};

export interface ConfidenceReason {
  signal: string;
  delta: number; // signed contribution
  detail: string;
}

export type GenerationResult = {
  summary: string;
  strategySummary: string;
  leadMath: LeadMath;
  mainConstraints: string[];
  missingContext: string[];
  items: GeneratedItem[];
  confidence: number;
  generatedFrom: Record<string, unknown>;
  qualityWarnings: GoalQualityWarning[];
  inputQuality: GoalQualityReport;
  confidenceReasons: ConfidenceReason[];
};

function findExistingServicePage(
  focus: string,
  pages: GeneratorContext["pageIntel"],
): GeneratorContext["pageIntel"][number] | null {
  const f = focus.toLowerCase();
  return (
    pages.find((p) => {
      if (p.pageType !== "service") return false;
      const hay = `${p.primaryTopic ?? ""} ${p.targetKeyword ?? ""} ${p.pageUrl ?? ""}`.toLowerCase();
      return hay.includes(f);
    }) ?? null
  );
}

function hasLocationPageForArea(area: string, pages: GeneratorContext["pageIntel"]): boolean {
  const a = area.toLowerCase();
  return pages.some((p) => {
    if (p.pageType !== "location" && p.pageType !== "service") return false;
    const hay = `${p.primaryTopic ?? ""} ${p.targetKeyword ?? ""} ${p.pageUrl ?? ""}`.toLowerCase();
    return hay.includes(a);
  });
}

export function generateMasterplanV1(ctx: GeneratorContext): GenerationResult {
  const items: GeneratedItem[] = [];
  const missingContext: string[] = [];
  const mainConstraints: string[] = [];

  // Lead math
  const targetCount = ctx.goal.targetCount;
  const closeRate = ctx.goal.closeRate;
  const requiredLeads = ctx.goal.requiredLeads;
  const currentCount = ctx.goal.currentCount;
  const leadGap =
    typeof targetCount === "number" && typeof currentCount === "number"
      ? Math.max(0, targetCount - currentCount)
      : null;

  const leadMath: LeadMath = {
    targetCount: targetCount ?? null,
    currentCount: currentCount ?? null,
    closeRate: closeRate ?? null,
    requiredLeads: requiredLeads ?? null,
    leadGap,
    leadValue: ctx.goal.leadValue ?? null,
    timeframeMonths: ctx.goal.timeframeMonths ?? null,
  };

  if (targetCount == null) missingContext.push("target count missing");
  if (closeRate == null) missingContext.push("close rate missing");
  if (currentCount == null) missingContext.push("current lead flow unknown");
  if (ctx.goal.serviceFocus.length === 0) missingContext.push("no service focus");
  if (ctx.goal.locations.length === 0) missingContext.push("no locations");
  if (!ctx.goal.trackingNotes || !ctx.goal.trackingNotes.trim()) {
    missingContext.push("tracking status unknown");
  }
  if (!ctx.businessProfile) missingContext.push("business profile not filled");

  const inputQuality = analyzeGoalInputQuality({
    goal: {
      service_focus: ctx.goal.serviceFocus,
      locations: ctx.goal.locations,
      close_rate: ctx.goal.closeRate,
      tracking_notes: ctx.goal.trackingNotes,
      current_count: ctx.goal.currentCount,
      good_fit_leads: ctx.goal.goodFitLeads ?? [],
      bad_fit_leads: ctx.goal.badFitLeads ?? [],
    },
    bp: ctx.businessProfile
      ? {
          business_identity:
            (ctx.businessProfile as Record<string, unknown>).businessIdentity ??
            (ctx.businessProfile as Record<string, unknown>).business_identity ??
            {},
        }
      : null,
  });
  for (const w of inputQuality.warnings) missingContext.push(`${w.code}: ${w.message}`);

  // Proof / GBP context awareness — pulled from business profile if present.
  const proofProfile = (ctx.businessProfile?.proofProfile ?? {}) as Record<string, unknown>;
  const proofIsWeak = !proofProfile || Object.keys(proofProfile).length === 0;
  if (proofIsWeak) {
    missingContext.push(
      "proof_gaps: verified reviews, licenses/certifications, and service guarantees are not confirmed.",
    );
  }
  // GBP status is not modeled separately yet — treat as unknown for confidence.
  const gbpUnknown = true;

  const targetLabel = `${targetCount ?? "?"} ${ctx.goal.targetType}/month`;

  // -------------------------------------------------------------------------
  // A. Tracking — first 30 days foundation.
  // -------------------------------------------------------------------------
  const trackingUnknown = inputQuality.trackingQuality === "unknown";
  items.push({
    type: "tracking",
    title: "Set up call and form tracking",
    description:
      "Make sure every incoming lead (call, form, WhatsApp, chat) is measured with source attribution.",
    reason: trackingUnknown
      ? `Without tracking we cannot prove progress toward ${targetLabel}.`
      : "Tracking is noted; verify the setup and connect it to the lead inbox.",
    priority: trackingUnknown ? "critical" : "high",
    effort: "medium",
    expectedImpact: "high",
    source: trackingUnknown ? "goal" : "operator",
    metadata: {
      readiness: "manual_task",
      goalContribution: `Makes progress toward ${targetLabel} measurable.`,
      successMetric: "Every incoming lead has a source + attribution field.",
      playbookSteps: TRACKING_PLAYBOOK,
      evidence: [
        {
          source: "Growth Goal",
          reason: trackingUnknown ? "tracking_notes is empty" : "tracking_notes filled",
        },
      ],
    },
  });
  if (trackingUnknown) mainConstraints.push("No measurable lead attribution.");

  // -------------------------------------------------------------------------
  // B. Service items — scored, with existing-page vs missing-page logic.
  //    Eligibility guard: a service is "explicitly prioritized" only if it
  //    appears in goal.service_focus OR BP.offerProfile.highValueOffers.
  //    Seasonal heating gets demoted in assignPhase regardless of intent score.
  // -------------------------------------------------------------------------
  const offerProfile = (ctx.businessProfile?.offerProfile ?? {}) as Record<string, unknown>;
  const highValueOffers = Array.isArray(offerProfile.highValueOffers)
    ? (offerProfile.highValueOffers as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const secondaryOffers = Array.isArray(offerProfile.secondaryOffers)
    ? (offerProfile.secondaryOffers as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const norm = (s: string) => s.trim().toLowerCase();
  const goalServiceSet = new Set(ctx.goal.serviceFocus.map(norm));
  const highValueSet = new Set(highValueOffers.map(norm));
  const secondarySet = new Set(secondaryOffers.map(norm));
  function isExplicitlyPrioritized(service: string): boolean {
    const n = norm(service);
    return goalServiceSet.has(n) || highValueSet.has(n);
  }
  function isKnownOffer(service: string): boolean {
    const n = norm(service);
    return goalServiceSet.has(n) || highValueSet.has(n) || secondarySet.has(n);
  }

  if (inputQuality.serviceQuality === "specific") {
    for (const focus of inputQuality.specificServices.slice(0, 6)) {
      const existing = findExistingServicePage(focus, ctx.pageIntel);
      const primaryLoc = inputQuality.specificLocations[0];
      const intent = scoreServiceIntent(focus);
      const explicitlyPrioritized = isExplicitlyPrioritized(focus);
      const inferred = !isKnownOffer(focus);

      const guardMeta: Record<string, unknown> = {
        explicitlyPrioritized,
        inferredService: inferred,
      };
      if (inferred) {
        guardMeta.needsConfirmation = true;
        guardMeta.priorityGuardReason =
          "Service not confirmed in growth goal or Business Profile high-value offers.";
      }
      if (intent.category === "seasonal_heating") {
        guardMeta.seasonalHeating = true;
        guardMeta.priorityGuardReason = explicitlyPrioritized
          ? "Heating service confirmed but seasonal — scheduled before heating season, not first 30 days."
          : "Heating service not confirmed as a high-value offer — backlog.";
      }

      // Effective priority: cap at medium for inferred/seasonal-heating-without-explicit.
      const intentPriority: MasterplanItemPriority =
        intent.leadIntent >= 8 ? "high" : intent.leadIntent >= 6 ? "medium" : "low";
      const cappedPriority: MasterplanItemPriority =
        inferred || (intent.category === "seasonal_heating" && !explicitlyPrioritized)
          ? "low"
          : intent.category === "seasonal_heating"
            ? "medium"
            : intentPriority;

      if (!existing) {
        const title = primaryLoc
          ? `Build ${focus} page for ${primaryLoc}`
          : `Build service page: ${focus}`;
        items.push({
          type: "service_page",
          title,
          description: `Create a dedicated page for "${focus}" with a clear USP, proof and a direct CTA${
            primaryLoc ? ` focused on ${primaryLoc}` : ""
          }.`,
          reason: `${intent.reason} Directly contributes to ${targetLabel}.`,
          priority: cappedPriority,
          effort: "medium",
          expectedImpact: intent.value >= 8 ? "high" : "medium",
          source: "goal",
          metadata: {
            readiness: "ready",
            linkedService: focus,
            linkedLocation: primaryLoc,
            intentScore: intent,
            isExistingPage: false,
            ...guardMeta,
            goalContribution: `Captures search intent for "${focus}" and routes to the primary CTA.`,
            successMetric:
              "Page live + at least 1 qualified lead per month attributed to this page.",
            evidence: [
              { source: "Growth Goal", reason: `service_focus contains "${focus}"` },
              ...(primaryLoc
                ? [{ source: "Growth Goal", reason: `locations contains "${primaryLoc}"` }]
                : []),
            ],
          },
        });
      } else {
        items.push({
          type: "website_fix",
          title: `Optimize service page: ${focus}`,
          description:
            "Existing page found — improve CTA, schema, internal links and proof to convert existing traffic.",
          reason: `${intent.reason} Page already exists; optimization is the fastest path to leads.`,
          priority: cappedPriority,
          effort: "low",
          expectedImpact: intent.leadIntent >= 8 ? "high" : "medium",
          source: "page_intelligence",
          linkedPageId: existing.pageId,
          metadata: {
            readiness: "ready",
            linkedService: focus,
            intentScore: intent,
            isExistingPage: true,
            ...guardMeta,
            goalContribution: `Lifts conversion on the existing "${focus}" page without extra traffic.`,
            evidence: [
              { source: "Page Intelligence", reason: `existing page found for "${focus}"` },
            ],
          },
        });
      }
    }
  } else {
    items.push({
      type: "website_fix",
      title: "Define high-value service offers before building service pages",
      description:
        "Service page planning needs 2–5 specific services (not broad labels like 'leadgen' or 'marketing').",
      reason:
        "Service items built on broad labels become generic pages with no search intent or CTA direction.",
      priority: "high",
      effort: "low",
      expectedImpact: "high",
      source: "goal",
      metadata: {
        readiness: "needs_context",
        needsContext: true,
        missingContext: ["specific_services"],
        playbookSteps: [
          "Pick 2–5 concrete services with clear sales or margin value.",
          "For each service: note audience, typical price band, and trigger.",
          "Replace broad labels in the growth goal (leadgen, marketing, SEO).",
          "Mark done once service_focus contains only concrete services.",
        ],
        evidence: [
          {
            source: "Input Quality",
            reason:
              inputQuality.serviceQuality === "missing"
                ? "service_focus is empty"
                : `service_focus only broad labels: ${inputQuality.broadServices.join(", ")}`,
          },
        ],
      },
    });
    mainConstraints.push("Service focus is not concrete enough for execution.");
  }

  // -------------------------------------------------------------------------
  // C. Location pages — phased by order, overflow goes to backlog.
  // -------------------------------------------------------------------------
  if (inputQuality.locationQuality === "specific") {
    let locIndex = 0;
    for (const loc of inputQuality.specificLocations.slice(0, 6)) {
      const exists = hasLocationPageForArea(loc, ctx.pageIntel);
      if (!exists) {
        items.push({
          type: "location_page",
          title: `Build location page: ${loc}`,
          description: `Local landing page for "${loc}" with service-area context, local proof and directions.`,
          reason:
            locIndex === 0
              ? "Primary city — start expanding local visibility here after foundation is set."
              : locIndex <= 2
                ? "Priority city — second or third expansion target."
                : "Additional city — phased after primary cities convert.",
          priority: locIndex === 0 ? "medium" : "low",
          effort: "medium",
          expectedImpact: locIndex === 0 ? "medium" : "low",
          source: "goal",
          metadata: {
            readiness: "ready",
            linkedLocation: loc,
            locationIndex: locIndex,
            goalContribution: `Local visibility in ${loc} for service search and Maps.`,
            successMetric: `Page live + GBP link + at least 1 local lead per month from ${loc}.`,
            evidence: [{ source: "Growth Goal", reason: `locations contains "${loc}"` }],
          },
        });
        locIndex++;
      }
    }
  } else if (ctx.goal.locations.length > 0) {
    items.push({
      type: "location_page",
      title: "Define specific target cities or service areas",
      description:
        "Location pages need concrete cities / states / metros — a country or market is not a local page.",
      reason:
        "With only broad locations ('USA', 'Netherlands') we cannot build local relevance or link GBP.",
      priority: "high",
      effort: "low",
      expectedImpact: "medium",
      source: "goal",
      metadata: {
        readiness: "needs_context",
        needsContext: true,
        missingContext: ["specific_locations"],
        playbookSteps: [
          "Pick 2–5 concrete cities or states where you want to win leads.",
          "Optional: add metro areas or regions (e.g. 'Dallas–Fort Worth metro').",
          "Replace country-level entries in the growth goal.",
          "Mark done once locations only contain concrete places.",
        ],
        evidence: [
          {
            source: "Input Quality",
            reason: `locations is country-level: ${inputQuality.broadLocations.join(", ")}`,
          },
        ],
      },
    });
    mainConstraints.push("Locations are still country-level — no local pages possible.");
  }

  // -------------------------------------------------------------------------
  // D. GBP — manual task with operational playbook.
  // -------------------------------------------------------------------------
  items.push({
    type: "gbp",
    title: "Review and optimize Google Business Profile",
    description:
      "Audit NAP, categories, services, photos, posts and review responses. Align with primary service + region.",
    reason:
      "GBP is often the highest-ROI local lead channel — current status is unknown and must be confirmed first.",
    priority: "high",
    effort: "low",
    expectedImpact: "high",
    source: "ai",
    metadata: {
      readiness: "manual_task",
      goalContribution: "Lifts local visibility and direct lead actions (call, directions, visit).",
      playbookSteps: GBP_PLAYBOOK,
    },
  });

  // -------------------------------------------------------------------------
  // E. Review flow — manual playbook.
  // -------------------------------------------------------------------------
  items.push({
    type: "review",
    title: "Set up review request flow",
    description:
      "Build an automated review request after job completion (email/SMS), aimed at Google reviews.",
    reason: "Reviews lift GBP ranking and visitor-to-lead conversion.",
    priority: "medium",
    effort: "low",
    expectedImpact: "medium",
    source: "ai",
    metadata: {
      readiness: "manual_task",
      goalContribution: "Reviews feed GBP ranking and social proof on service / location pages.",
      playbookSteps: REVIEW_PLAYBOOK,
    },
  });

  // -------------------------------------------------------------------------
  // F. Conversion — primary CTA + lead path.
  // -------------------------------------------------------------------------
  const conversionUnknown = trackingUnknown;
  items.push({
    type: "conversion",
    title: "Improve primary website CTA and lead path",
    description:
      "Audit primary CTA, contact form, click-to-call and lead confirmation. Reduce friction on high-intent pages.",
    reason: conversionUnknown
      ? "Without clear conversion paths, traffic leaks before becoming a lead."
      : "Conversion paths exist; refinement lifts lead yield with no extra traffic.",
    priority: conversionUnknown ? "high" : "medium",
    effort: "medium",
    expectedImpact: "high",
    source: "ai",
    metadata: {
      readiness: "ready",
      goalContribution: `Lifts lead yield on existing traffic toward ${targetLabel}.`,
      successMetric: "Measurable lift in form submits / calls on the primary conversion page.",
      playbookSteps: CONVERSION_PLAYBOOK,
    },
  });

  // -------------------------------------------------------------------------
  // G. Content cluster — only if services are concrete.
  // -------------------------------------------------------------------------
  if (inputQuality.serviceQuality === "specific") {
    items.push({
      type: "content",
      title: "Plan supporting content for top services",
      description:
        "Cluster of FAQ + how-to + case content around the top services, internally linked to service pages.",
      reason:
        "Supporting content strengthens service-page authority and captures long-tail intent.",
      priority: "low",
      effort: "medium",
      expectedImpact: "medium",
      source: "ai",
      metadata: {
        readiness: "ready",
        linkedService: inputQuality.specificServices[0],
        goalContribution:
          "Captures long-tail demand around the main services and internal-links to them.",
      },
    });
  }

  // -------------------------------------------------------------------------
  // H. Reporting — monthly loop.
  // -------------------------------------------------------------------------
  items.push({
    type: "reporting",
    title: "Create monthly progress reporting against the lead goal",
    description:
      "Monthly dashboard with leads, source attribution, conversion and progress vs the goal.",
    reason: "Without reporting there is no feedback loop between execution and the goal.",
    priority: "medium",
    effort: "low",
    expectedImpact: "medium",
    source: "ai",
    metadata: {
      readiness: "manual_task",
      goalContribution: `Makes progress toward ${targetLabel} visible and actionable.`,
      playbookSteps: REPORTING_PLAYBOOK,
    },
  });

  // -------------------------------------------------------------------------
  // I. Website fixes from audit.
  // -------------------------------------------------------------------------
  const grouped = groupAuditIssuesByCategory(ctx.audit.issueCodes);
  const contentIssues = grouped.content ?? [];
  const ranked = rankAuditIssues(ctx.audit.issueCodes);

  if (contentIssues.length > 2) {
    items.push({
      type: "website_fix",
      title: `Editorial sprint: fix ${contentIssues.length} content issues`,
      description: `Bundle: ${contentIssues.map((i) => i.label).slice(0, 5).join("; ")}${
        contentIssues.length > 5 ? "; …" : ""
      }.`,
      reason:
        "Resolving multiple content issues one-by-one fragments effort — bundle them as one editorial sprint.",
      priority: "high",
      effort: "medium",
      expectedImpact: "high",
      source: "audit",
      metadata: {
        readiness: "ready",
        issueCodes: contentIssues.map((i) => i.code),
        auditId: ctx.audit.id,
        category: "content",
        evidence: [{ source: "Audit", reason: `${contentIssues.length} content issues found` }],
      },
    });
  }

  const individualIssues =
    contentIssues.length > 2 ? ranked.filter((i) => i.category !== "content") : ranked;
  for (const issue of individualIssues.slice(0, 5)) {
    items.push({
      type: "website_fix",
      title: `Resolve: ${issue.label}`,
      description: `Audit issue ${issue.code} (${issue.category}). ${issue.rationale}`,
      reason: issue.rationale,
      priority: issue.priority,
      effort: issue.effort,
      expectedImpact: issue.impact,
      source: "audit",
      metadata: {
        readiness: "ready",
        issueCode: issue.code,
        auditId: ctx.audit.id,
        category: issue.category,
        severity: issue.severity,
        evidence: [{ source: "Audit", reason: `issue ${issue.code} (${issue.severity})` }],
      },
    });
  }

  // Constraints
  if (ctx.goal.capacityNotes) mainConstraints.push(`Capacity: ${ctx.goal.capacityNotes}`);
  if (leadGap != null && leadGap > 0 && requiredLeads != null) {
    mainConstraints.push(
      `${leadGap} extra ${ctx.goal.targetType}/month needed → ~${requiredLeads} qualified leads/month.`,
    );
  }
  if (inputQuality.closeRateQuality === "high") {
    mainConstraints.push("Close rate is high — validate against real sales data.");
  }

  // -------------------------------------------------------------------------
  // Phase assignment pass — attach metadata.phase + priorityReason to every item.
  // -------------------------------------------------------------------------
  for (const it of items) {
    const md = (it.metadata ?? {}) as ItemMetadata;
    const intent =
      md.intentScore ??
      (it.type === "service_page" && typeof md.linkedService === "string"
        ? scoreServiceIntent(md.linkedService)
        : null);
    const phaseResult = assignPhase({
      type: it.type,
      priority: it.priority,
      metadata: md,
      isExistingPage: md.isExistingPage === true,
      intent,
      locationIndex:
        typeof md.locationIndex === "number" ? md.locationIndex : undefined,
      needsContext: md.needsContext === true,
    });
    it.metadata = {
      ...md,
      phase: phaseResult.phase,
      priorityReason: phaseResult.reason,
      intentScore: intent ?? md.intentScore,
    };
  }

  // Apply per-phase focus limits — overflow demoted to backlog.
  const phased = applyPhaseLimits(
    items.map((it) => ({
      phase: (it.metadata?.phase ?? "backlog") as MasterplanPhase,
      priority: it.priority,
      intent: (it.metadata?.intentScore as ServiceIntentScore | null) ?? null,
      ref: it,
    })),
  );
  for (const p of phased) {
    if (p.ref.metadata) p.ref.metadata.phase = p.phase;
  }

  // -------------------------------------------------------------------------
  // Summary + strategy summary (English).
  // -------------------------------------------------------------------------
  const goalLine =
    targetCount != null
      ? `${targetCount} ${ctx.goal.targetType}/month${
          ctx.goal.timeframeMonths ? ` within ${ctx.goal.timeframeMonths} months` : ""
        }`
      : "growth goal (target not yet set)";
  const leadLine =
    requiredLeads != null && closeRate != null
      ? `At ${(closeRate * 100).toFixed(0)}% close rate ≈ ${requiredLeads} qualified leads/month.`
      : "Lead math incomplete — set target and close rate to compute lead volume.";
  const summary = `Goal: ${goalLine}. ${leadLine}`;

  const strategySummary = [
    trackingUnknown
      ? "First make it measurable (tracking)."
      : "Tracking is mostly in place — validate and connect to the inbox.",
    inputQuality.serviceQuality === "specific"
      ? `Build or strengthen pages for ${inputQuality.specificServices.slice(0, 3).join(", ")}.`
      : "Define concrete services before page strategy can start.",
    inputQuality.locationQuality === "specific"
      ? `Local visibility for ${inputQuality.specificLocations.slice(0, 3).join(", ")} via GBP + location pages.`
      : "Local strategy not set — add concrete cities/states.",
    "Then conversion optimization + monthly reporting against the goal.",
  ].join(" ");

  // -------------------------------------------------------------------------
  // Confidence — recalibrated. Starts at 0.95 and is reduced by missing signals.
  // -------------------------------------------------------------------------
  const reasons: ConfidenceReason[] = [];
  let confidence = 0.95;

  function penalize(signal: string, delta: number, detail: string) {
    confidence += delta;
    reasons.push({ signal, delta, detail });
  }

  if (targetCount == null) penalize("target_count_missing", -0.1, "Target count is missing.");
  if (closeRate == null) penalize("close_rate_missing", -0.1, "Close rate is missing.");
  if (currentCount == null)
    penalize("current_count_missing", -0.05, "Current lead flow is unknown.");
  if (inputQuality.serviceQuality !== "specific")
    penalize(
      "service_focus_weak",
      -0.15,
      "Service focus is missing or too generic — page strategy cannot be concrete.",
    );
  if (inputQuality.locationQuality !== "specific" && ctx.goal.locations.length > 0)
    penalize(
      "locations_broad",
      -0.1,
      "Locations are country-level — local pages and GBP alignment are impossible.",
    );
  else if (inputQuality.locationQuality === "missing")
    penalize("locations_missing", -0.1, "No locations defined on the goal.");
  if (inputQuality.trackingQuality === "unknown")
    penalize("tracking_unknown", -0.1, "Lead tracking is not documented.");
  if (!ctx.businessProfile)
    penalize("business_profile_missing", -0.1, "Business Profile is not filled.");
  else {
    const identity = (ctx.businessProfile.businessIdentity ?? {}) as Record<string, unknown>;
    if (!identity.industry && !identity.vertical)
      penalize("vertical_missing", -0.08, "Vertical / industry missing on Business Profile.");
  }
  if (proofIsWeak)
    penalize(
      "proof_weak",
      -0.07,
      "Verified reviews, licenses and guarantees are not confirmed — claim safety is limited.",
    );
  if (gbpUnknown)
    penalize("gbp_unknown", -0.05, "Google Business Profile status not yet confirmed.");
  if (ctx.pageIntel.length === 0)
    penalize(
      "page_intel_empty",
      -0.05,
      "No Page Intelligence — cannot detect existing pages or local relevance.",
    );

  confidence = Math.max(0.1, Math.min(0.99, confidence));

  return {
    summary,
    strategySummary,
    leadMath,
    mainConstraints,
    missingContext,
    items,
    confidence: Number(confidence.toFixed(2)),
    generatedFrom: {
      goalId: ctx.goal.id,
      auditId: ctx.audit.id,
      pageIntelCount: ctx.pageIntel.length,
      hasBusinessProfile: !!ctx.businessProfile,
      inputReadiness: inputQuality.readiness,
      confidenceReasons: reasons,
      version: "masterplan_v2",
    },
    qualityWarnings: inputQuality.warnings,
    inputQuality,
    confidenceReasons: reasons,
  };
}
