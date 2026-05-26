/**
 * Masterplan V1 — deterministic generator.
 * Reads active growth goal + BPv2 + page intelligence + latest audit and
 * produces lead math, summary, missing-context list, and a seeded set of
 * masterplan items covering: tracking, service_page, location_page,
 * gbp, review, conversion, content, reporting, website_fix.
 *
 * V1 is deterministic — no LLM calls. Output is grounded in actual context.
 */

import type {
  MasterplanItemPriority,
  MasterplanItemType,
  LeadMath,
} from "./schemas";
import { rankAuditIssues, groupAuditIssuesByCategory } from "./auditPriorityMapping";
import {
  analyzeGoalInputQuality,
  isBroadLocation,
  isGenericService,
  type GoalQualityReport,
  type GoalQualityWarning,
} from "./inputQuality";

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
  // Free-form bag — generator may attach extra context.
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
  };
  businessProfile: {
    offerProfile?: Record<string, unknown>;
    locationProfile?: Record<string, unknown>;
    conversionProfile?: Record<string, unknown>;
    proofProfile?: Record<string, unknown>;
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
  metadata?: Record<string, unknown>;
};

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
};


function hasServicePageForFocus(focus: string, pages: GeneratorContext["pageIntel"]): boolean {
  const f = focus.toLowerCase();
  return pages.some((p) => {
    if (p.pageType !== "service") return false;
    const hay = `${p.primaryTopic ?? ""} ${p.targetKeyword ?? ""} ${p.pageUrl ?? ""}`.toLowerCase();
    return hay.includes(f);
  });
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

  if (targetCount == null) missingContext.push("target count ontbreekt");
  if (closeRate == null) missingContext.push("close rate ontbreekt");
  if (currentCount == null) missingContext.push("huidige leadflow onbekend");
  if (ctx.goal.serviceFocus.length === 0) missingContext.push("geen service focus");
  if (ctx.goal.locations.length === 0) missingContext.push("geen regio's");
  if (!ctx.goal.trackingNotes || !ctx.goal.trackingNotes.trim()) {
    missingContext.push("trackingstatus onbekend");
  }
  if (!ctx.businessProfile) missingContext.push("business profile niet ingevuld");

  // A. Tracking — always present, critical if unknown
  const trackingUnknown = !ctx.goal.trackingNotes || !ctx.goal.trackingNotes.trim();
  items.push({
    type: "tracking",
    title: "Set up call and form tracking",
    description:
      "Zorg dat elke binnenkomende lead (call, form, WhatsApp, chat) gemeten wordt met bron-attributie.",
    reason: trackingUnknown
      ? `Zonder tracking kunnen we niet bewijzen of het doel van ${targetCount ?? "?"} ${ctx.goal.targetType}/maand dichterbij komt.`
      : "Tracking is genoteerd; verifieer setup en koppel aan lead inbox.",
    priority: trackingUnknown ? "critical" : "high",
    effort: "medium",
    expectedImpact: "high",
    source: trackingUnknown ? "goal" : "operator",
  });
  if (trackingUnknown) mainConstraints.push("Geen meetbare lead-attributie");

  // B. Service pages per focus
  for (const focus of ctx.goal.serviceFocus.slice(0, 6)) {
    const exists = hasServicePageForFocus(focus, ctx.pageIntel);
    if (!exists) {
      items.push({
        type: "service_page",
        title: `Build service page: ${focus}`,
        description: `Maak een dedicated pagina voor "${focus}" met duidelijke USP, proof, en directe CTA.`,
        reason: `High-intent dienst die direct bijdraagt aan het doel van ${targetCount ?? "?"} ${ctx.goal.targetType}/maand.`,
        priority: "high",
        effort: "medium",
        expectedImpact: "high",
        source: "goal",
        metadata: { focus },
      });
    } else {
      items.push({
        type: "website_fix",
        title: `Optimize service page: ${focus}`,
        description: `Bestaande pagina gevonden — verbeter CTA, schema, intern linken en proof.`,
        reason: `Pagina bestaat; conversie- en SEO-optimalisatie geeft snelste lift.`,
        priority: "medium",
        effort: "low",
        expectedImpact: "medium",
        source: "page_intelligence",
        metadata: { focus },
      });
    }
  }

  // C. Location pages / local visibility
  for (const loc of ctx.goal.locations.slice(0, 5)) {
    const exists = hasLocationPageForArea(loc, ctx.pageIntel);
    if (!exists) {
      items.push({
        type: "location_page",
        title: `Build location page: ${loc}`,
        description: `Local landing voor "${loc}" met service-area context, lokale proof en routebeschrijving.`,
        reason: `Lokale zichtbaarheid vergroot Maps + lokale SERP en sluit aan op service area.`,
        priority: "medium",
        effort: "medium",
        expectedImpact: "medium",
        source: "goal",
        metadata: { location: loc },
      });
    }
  }

  // D. GBP — always (status unknown in V1)
  items.push({
    type: "gbp",
    title: "Review and optimize Google Business Profile",
    description:
      "Controleer NAP, categorieën, services, foto's, posts en reviewbeantwoording. Optimaliseer voor primaire dienst + regio.",
    reason: "GBP is voor lokale leadflow vaak het hoogste-ROI kanaal — status is onbekend.",
    priority: "high",
    effort: "low",
    expectedImpact: "high",
    source: "ai",
  });

  // E. Review flow
  items.push({
    type: "review",
    title: "Set up review request flow",
    description:
      "Bouw geautomatiseerd review-verzoek na afgeronde klus (e-mail/SMS), gericht op Google reviews.",
    reason: "Reviews verhogen GBP-ranking en conversie van bezoekers naar leads.",
    priority: "medium",
    effort: "low",
    expectedImpact: "medium",
    source: "ai",
  });

  // F. Conversion
  const conversionUnknown = trackingUnknown;
  items.push({
    type: "conversion",
    title: "Improve primary website CTA and lead path",
    description:
      "Audit primaire CTA, contactformulier, click-to-call en lead-bevestiging. Verlaag friction op high-intent pagina's.",
    reason: conversionUnknown
      ? "Zonder duidelijke conversiepaden lekt verkeer weg vóór het lead wordt."
      : "Conversiepaden bestaan; verfijnen verhoogt lead-yield zonder extra verkeer.",
    priority: conversionUnknown ? "high" : "medium",
    effort: "medium",
    expectedImpact: "high",
    source: "ai",
  });

  // G. Content — light, lower priority for V1
  if (ctx.goal.serviceFocus.length > 0) {
    items.push({
      type: "content",
      title: "Plan supporting content for top services",
      description:
        "Cluster van FAQ + how-to + case-content rondom de hoofd-diensten om intern te linken naar service pages.",
      reason: "Ondersteunende content versterkt service-pagina autoriteit en vangt long-tail intent.",
      priority: "low",
      effort: "medium",
      expectedImpact: "medium",
      source: "ai",
    });
  }

  // H. Reporting — always
  items.push({
    type: "reporting",
    title: "Create monthly progress reporting against lead goal",
    description:
      "Maandelijks dashboard met leads, bron-attributie, conversie en voortgang t.o.v. doel.",
    reason: "Zonder rapportage geen feedback-loop tussen execution en doel.",
    priority: "medium",
    effort: "low",
    expectedImpact: "medium",
    source: "ai",
  });

  // I. Website fixes from audit — interpreted via priority mapping.
  //    Consolidate "content" category into 1 editorial item if there are >2
  //    content issues; otherwise emit top-N ranked issues individually.
  const grouped = groupAuditIssuesByCategory(ctx.audit.issueCodes);
  const contentIssues = grouped.content ?? [];
  const ranked = rankAuditIssues(ctx.audit.issueCodes);

  if (contentIssues.length > 2) {
    items.push({
      type: "website_fix",
      title: `Editorial sprint: fix ${contentIssues.length} content issues`,
      description: `Bundel: ${contentIssues.map((i) => i.label).slice(0, 5).join("; ")}${contentIssues.length > 5 ? "; …" : ""}.`,
      reason: "Meerdere content-issues los oplossen versnippert effort — bundel als één editorial sprint.",
      priority: "high",
      effort: "medium",
      expectedImpact: "high",
      source: "audit",
      metadata: {
        issueCodes: contentIssues.map((i) => i.code),
        auditId: ctx.audit.id,
        category: "content",
      },
    });
  }

  const individualIssues = contentIssues.length > 2
    ? ranked.filter((i) => i.category !== "content")
    : ranked;
  for (const issue of individualIssues.slice(0, 5)) {
    items.push({
      type: "website_fix",
      title: `Resolve: ${issue.label}`,
      description: `Audit-issue ${issue.code} (${issue.category}). ${issue.rationale}`,
      reason: issue.rationale,
      priority: issue.priority,
      effort: issue.effort,
      expectedImpact: issue.impact,
      source: "audit",
      metadata: {
        issueCode: issue.code,
        auditId: ctx.audit.id,
        category: issue.category,
        severity: issue.severity,
      },
    });
  }

  // Constraints
  if (ctx.goal.capacityNotes) mainConstraints.push(`Capaciteit: ${ctx.goal.capacityNotes}`);
  if (leadGap != null && leadGap > 0 && requiredLeads != null) {
    mainConstraints.push(
      `${leadGap} extra ${ctx.goal.targetType}/maand nodig → ~${requiredLeads} gekwalificeerde leads/maand.`,
    );
  }

  // Summary
  const goalLine =
    targetCount != null
      ? `${targetCount} ${ctx.goal.targetType} per maand${ctx.goal.timeframeMonths ? ` binnen ${ctx.goal.timeframeMonths} maanden` : ""}`
      : "groeidoel (target nog niet ingevuld)";
  const leadLine =
    requiredLeads != null && closeRate != null
      ? `Bij ${(closeRate * 100).toFixed(0)}% close rate ≈ ${requiredLeads} gekwalificeerde leads/maand.`
      : "Lead-math onvolledig — vul target en close rate aan voor concrete leadvolumes.";
  const summary = `Doel: ${goalLine}. ${leadLine}`;
  const strategySummary = [
    trackingUnknown
      ? "Eerst meetbaar maken (tracking)."
      : "Tracking grotendeels gezet — valideer en koppel aan inbox.",
    ctx.goal.serviceFocus.length > 0
      ? `Bouw of versterk pagina's voor ${ctx.goal.serviceFocus.slice(0, 3).join(", ")}.`
      : "Definieer eerst service focus om pagina-strategie te kunnen maken.",
    ctx.goal.locations.length > 0
      ? `Lokale zichtbaarheid voor ${ctx.goal.locations.slice(0, 3).join(", ")} via GBP + location pages.`
      : "Lokale strategie nog niet bepaald — voeg regio's toe.",
    "Daarna conversie-optimalisatie + maandelijkse reporting tegen het doel.",
  ].join(" ");

  // Crude confidence — % of present context signals
  const signals = [
    targetCount != null,
    closeRate != null,
    currentCount != null,
    ctx.goal.serviceFocus.length > 0,
    ctx.goal.locations.length > 0,
    !!ctx.goal.trackingNotes?.trim(),
    !!ctx.businessProfile,
    ctx.pageIntel.length > 0,
  ];
  const confidence = signals.filter(Boolean).length / signals.length;

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
    },
  };
}
