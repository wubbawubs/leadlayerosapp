/**
 * Intelligence Pipeline Orchestrator V1 — schemas.
 *
 * Pure types. The orchestrator runs every intelligence module in dependency
 * order against a single `intelligence_runs` row.
 *
 * See: docs/INTELLIGENCE_PIPELINE_ORCHESTRATOR_V1.md
 */

export const INTELLIGENCE_PIPELINE_VERSION = "1.0.0";

export const INTELLIGENCE_STAGE_KEYS = [
  "site_audit",
  "page_intelligence",
  "business_profile_draft",
  "tone_profile_draft",
  "gbp_intelligence",
  "market_scan",
  "competitor_scan",
  "tracking_baseline",
  "ranking_baseline_placeholder",
  "growth_snapshot",
  "blueprint_draft",
  "masterplan_draft",
  "operator_review_ready",
] as const;

export type IntelligenceStageKey = (typeof INTELLIGENCE_STAGE_KEYS)[number];

export type IntelligenceStageStatus =
  | "not_started"
  | "running"
  | "complete"
  | "partial"
  | "failed"
  | "skipped_needs_context"
  | "blocked_dependency"
  | "stale";

export type IntelligenceRunStatus =
  | "queued"
  | "running"
  | "partial"
  | "completed"
  | "failed"
  | "cancelled";

export type IntelligenceTriggeredBy = "auto" | "operator" | "system" | "scheduled";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface IntelligenceStageState {
  key: IntelligenceStageKey;
  status: IntelligenceStageStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  message?: string | null;
  error?: string | null;
  nextAction?: string | null;
  outputs?: { [key: string]: JsonValue };
}

export type IntelligenceStagesMap = Record<
  IntelligenceStageKey,
  IntelligenceStageState
>;

export interface IntelligenceRun {
  id: string;
  tenantId: string;
  siteId: string | null;
  growthGoalId: string | null;
  status: IntelligenceRunStatus;
  currentStage: IntelligenceStageKey | null;
  triggeredBy: IntelligenceTriggeredBy;
  triggerReason: string | null;
  stages: IntelligenceStagesMap;
  inputHash: { [key: string]: JsonValue };
  outputRefs: { [key: string]: JsonValue };
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StartIntelligenceRunInput {
  tenantId: string;
  siteId?: string | null;
  growthGoalId?: string | null;
  triggeredBy?: IntelligenceTriggeredBy;
  triggerReason?: string | null;
}

export interface AdvanceIntelligenceRunInput {
  tenantId: string;
  intelligenceRunId: string;
}

export const STAGE_LABELS: Record<IntelligenceStageKey, string> = {
  site_audit: "Site audit",
  page_intelligence: "Page intelligence",
  business_profile_draft: "Business profile",
  tone_profile_draft: "Tone of voice",
  gbp_intelligence: "GBP intelligence",
  market_scan: "Market scan",
  competitor_scan: "Competitor scan",
  tracking_baseline: "Tracking baseline",
  ranking_baseline_placeholder: "Ranking baseline",
  growth_snapshot: "Growth intelligence snapshot",
  blueprint_draft: "Blueprint draft",
  masterplan_draft: "Masterplan draft",
  operator_review_ready: "Operator review",
};

export function emptyStagesMap(): IntelligenceStagesMap {
  const out = {} as IntelligenceStagesMap;
  for (const key of INTELLIGENCE_STAGE_KEYS) {
    out[key] = { key, status: "not_started" };
  }
  return out;
}

/**
 * Dependency-aware downstream invalidation map.
 * Used by markDownstreamStagesStale.
 */
export const STALE_DEPENDENCY_MAP: Record<string, IntelligenceStageKey[]> = {
  business_profile: [
    "market_scan",
    "competitor_scan",
    "growth_snapshot",
    "blueprint_draft",
    "masterplan_draft",
  ],
  tone_profile: ["growth_snapshot", "blueprint_draft"],
  growth_goal: [
    "market_scan",
    "competitor_scan",
    "growth_snapshot",
    "blueprint_draft",
    "masterplan_draft",
  ],
  gbp: ["growth_snapshot", "blueprint_draft", "masterplan_draft"],
  page_intelligence: ["growth_snapshot", "blueprint_draft", "masterplan_draft"],
};
