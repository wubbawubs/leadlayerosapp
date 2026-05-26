/**
 * Input Quality Analyzer — Sprint E (Masterplan Intelligence V2).
 *
 * Two layers:
 *  1. `analyzeGoalInputQuality({ goal, bp })` — overall goal/BP report used by
 *     the masterplan generator to decide which items to create.
 *  2. `evaluateInputQuality({ goal, bp, itemTitle })` — per-item readiness
 *     check used by proposal generation to refuse vague masterplan items.
 *
 * Both share the same broad-term dictionaries so behavior is consistent.
 */

const BROAD_SERVICES = new Set([
  "leadgen",
  "lead generation",
  "leadgeneration",
  "seo",
  "marketing",
  "digital marketing",
  "online marketing",
  "ads",
  "advertising",
  "growth",
  "branding",
  "content",
  "content marketing",
  "performance",
  "performance marketing",
  "web",
  "website",
  "social",
  "social media",
  "service",
  "services",
  "business",
  "local marketing",
  "online visibility",
  "lokale vindbaarheid",
  "diensten",
]);

const BROAD_LOCATIONS = new Set([
  "usa",
  "us",
  "u.s.",
  "u.s.a.",
  "united states",
  "america",
  "nederland",
  "netherlands",
  "holland",
  "belgië",
  "belgie",
  "belgium",
  "vlaanderen",
  "europe",
  "europa",
  "eu",
  "uk",
  "united kingdom",
  "germany",
  "duitsland",
  "world",
  "wereld",
  "global",
  "worldwide",
  "international",
  "online",
]);

function norm(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** True if `service` is a vague/broad bucket and should not yield a service page item. */
export function isGenericService(service: string): boolean {
  return BROAD_SERVICES.has(norm(service));
}

/** True if `location` is country/market-level and should not yield a location page item. */
export function isBroadLocation(location: string): boolean {
  return BROAD_LOCATIONS.has(norm(location));
}

// ---------------------------------------------------------------------------
// Per-item evaluator (used by proposal generation)
// ---------------------------------------------------------------------------

export interface InputQualityIssue {
  field: "service_focus" | "locations" | "vertical" | "linked_page";
  value: string | null;
  message: string;
}

export interface InputQualityReport {
  ok: boolean;
  issues: InputQualityIssue[];
  riskFlags: string[];
  checklist: string[];
}

export function evaluateInputQuality(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  goal?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bp?: any;
  itemTitle?: string;
  itemDescription?: string | null;
}): InputQualityReport {
  const issues: InputQualityIssue[] = [];
  const riskFlags: string[] = [];

  const services: string[] = Array.isArray(args.goal?.service_focus)
    ? args.goal.service_focus.map(norm).filter(Boolean)
    : [];
  const locations: string[] = Array.isArray(args.goal?.locations)
    ? args.goal.locations.map(norm).filter(Boolean)
    : [];

  if (services.length === 0) {
    issues.push({
      field: "service_focus",
      value: null,
      message: "Geen service focus gedefinieerd op het groeidoel.",
    });
    riskFlags.push("input:service_missing");
  } else {
    const broadHits = services.filter((s) => BROAD_SERVICES.has(s));
    if (broadHits.length > 0 && broadHits.length === services.length) {
      issues.push({
        field: "service_focus",
        value: broadHits.join(", "),
        message: `Service focus is te breed: ${broadHits.join(", ")}. Specificeer de concrete dienst (bv. "AC repair", "noodloodgieter", "HVAC maintenance").`,
      });
      riskFlags.push("input:service_too_broad");
    }
  }

  if (locations.length === 0) {
    issues.push({
      field: "locations",
      value: null,
      message: "Geen locaties gedefinieerd op het groeidoel.",
    });
    riskFlags.push("input:location_missing");
  } else {
    const broadHits = locations.filter((l) => BROAD_LOCATIONS.has(l));
    if (broadHits.length > 0 && broadHits.length === locations.length) {
      issues.push({
        field: "locations",
        value: broadHits.join(", "),
        message: `Locatie is te breed: ${broadHits.join(", ")}. Kies 2–5 concrete steden of staten (bv. "Dallas, TX").`,
      });
      riskFlags.push("input:location_too_broad");
    }
  }

  const identity = (args.bp?.business_identity ?? {}) as Record<string, unknown>;
  const vertical = norm(identity.industry ?? identity.vertical);
  if (!vertical) {
    issues.push({
      field: "vertical",
      value: null,
      message: "Branche / vertical ontbreekt in het Business Profile.",
    });
    riskFlags.push("input:vertical_missing");
  }

  const checklist =
    issues.length > 0
      ? [
          "Bepaal één concrete hoofdservice (geen brede categorie zoals 'leadgen' of 'marketing').",
          "Kies 2–5 concrete steden of staten i.p.v. een heel land.",
          "Bevestig de branche / vertical in het Business Profile.",
          "Koppel de actie aan één bestaande of geplande servicepagina.",
          "Definieer welke CTA meetbaar wordt gebruikt: aanvraag, call, formulier of scan.",
        ]
      : [];

  return { ok: issues.length === 0, issues, riskFlags, checklist };
}

