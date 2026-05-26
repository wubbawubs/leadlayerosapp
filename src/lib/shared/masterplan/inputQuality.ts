/**
 * Input quality guards for masterplan → proposal generation.
 *
 * Detects broad / vague inputs (generic service like "leadgen", country-level
 * location like "USA") and returns a structured needs_context result. Goal:
 * stop the LLM from inventing a "specific" plan from vague input.
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
]);

const BROAD_LOCATIONS = new Set([
  "usa",
  "us",
  "united states",
  "america",
  "nederland",
  "netherlands",
  "holland",
  "belgië",
  "belgium",
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
  "international",
]);

function norm(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export interface InputQualityIssue {
  field: "service_focus" | "locations" | "vertical" | "linked_page";
  value: string | null;
  message: string;
}

export interface InputQualityReport {
  ok: boolean;
  issues: InputQualityIssue[];
  riskFlags: string[];
  /** Suggested operator actions to make the input concrete enough. */
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
        message: `Service focus is te breed: ${broadHits.join(", ")}. Specificeer de concrete dienst of vertical (bv. "noodloodgieter", "HVAC onderhoud", "tandartspraktijk").`,
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
        message: `Locatie is te breed: ${broadHits.join(", ")}. Kies 2–5 concrete steden of staten waar je leads wilt winnen.`,
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

  const checklist = issues.length > 0
    ? [
        "Bepaal één concrete hoofdservice (geen brede categorie zoals 'leadgen' of 'marketing').",
        "Kies 2–5 concrete steden of staten i.p.v. een heel land.",
        "Bevestig de branche / vertical in het Business Profile.",
        "Koppel de actie aan één bestaande of geplande servicepagina.",
        "Definieer welke CTA meetbaar wordt gebruikt: aanvraag, call, formulier of scan.",
      ]
    : [];

  return {
    ok: issues.length === 0,
    issues,
    riskFlags,
    checklist,
  };
}

export function buildNeedsContextRecommendation(report: InputQualityReport, itemTitle: string): string {
  const lines: string[] = [];
  lines.push(`Dit item is nog niet klaar voor uitvoering. De huidige input is te breed om “${itemTitle}” concreet uit te werken.`);
  lines.push("");
  if (report.issues.length > 0) {
    lines.push("Wat ontbreekt of te breed is:");
    for (const issue of report.issues) {
      lines.push(`- ${issue.message}`);
    }
    lines.push("");
  }
  if (report.checklist.length > 0) {
    lines.push("Doe dit eerst voordat we content/proposals genereren:");
    for (const item of report.checklist) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }
  lines.push("Suggested next action: werk groeidoel en business profile aan zodat service, doelgroep en locatie scherp zijn — dan opnieuw 'Generate proposal'.");
  return lines.join("\n");
}
