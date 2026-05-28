/**
 * Growth Intelligence Snapshot — readiness scoring.
 *
 * Pure. Maps per-module status + confidence to a 0..100 score.
 * Weights mirror the spec in the V1 sprint brief.
 */
import type {
  GrowthIntelligenceSnapshot,
  ModuleStatus,
  OverallStatus,
} from "./schemas";

export const READINESS_WEIGHTS: Record<string, number> = {
  goal: 10,
  business: 12,
  tone: 8,
  website: 12,
  pages: 12,
  market: 12,
  competitors: 10,
  gbp: 8,
  masterplan: 8,
  tracking: 8,
};

const STATUS_BASE: Record<ModuleStatus, number> = {
  missing: 0,
  placeholder: 30,
  partial: 60,
  available: 80,
  reviewed: 95,
  connected: 90,
};

function moduleScore(status: ModuleStatus, confidence: number): number {
  const base = STATUS_BASE[status] ?? 0;
  if (status === "missing" || status === "placeholder") return base;
  // Confidence modulates the high end only.
  const lift = Math.max(0, Math.min(1, confidence)) * (100 - base);
  return Math.round(base + lift * 0.5);
}

type ScoredKey = keyof typeof READINESS_WEIGHTS;

export function calculateReadinessScore(
  slices: Pick<
    GrowthIntelligenceSnapshot,
    "goal" | "business" | "tone" | "website" | "pages" | "market" | "competitors" | "gbp" | "masterplan" | "tracking"
  >,
): { score: number; perModule: Record<ScoredKey, number> } {
  const perModule = {} as Record<ScoredKey, number>;
  let totalWeight = 0;
  let weighted = 0;
  for (const key of Object.keys(READINESS_WEIGHTS) as ScoredKey[]) {
    const s = (slices as Record<string, { status: ModuleStatus; confidence: number }>)[key];
    if (!s) continue;
    const score = moduleScore(s.status, s.confidence);
    perModule[key] = score;
    weighted += score * READINESS_WEIGHTS[key];
    totalWeight += READINESS_WEIGHTS[key];
  }
  const score = totalWeight === 0 ? 0 : Math.round(weighted / totalWeight);
  return { score, perModule };
}

export function deriveOverallStatus(
  readinessScore: number,
  slices: Pick<GrowthIntelligenceSnapshot, "goal" | "business" | "masterplan">,
): OverallStatus {
  if (slices.goal.status === "missing" && slices.business.status === "missing") {
    return "missing";
  }
  if (readinessScore >= 75 && slices.masterplan.status !== "missing") return "ready";
  if (readinessScore >= 60) return "review_required";
  if (readinessScore >= 35) return "partial";
  return "collecting";
}

export function aggregateConfidence(
  slices: Pick<
    GrowthIntelligenceSnapshot,
    "goal" | "business" | "tone" | "website" | "pages" | "market" | "competitors" | "gbp" | "masterplan"
  >,
): number {
  const vals = [
    slices.goal.confidence,
    slices.business.confidence,
    slices.tone.confidence,
    slices.website.confidence,
    slices.pages.confidence,
    slices.market.confidence,
    slices.competitors.confidence,
    slices.gbp.confidence,
    slices.masterplan.confidence,
  ].filter((v) => typeof v === "number" && Number.isFinite(v));
  if (vals.length === 0) return 0;
  return Math.max(0, Math.min(1, vals.reduce((s, v) => s + v, 0) / vals.length));
}
