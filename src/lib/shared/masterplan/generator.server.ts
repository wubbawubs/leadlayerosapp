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

  // Input Quality Analysis (Sprint E) — drives service/location item shape.
  const inputQuality = analyzeGoalInputQuality({
    goal: {
      service_focus: ctx.goal.serviceFocus,
      locations: ctx.goal.locations,
      close_rate: ctx.goal.closeRate,
      tracking_notes: ctx.goal.trackingNotes,
      current_count: ctx.goal.currentCount,
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

  const targetLabel = `${targetCount ?? "?"} ${ctx.goal.targetType}/maand`;

  // A. Tracking
  const trackingUnknown = inputQuality.trackingQuality === "unknown";
  items.push({
    type: "tracking",
    title: "Set up call and form tracking",
    description:
      "Zorg dat elke binnenkomende lead (call, form, WhatsApp, chat) gemeten wordt met bron-attributie.",
    reason: trackingUnknown
      ? `Zonder tracking kunnen we niet bewijzen of het doel van ${targetLabel} dichterbij komt.`
      : "Tracking is genoteerd; verifieer setup en koppel aan lead inbox.",
    priority: trackingUnknown ? "critical" : "high",
    effort: "medium",
    expectedImpact: "high",
    source: trackingUnknown ? "goal" : "operator",
    metadata: {
      readiness: "manual_task" as ItemReadiness,
      goalContribution: `Direct meetbaar maken van progressie richting ${targetLabel}.`,
      successMetric: "Elke binnenkomende lead heeft een bron + attributie veld.",
      playbookSteps: [
        "Check of call tracking actief is (provider, nummer, doorschakeling).",
        "Check of formulier-submits worden gemeten (event + bron).",
        "Bevestig het primaire telefoonnummer en wie de calls aanneemt.",
        "Documenteer per kanaal welke bron-attributie wordt opgeslagen.",
        "Mark done zodra elke lead-bron meetbaar en gedocumenteerd is.",
      ],
      evidence: [
        { source: "Growth Goal", reason: trackingUnknown ? "tracking_notes is leeg" : "tracking_notes ingevuld" },
      ],
    } satisfies ItemMetadata,
  });
  if (trackingUnknown) mainConstraints.push("Geen meetbare lead-attributie");

  // B. Service pages — branch on quality
  if (inputQuality.serviceQuality === "specific") {
    for (const focus of inputQuality.specificServices.slice(0, 6)) {
      const exists = hasServicePageForFocus(focus, ctx.pageIntel);
      const primaryLoc = inputQuality.specificLocations[0];
      if (!exists) {
        const title = primaryLoc
          ? `Build or improve ${focus} page for ${primaryLoc}`
          : `Build or improve service page: ${focus}`;
        items.push({
          type: "service_page",
          title,
          description: `Maak een dedicated pagina voor "${focus}" met duidelijke USP, proof, en directe CTA${primaryLoc ? ` gericht op ${primaryLoc}` : ""}.`,
          reason: `High-intent dienst die direct bijdraagt aan ${targetLabel}.`,
          priority: "high",
          effort: "medium",
          expectedImpact: "high",
          source: "goal",
          metadata: {
            readiness: "ready" as ItemReadiness,
            linkedService: focus,
            linkedLocation: primaryLoc,
            goalContribution: `Vangt zoekintentie voor "${focus}" en stuurt naar primaire CTA.`,
            successMetric: "Pagina live + minimaal 1 gekwalificeerde lead per maand toegerekend aan deze pagina.",
            evidence: [
              { source: "Growth Goal", reason: `service_focus bevat "${focus}"` },
              ...(primaryLoc ? [{ source: "Growth Goal", reason: `locations bevat "${primaryLoc}"` }] : []),
            ],
          } satisfies ItemMetadata,
        });
      } else {
        items.push({
          type: "website_fix",
          title: `Optimize service page: ${focus}`,
          description: "Bestaande pagina gevonden — verbeter CTA, schema, intern linken en proof.",
          reason: "Pagina bestaat; conversie- en SEO-optimalisatie geeft snelste lift.",
          priority: "medium",
          effort: "low",
          expectedImpact: "medium",
          source: "page_intelligence",
          metadata: {
            readiness: "ready" as ItemReadiness,
            linkedService: focus,
            goalContribution: `Verhoogt conversie op bestaande "${focus}" pagina zonder extra verkeer.`,
            evidence: [
              { source: "Page Intelligence", reason: `bestaande pagina gevonden voor "${focus}"` },
            ],
          } satisfies ItemMetadata,
        });
      }
    }
  } else {
    // Generic OR missing → needs-context item instead of fake "Build service page: Leadgen".
    items.push({
      type: "website_fix",
      title: "Define high-value service offers before building service pages",
      description:
        "Service-page planning kan pas concreet worden als we 2–5 specifieke diensten kennen (geen brede labels als 'leadgen' of 'marketing').",
      reason:
        "Service-page items op een brede service ('leadgen', 'SEO') leveren generieke pagina's zonder zoekintentie of CTA-richting.",
      priority: "high",
      effort: "low",
      expectedImpact: "high",
      source: "goal",
      metadata: {
        readiness: "needs_context" as ItemReadiness,
        needsContext: true,
        missingContext: ["specific_services"],
        playbookSteps: [
          "Bepaal 2–5 concrete diensten met sales- of marge-waarde.",
          "Voor elke dienst: noteer doelgroep, prijsindicatie en typische trigger.",
          "Vervang brede labels (leadgen, marketing, SEO) in het groeidoel.",
          "Mark done zodra service_focus alleen concrete diensten bevat.",
        ],
        evidence: [
          {
            source: "Input Quality",
            reason:
              inputQuality.serviceQuality === "missing"
                ? "service_focus is leeg"
                : `service_focus alleen brede labels: ${inputQuality.broadServices.join(", ")}`,
          },
        ],
      } satisfies ItemMetadata,
    });
    mainConstraints.push("Service focus is nog niet concreet genoeg voor execution.");
  }

  // C. Location pages — branch on quality
  if (inputQuality.locationQuality === "specific") {
    for (const loc of inputQuality.specificLocations.slice(0, 5)) {
      const exists = hasLocationPageForArea(loc, ctx.pageIntel);
      if (!exists) {
        items.push({
          type: "location_page",
          title: `Build location page: ${loc}`,
          description: `Local landing voor "${loc}" met service-area context, lokale proof en routebeschrijving.`,
          reason: "Lokale zichtbaarheid vergroot Maps + lokale SERP en sluit aan op service area.",
          priority: "medium",
          effort: "medium",
          expectedImpact: "medium",
          source: "goal",
          metadata: {
            readiness: "ready" as ItemReadiness,
            linkedLocation: loc,
            goalContribution: `Lokale zichtbaarheid in ${loc} voor service-search + Maps.`,
            successMetric: `Pagina live + GBP-koppeling + minimaal 1 lokale lead/maand vanuit ${loc}.`,
            evidence: [{ source: "Growth Goal", reason: `locations bevat "${loc}"` }],
          } satisfies ItemMetadata,
        });
      }
    }
  } else if (ctx.goal.locations.length > 0) {
    // We have locations but only broad ones → needs-context instead of "Build location page: USA".
    items.push({
      type: "location_page",
      title: "Define specific target cities or service areas",
      description:
        "Location-page items hebben concrete steden / staten / metro areas nodig — een land of markt is geen lokale pagina.",
      reason:
        "Met alleen brede locaties ('USA', 'Nederland') kunnen we geen lokale relevantie of GBP-koppeling bouwen.",
      priority: "high",
      effort: "low",
      expectedImpact: "medium",
      source: "goal",
      metadata: {
        readiness: "needs_context" as ItemReadiness,
        needsContext: true,
        missingContext: ["specific_locations"],
        playbookSteps: [
          "Kies 2–5 concrete steden of staten waar je leads wilt winnen.",
          "Optioneel: voeg metro areas of regio's toe (bv. 'Dallas-Fort Worth metro').",
          "Vervang country-level entries ('USA', 'Nederland') in het groeidoel.",
          "Mark done zodra locations alleen concrete plaatsen bevat.",
        ],
        evidence: [
          {
            source: "Input Quality",
            reason: `locations is country-level: ${inputQuality.broadLocations.join(", ")}`,
          },
        ],
      } satisfies ItemMetadata,
    });
    mainConstraints.push("Locaties zijn nog country-level — geen lokale pagina's mogelijk.");
  }

  // D. GBP — manual task with playbook
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
    metadata: {
      readiness: "manual_task" as ItemReadiness,
      goalContribution: "Verhoogt lokale zichtbaarheid en directe lead-acties (call, route, site visit).",
      playbookSteps: [
        "Bevestig toegang tot het Google Business Profile.",
        "Check primaire categorie en service-categorieën.",
        "Check services, beschrijving, foto's en review-status.",
        "Lijn GBP-diensten uit met target services en locaties.",
        "Mark done zodra GBP gealigneerd is met service_focus + locations.",
      ],
    } satisfies ItemMetadata,
  });

  // E. Review flow — manual playbook
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
    metadata: {
      readiness: "manual_task" as ItemReadiness,
      goalContribution: "Reviews voeden GBP-ranking en social proof op service/location pages.",
      playbookSteps: [
        "Bevestig waar reviews worden verzameld (Google, branch-platform, eigen site).",
        "Identificeer de beste timing voor het verzoek (na klus / na factuur).",
        "Schrijf één korte review-request boodschap (SMS + mail).",
        "Track wie er gevraagd en geantwoord is (sheet of CRM-veld).",
        "Mark done zodra het verzoek standaard onderdeel is van afronding.",
      ],
    } satisfies ItemMetadata,
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
    metadata: {
      readiness: "ready" as ItemReadiness,
      goalContribution: `Verhoogt lead-yield op bestaand verkeer richting ${targetLabel}.`,
      successMetric: "Meetbare lift in form-submits / calls op de primaire conversiepagina.",
    } satisfies ItemMetadata,
  });

  // G. Content — only if service is specific (otherwise it becomes generic too)
  if (inputQuality.serviceQuality === "specific") {
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
      metadata: {
        readiness: "ready" as ItemReadiness,
        linkedService: inputQuality.specificServices[0],
        goalContribution: "Vangt long-tail vraag rond hoofd-services en linkt intern naar service pages.",
      } satisfies ItemMetadata,
    });
  }

  // H. Reporting — manual playbook
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
    metadata: {
      readiness: "manual_task" as ItemReadiness,
      goalContribution: `Maakt voortgang richting ${targetLabel} zichtbaar en stuurbaar.`,
      playbookSteps: [
        "Definieer de lead-KPI (aantal gekwalificeerde leads / maand).",
        "Track calls en formulier-submits per bron.",
        "Rapporteer leads, bron, gekwalificeerde leads en progressie vs doel.",
        "Bespreek next actions maandelijks en herijk masterplan.",
      ],
    } satisfies ItemMetadata,
  });

  // I. Website fixes from audit
  const grouped = groupAuditIssuesByCategory(ctx.audit.issueCodes);
  const contentIssues = grouped.content ?? [];
  const ranked = rankAuditIssues(ctx.audit.issueCodes);

  if (contentIssues.length > 2) {
    items.push({
      type: "website_fix",
      title: `Editorial sprint: fix ${contentIssues.length} content issues`,
      description: `Bundel: ${contentIssues.map((i) => i.label).slice(0, 5).join("; ")}${contentIssues.length > 5 ? "; …" : ""}.`,
      reason:
        "Meerdere content-issues los oplossen versnippert effort — bundel als één editorial sprint.",
      priority: "high",
      effort: "medium",
      expectedImpact: "high",
      source: "audit",
      metadata: {
        readiness: "ready" as ItemReadiness,
        issueCodes: contentIssues.map((i) => i.code),
        auditId: ctx.audit.id,
        category: "content",
        evidence: [
          { source: "Audit", reason: `${contentIssues.length} content issues gevonden` },
        ],
      } satisfies ItemMetadata,
    });
  }

  const individualIssues =
    contentIssues.length > 2 ? ranked.filter((i) => i.category !== "content") : ranked;
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
        readiness: "ready" as ItemReadiness,
        issueCode: issue.code,
        auditId: ctx.audit.id,
        category: issue.category,
        severity: issue.severity,
        evidence: [{ source: "Audit", reason: `issue ${issue.code} (${issue.severity})` }],
      } satisfies ItemMetadata,
    });
  }

  // Constraints
  if (ctx.goal.capacityNotes) mainConstraints.push(`Capaciteit: ${ctx.goal.capacityNotes}`);
  if (leadGap != null && leadGap > 0 && requiredLeads != null) {
    mainConstraints.push(
      `${leadGap} extra ${ctx.goal.targetType}/maand nodig → ~${requiredLeads} gekwalificeerde leads/maand.`,
    );
  }
  if (inputQuality.closeRateQuality === "high") {
    mainConstraints.push("Close rate is hoog — valideer met echte sales data.");
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
    inputQuality.serviceQuality === "specific"
      ? `Bouw of versterk pagina's voor ${inputQuality.specificServices.slice(0, 3).join(", ")}.`
      : "Definieer eerst concrete services voordat pagina-strategie kan starten.",
    inputQuality.locationQuality === "specific"
      ? `Lokale zichtbaarheid voor ${inputQuality.specificLocations.slice(0, 3).join(", ")} via GBP + location pages.`
      : "Lokale strategie nog niet bepaald — voeg concrete steden/staten toe.",
    "Daarna conversie-optimalisatie + maandelijkse reporting tegen het doel.",
  ].join(" ");

  // Confidence — context signals + quality penalty
  const signals = [
    targetCount != null,
    closeRate != null,
    currentCount != null,
    inputQuality.serviceQuality === "specific",
    inputQuality.locationQuality === "specific",
    inputQuality.trackingQuality === "known",
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
      inputReadiness: inputQuality.readiness,
    },
    qualityWarnings: inputQuality.warnings,
    inputQuality,
  };
}
