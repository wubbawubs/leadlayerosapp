/**
 * Input Quality Analyzer -- Sprint E (Masterplan Intelligence V2).
 *
 * Two layers:
 *  1. `analyzeGoalInputQuality({ goal, bp })` -- overall goal/BP report used by
 *     the masterplan generator to decide which items to create.
 *  2. `evaluateInputQuality({ goal, bp, itemTitle })` -- per-item readiness
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
      message: "No service focus defined on the growth goal.",
    });
    riskFlags.push("input:service_missing");
  } else {
    const broadHits = services.filter((s) => BROAD_SERVICES.has(s));
    if (broadHits.length > 0 && broadHits.length === services.length) {
      issues.push({
        field: "service_focus",
        value: broadHits.join(", "),
        message: `Service focus is too broad: ${broadHits.join(", ")}. Specify a concrete service (e.g. "AC repair", "emergency plumber", "HVAC maintenance").`,
      });
      riskFlags.push("input:service_too_broad");
    }
  }

  if (locations.length === 0) {
    issues.push({
      field: "locations",
      value: null,
      message: "No locations defined on the growth goal.",
    });
    riskFlags.push("input:location_missing");
  } else {
    const broadHits = locations.filter((l) => BROAD_LOCATIONS.has(l));
    if (broadHits.length > 0 && broadHits.length === locations.length) {
      issues.push({
        field: "locations",
        value: broadHits.join(", "),
        message: `Location is too broad: ${broadHits.join(", ")}. Choose 2-5 specific cities or states (e.g. "Dallas, TX").`,
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
      message: "Industry / vertical is missing from the Business Profile.",
    });
    riskFlags.push("input:vertical_missing");
  }

  const checklist =
    issues.length > 0
      ? [
          "Set one concrete primary service -- avoid broad categories like 'marketing' or 'leadgen'.",
          "Choose 2-5 specific cities or states instead of a whole country.",
          "Confirm the industry / vertical in the Business Profile.",
          "Link the item to one existing or planned service page.",
          "Define which CTA is tracked: quote request, call, form, or scan.",
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
    `This item is not ready for execution. The current input is too broad to generate concrete output for "${itemTitle}".`,
  );
  lines.push("");
  if (report.issues.length > 0) {
    lines.push("What is missing or too broad:");
    for (const issue of report.issues) lines.push(`- ${issue.message}`);
    lines.push("");
  }
  if (report.checklist.length > 0) {
    lines.push("Complete these steps before generating content:");
    for (const item of report.checklist) lines.push(`- ${item}`);
    lines.push("");
  }
  lines.push(
    "Suggested next action: update the growth goal and business profile so service, audience, and location are specific -- then regenerate.",
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
      message: "Service focus is missing from the growth goal.",
      suggestedFix: "Add 1-5 specific services (avoid broad labels like 'marketing' or 'leadgen').",
    });
    riskFlags.push("input:service_missing");
  } else if (specificServices.length === 0) {
    serviceQuality = "generic";
    warnings.push({
      code: "service_focus_generic",
      severity: "high",
      message: `Service focus is too broad: ${broadServices.join(", ")}.`,
      suggestedFix: "Specify concrete services (e.g. 'AC repair', 'Emergency HVAC', 'drain unblocking').",
    });
    riskFlags.push("input:service_too_broad");
  } else {
    serviceQuality = "specific";
    if (broadServices.length > 0) {
      warnings.push({
        code: "service_focus_partial_generic",
        severity: "low",
        message: `Some services are too broad: ${broadServices.join(", ")}.`,
        suggestedFix: "Remove or replace broad labels with specific service names.",
      });
    }
  }

  let locationQuality: GoalQualityReport["locationQuality"];
  if (rawLocations.length === 0) {
    locationQuality = "missing";
    warnings.push({
      code: "locations_missing",
      severity: "high",
      message: "No locations defined on the growth goal.",
      suggestedFix: "Add 2-5 specific cities, states, or metro areas.",
    });
    riskFlags.push("input:location_missing");
  } else if (specificLocations.length === 0) {
    locationQuality = "broad";
    warnings.push({
      code: "locations_broad",
      severity: "high",
      message: `Location is too broad: ${broadLocations.join(", ")}.`,
      suggestedFix: "Replace with 2-5 specific cities or states (e.g. 'Dallas, TX', 'Amsterdam').",
    });
    riskFlags.push("input:location_too_broad");
  } else {
    locationQuality = "specific";
    if (broadLocations.length > 0) {
      warnings.push({
        code: "locations_partial_broad",
        severity: "low",
        message: `Some locations are broad markets: ${broadLocations.join(", ")}.`,
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
      message: "Close rate is missing or 0.",
      suggestedFix: "Enter a realistic close rate based on recent sales data.",
    });
    riskFlags.push("input:close_rate_missing");
  } else if (Number(closeRate) > 0.7) {
    closeRateQuality = "high";
    warnings.push({
      code: "close_rate_high",
      severity: "high",
      message: `Close rate is very high (${(Number(closeRate) * 100).toFixed(0)}%). Confirm this is based on real sales data -- local-service close rates above 70% are rare.`,
      suggestedFix: "Validate against the last 3-6 months of sales data.",
    });
    riskFlags.push("input:close_rate_high");
  } else if (Number(closeRate) > 0.45) {
    closeRateQuality = "high";
    warnings.push({
      code: "close_rate_elevated",
      severity: "medium",
      message: `Close rate is high (${(Number(closeRate) * 100).toFixed(0)}%). Confirm this is based on real sales data.`,
      suggestedFix: "Validate against the last 3-6 months of sales data.",
    });
    riskFlags.push("input:close_rate_elevated");
  } else {
    closeRateQuality = "normal";
  }

  const trackingNotes = typeof args.goal?.tracking_notes === "string" ? args.goal.tracking_notes.trim() : "";
  const trackingQuality: GoalQualityReport["trackingQuality"] = trackingNotes.length > 0 ? "known" : "unknown";
  if (trackingQuality === "unknown") {
    warnings.push({
      code: "tracking_unknown",
      severity: "high",
      message: "Lead tracking is not documented.",
      suggestedFix: "Document how calls and forms are measured and which source they are attributed to.",
    });
    riskFlags.push("input:tracking_unknown");
  }

  // Soft context checks
  if (args.goal?.current_count == null) {
    warnings.push({
      code: "current_count_missing",
      severity: "medium",
      message: "Current lead volume (current_count) is missing -- gap calculation will be incomplete.",
    });
  }
  const goodFit = Array.isArray(args.goal?.good_fit_leads) ? args.goal.good_fit_leads : [];
  const badFit = Array.isArray(args.goal?.bad_fit_leads) ? args.goal.bad_fit_leads : [];
  if (goodFit.length === 0) {
    warnings.push({
      code: "good_fit_missing",
      severity: "low",
      message: "No good-fit lead examples -- ICP signals are missing.",
    });
  }
  if (badFit.length === 0) {
    warnings.push({
      code: "bad_fit_missing",
      severity: "low",
      message: "No bad-fit lead examples -- disqualification criteria are missing.",
    });
  }

  const identity = (args.bp?.business_identity ?? {}) as Record<string, unknown>;
  const vertical = norm(identity.industry ?? identity.vertical);
  if (!vertical) {
    warnings.push({
      code: "vertical_missing",
      severity: "medium",
      message: "Industry / vertical is missing from the Business Profile.",
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
