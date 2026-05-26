/**
 * Masterplan V2 — phase logic + lead intent scoring.
 *
 * Deterministic. No LLM. Used by the generator to:
 *  - score each service item on lead intent / urgency / value
 *  - assign a phase: first_30_days | days_31_60 | days_61_90 | backlog
 *  - apply per-phase focus limits and push overflow to backlog
 */

import type { MasterplanItemType, MasterplanItemPriority } from "./schemas";

export const MASTERPLAN_PHASES = [
  "first_30_days",
  "days_31_60",
  "days_61_90",
  "backlog",
] as const;
export type MasterplanPhase = (typeof MASTERPLAN_PHASES)[number];

export const PHASE_LIMITS: Record<MasterplanPhase, number> = {
  first_30_days: 6,
  days_31_60: 6,
  days_61_90: 5,
  backlog: 999,
};

export const PHASE_LABEL: Record<MasterplanPhase, string> = {
  first_30_days: "First 30 days",
  days_31_60: "Days 31–60",
  days_61_90: "Days 61–90",
  backlog: "Backlog",
};

// ---------------------------------------------------------------------------
// Lead intent scoring for service items (HVAC + general home services).
// ---------------------------------------------------------------------------

export interface ServiceIntentScore {
  leadIntent: number; // 0-10 — how directly people search this when ready to buy/book now
  urgency: number; // 0-10 — emergency / now / today
  value: number; // 0-10 — revenue-per-job for the business
  category: "emergency" | "repair" | "install" | "maintenance" | "seasonal" | "generic";
  reason: string;
}

const EMERGENCY_TERMS = [
  "emergency",
  "noodgeval",
  "spoed",
  "24/7",
  "same day",
  "today",
  "urgent",
  "no cooling",
  "no heat",
  "no ac",
  "broken",
];

const REPAIR_TERMS = [
  "repair",
  "fix",
  "fixing",
  "service call",
  "diagnostic",
  "reparatie",
  "storing",
  "troubleshoot",
];

const INSTALL_TERMS = [
  "installation",
  "install",
  "replacement",
  "replace",
  "new system",
  "upgrade",
  "installatie",
  "vervangen",
];

const MAINTENANCE_TERMS = [
  "maintenance",
  "tune up",
  "tune-up",
  "tuneup",
  "service plan",
  "inspection",
  "check up",
  "onderhoud",
];

const SEASONAL_HEATING_TERMS = [
  "furnace",
  "heating",
  "heater",
  "boiler",
  "verwarming",
  "cv ketel",
];

const SEASONAL_COOLING_TERMS = [
  "air conditioning",
  "ac ",
  "ac-",
  " ac",
  "cooling",
  "airco",
];

function hasTerm(haystack: string, terms: string[]): boolean {
  const h = ` ${haystack.toLowerCase()} `;
  return terms.some((t) => h.includes(t.toLowerCase()));
}

/**
 * Score a service focus string for lead intent. Pure heuristic; deterministic.
 */
export function scoreServiceIntent(service: string): ServiceIntentScore {
  const s = service.trim();

  if (hasTerm(s, EMERGENCY_TERMS)) {
    return {
      leadIntent: 10,
      urgency: 10,
      value: 7,
      category: "emergency",
      reason: "Emergency search intent — highest immediate lead conversion.",
    };
  }

  if (hasTerm(s, REPAIR_TERMS)) {
    // Repair is high-intent. Cooling repair tends to outrank heating outside winter.
    const cooling = hasTerm(s, SEASONAL_COOLING_TERMS);
    const heating = hasTerm(s, SEASONAL_HEATING_TERMS);
    return {
      leadIntent: 9,
      urgency: cooling ? 9 : heating ? 7 : 8,
      value: 6,
      category: "repair",
      reason: cooling
        ? "Repair + cooling — high lead intent, typically year-round demand in warm climates."
        : heating
          ? "Repair + heating — seasonal demand; high intent during heating season."
          : "Repair intent — strong direct lead conversion.",
    };
  }

  if (hasTerm(s, INSTALL_TERMS)) {
    return {
      leadIntent: 6,
      urgency: 4,
      value: 10,
      category: "install",
      reason:
        "Installation / replacement — high ticket value but longer consideration cycle than repair.",
    };
  }

  if (hasTerm(s, MAINTENANCE_TERMS)) {
    return {
      leadIntent: 5,
      urgency: 3,
      value: 5,
      category: "maintenance",
      reason: "Maintenance — recurring revenue, lower immediate urgency.",
    };
  }

  if (hasTerm(s, SEASONAL_HEATING_TERMS)) {
    return {
      leadIntent: 6,
      urgency: 5,
      value: 6,
      category: "seasonal",
      reason: "Heating-related service — seasonal; lower priority outside winter.",
    };
  }

  if (hasTerm(s, SEASONAL_COOLING_TERMS)) {
    return {
      leadIntent: 7,
      urgency: 6,
      value: 6,
      category: "seasonal",
      reason: "Cooling-related service — high demand in warm climates.",
    };
  }

  return {
    leadIntent: 5,
    urgency: 4,
    value: 5,
    category: "generic",
    reason: "Generic service — no strong intent signal detected.",
  };
}

// ---------------------------------------------------------------------------
// Phase assignment.
// ---------------------------------------------------------------------------