export function buildNeedsContextRecommendation(
  report: InputQualityReport,
  itemTitle: string,
): string {
  const lines: string[] = [];
  lines.push(
    `Dit item is nog niet klaar voor uitvoering. De huidige input is te breed om “${itemTitle}” concreet uit te werken.`,
  );
  lines.push("");
  if (report.issues.length > 0) {
    lines.push("Wat ontbreekt of te breed is:");
    for (const issue of report.issues) lines.push(`- ${issue.message}`);
    lines.push("");
  }
  if (report.checklist.length > 0) {
    lines.push("Doe dit eerst voordat we content/proposals genereren:");
    for (const item of report.checklist) lines.push(`- ${item}`);
    lines.push("");
  }
  lines.push(
    "Suggested next action: werk groeidoel en business profile aan zodat service, doelgroep en locatie scherp zijn — dan opnieuw 'Generate proposal'.",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Goal-level analyzer (used by masterplan generator)
// ---------------------------------------------------------------------------

export interface GoalQualityWarning {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
  suggestedFix?: string;
}

export interface GoalQualityReport {
  warnings: GoalQualityWarning[];
  serviceQuality: "specific" | "generic" | "missing";
  locationQuality: "specific" | "broad" | "missing";
  closeRateQuality: "normal" | "high" | "missing";
  trackingQuality: "known" | "unknown";
  readiness: "ready" | "needs_context";
  /** Concrete specific services after filtering generics. */
  specificServices: string[];
  /** Concrete specific locations after filtering broad ones. */
  specificLocations: string[];
  /** Broad/generic services that triggered warnings (for UI / metadata). */
  broadServices: string[];
  /** Broad locations that triggered warnings. */
  broadLocations: string[];
  riskFlags: string[];
}

export function analyzeGoalInputQuality(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  goal?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bp?: any;
}): GoalQualityReport {
  const warnings: GoalQualityWarning[] = [];
  const riskFlags: string[] = [];

  const rawServices: string[] = Array.isArray(args.goal?.service_focus)
    ? (args.goal.service_focus as unknown[])
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean)
    : [];
  const rawLocations: string[] = Array.isArray(args.goal?.locations)
    ? (args.goal.locations as unknown[])
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean)
    : [];

  const broadServices = rawServices.filter((s) => isGenericService(s));
  const specificServices = rawServices.filter((s) => !isGenericService(s));
  const broadLocations = rawLocations.filter((l) => isBroadLocation(l));
  const specificLocations = rawLocations.filter((l) => !isBroadLocation(l));

  let serviceQuality: GoalQualityReport["serviceQuality"];
  if (rawServices.length === 0) {
    serviceQuality = "missing";
    warnings.push({
      code: "service_focus_missing",
      severity: "high",
      message: "Service focus ontbreekt op het groeidoel.",
      suggestedFix: "Voeg 1–5 concrete diensten toe (geen brede labels als 'marketing' of 'leadgen').",
    });
    riskFlags.push("input:service_missing");
  } else if (specificServices.length === 0) {
    serviceQuality = "generic";
    warnings.push({
      code: "service_focus_generic",
      severity: "high",
      message: `Service focus is te breed: ${broadServices.join(", ")}.`,
      suggestedFix: "Specificeer concrete diensten (bv. 'AC repair', 'Emergency HVAC', 'noodloodgieter').",
    });
    riskFlags.push("input:service_too_broad");
  } else {
    serviceQuality = "specific";
    if (broadServices.length > 0) {
      warnings.push({
        code: "service_focus_partial_generic",
        severity: "low",
        message: `Sommige services zijn te breed: ${broadServices.join(", ")}.`,
        suggestedFix: "Verwijder of vervang brede labels.",
      });
    }
  }

  let locationQuality: GoalQualityReport["locationQuality"];
  if (rawLocations.length === 0) {
    locationQuality = "missing";
    warnings.push({
      code: "locations_missing",
      severity: "high",
      message: "Geen locaties gedefinieerd op het groeidoel.",
      suggestedFix: "Voeg 2–5 concrete steden, staten of metro areas toe.",
    });
    riskFlags.push("input:location_missing");
  } else if (specificLocations.length === 0) {
    locationQuality = "broad";
    warnings.push({
      code: "locations_broad",
      severity: "high",
      message: `Locatie is te breed: ${broadLocations.join(", ")}.`,
      suggestedFix: "Vervang door 2–5 concrete steden of staten (bv. 'Dallas, TX', 'Amsterdam').",
    });
    riskFlags.push("input:location_too_broad");
  } else {
    locationQuality = "specific";
    if (broadLocations.length > 0) {
      warnings.push({
        code: "locations_partial_broad",
        severity: "low",
        message: `Sommige locaties zijn brede markten: ${broadLocations.join(", ")}.`,
      });
    }
  }

  const closeRate = args.goal?.close_rate;
  let closeRateQuality: GoalQualityReport["closeRateQuality"];
  if (closeRate == null || Number(closeRate) <= 0) {
    closeRateQuality = "missing";
    warnings.push({
      code: "close_rate_missing",
      severity: "high",
      message: "Close rate ontbreekt of is 0.",
      suggestedFix: "Vul een realistische close rate in op basis van recente verkoopdata.",
    });
    riskFlags.push("input:close_rate_missing");
  } else if (Number(closeRate) > 0.7) {
    closeRateQuality = "high";
    warnings.push({
      code: "close_rate_high",
      severity: "medium",
      message: `Close rate is hoog (${(Number(closeRate) * 100).toFixed(0)}%). Bevestig dat dit op echte verkoopdata gebaseerd is.`,
      suggestedFix: "Valideer met laatste 3–6 maanden sales data.",
    });
    riskFlags.push("input:close_rate_high");
  } else {
    closeRateQuality = "normal";
  }

  const trackingNotes = typeof args.goal?.tracking_notes === "string" ? args.goal.tracking_notes.trim() : "";
  const trackingQuality: GoalQualityReport["trackingQuality"] = trackingNotes.length > 0 ? "known" : "unknown";
  if (trackingQuality === "unknown") {
    warnings.push({
      code: "tracking_unknown",
      severity: "high",
      message: "Lead-tracking is nog niet gedocumenteerd.",
      suggestedFix: "Documenteer hoe calls en formulieren worden gemeten en aan welke bron ze gekoppeld zijn.",
    });
    riskFlags.push("input:tracking_unknown");
  }

  // Soft context checks
  if (args.goal?.current_count == null) {
    warnings.push({
      code: "current_count_missing",
      severity: "medium",
      message: "Huidige leadflow / current_count ontbreekt — moeilijk om gap te meten.",
    });
  }
  const goodFit = Array.isArray(args.goal?.good_fit_leads) ? args.goal.good_fit_leads : [];
  const badFit = Array.isArray(args.goal?.bad_fit_leads) ? args.goal.bad_fit_leads : [];
  if (goodFit.length === 0) {
    warnings.push({
      code: "good_fit_missing",
      severity: "low",
      message: "Geen good-fit lead voorbeelden — ICP signalen ontbreken.",
    });
  }
  if (badFit.length === 0) {
    warnings.push({
      code: "bad_fit_missing",
      severity: "low",
      message: "Geen bad-fit lead voorbeelden — disqualificatie criteria ontbreken.",
    });
  }

  const identity = (args.bp?.business_identity ?? {}) as Record<string, unknown>;
  const vertical = norm(identity.industry ?? identity.vertical);
  if (!vertical) {
    warnings.push({
      code: "vertical_missing",
      severity: "medium",
      message: "Branche / vertical ontbreekt in Business Profile.",
    });
    riskFlags.push("input:vertical_missing");
  }

  const blocking = warnings.some((w) => w.severity === "high");
  const readiness: GoalQualityReport["readiness"] = blocking ? "needs_context" : "ready";

  return {
    warnings,
    serviceQuality,
    locationQuality,
    closeRateQuality,
    trackingQuality,
    readiness,
    specificServices,
    specificLocations,
    broadServices,
    broadLocations,
    riskFlags,
  };
}