export interface PhaseInput {
  type: MasterplanItemType;
  priority: MasterplanItemPriority;
  metadata?: Record<string, unknown>;
  isExistingPage?: boolean;
  intent?: ServiceIntentScore | null;
  locationIndex?: number; // 0-based — used to phase out extra location pages
  needsContext?: boolean;
}

export interface PhaseResult {
  phase: MasterplanPhase;
  reason: string;
}

/**
 * Deterministic phase assignment. Honors lead intent + existing-page logic
 * + location ordering. Confidence/limits are applied later in a second pass.
 */
export function assignPhase(input: PhaseInput): PhaseResult {
  const { type, intent, isExistingPage, locationIndex, needsContext } = input;

  if (needsContext) {
    return {
      phase: "first_30_days",
      reason: "Resolves a context gap that blocks downstream execution.",
    };
  }

  switch (type) {
    case "tracking":
      return {
        phase: "first_30_days",
        reason: "Measurement is a prerequisite — without tracking we cannot prove lead lift.",
      };

    case "gbp":
      return {
        phase: "first_30_days",
        reason: "Google Business Profile is the highest-ROI local lead surface — foundation first.",
      };

    case "conversion":
      return {
        phase: "first_30_days",
        reason: "Primary CTA and lead path must work before driving more traffic.",
      };

    case "service_page": {
      // High-intent services live in first 30 days when missing.
      if (intent && (intent.category === "emergency" || intent.leadIntent >= 9)) {
        return {
          phase: "first_30_days",
          reason: `${intent.reason} — fast track to capture immediate demand.`,
        };
      }
      if (intent && intent.category === "repair") {
        return {
          phase: "first_30_days",
          reason: `${intent.reason}`,
        };
      }
      if (intent && intent.category === "install") {
        return {
          phase: "days_31_60",
          reason: `${intent.reason}`,
        };
      }
      if (intent && intent.category === "maintenance") {
        return {
          phase: "days_61_90",
          reason: `${intent.reason}`,
        };
      }
      return {
        phase: "days_31_60",
        reason: "New service page — sequenced after foundation and highest-intent items.",
      };
    }

    case "website_fix": {
      // Optimizing an existing high-intent page beats building a new lower-intent one.
      if (isExistingPage && intent && intent.leadIntent >= 8) {
        return {
          phase: "first_30_days",
          reason: `Existing high-intent page — optimizing converts demand we already attract. ${intent.reason}`,
        };
      }
      if (isExistingPage) {
        return {
          phase: "days_31_60",
          reason: "Existing page optimization — sequenced after foundation.",
        };
      }
      return {
        phase: "days_31_60",
        reason: "Website fix — bundled after foundation and highest-intent pages.",
      };
    }

    case "location_page": {
      if (locationIndex == null || locationIndex === 0) {
        return {
          phase: "days_31_60",
          reason: "Primary location — start after core service + conversion foundation.",
        };
      }
      if (locationIndex === 1) {
        return {
          phase: "days_31_60",
          reason: "Secondary location — second of two priority cities.",
        };
      }
      if (locationIndex === 2) {
        return {
          phase: "days_61_90",
          reason: "Tertiary location — phased after the primary city pair.",
        };
      }
      return {
        phase: "backlog",
        reason: "Additional location — not yet validated; promote when primary cities convert.",
      };
    }

    case "review":
      return {
        phase: "days_31_60",
        reason: "Review flow — most effective after GBP and conversion paths are live.",
      };

    case "content":
      return {
        phase: "days_61_90",
        reason: "Supporting content cluster — strengthens authority once service pages exist.",
      };

    case "reporting":
      return {
        phase: "days_61_90",
        reason: "Monthly reporting cycle — meaningful once first-30 actions have produced data.",
      };
  }
}

// ---------------------------------------------------------------------------
// Focus limits — push overflow into backlog. Keeps each phase actionable.
// ---------------------------------------------------------------------------

export interface PhasedItem {
  phase: MasterplanPhase;
  priority: MasterplanItemPriority;
  intent?: ServiceIntentScore | null;
}

const PRIORITY_WEIGHT: Record<MasterplanItemPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Sort by priority (desc), then by lead intent (desc). Stable for ties.
 */
export function rankWithinPhase<T extends PhasedItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const p = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (p !== 0) return p;
    const ai = a.intent?.leadIntent ?? 0;
    const bi = b.intent?.leadIntent ?? 0;
    return bi - ai;
  });
}

/**
 * Apply phase limits — overflow per phase is demoted to backlog.
 * Mutates a copy; returns new array with possibly updated `phase`.
 */
export function applyPhaseLimits<T extends PhasedItem>(items: T[]): T[] {
  const buckets: Record<MasterplanPhase, T[]> = {
    first_30_days: [],
    days_31_60: [],
    days_61_90: [],
    backlog: [],
  };
  for (const it of items) buckets[it.phase].push(it);

  const out: T[] = [];
  for (const phase of ["first_30_days", "days_31_60", "days_61_90"] as const) {
    const ranked = rankWithinPhase(buckets[phase]);
    const limit = PHASE_LIMITS[phase];
    const kept = ranked.slice(0, limit);
    const overflow = ranked.slice(limit).map((it) => ({ ...it, phase: "backlog" as const }));
    out.push(...kept, ...overflow);
  }
  out.push(...buckets.backlog);
  return out;
}
