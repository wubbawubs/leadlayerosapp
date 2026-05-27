/**
 * Ticket 1a — Scoring Framework smoke tests.
 * Verifies determinism, graceful degradation, and reasoning population.
 */
import { describe, expect, it } from "vitest";
import {
  SCORING_FRAMEWORK_VERSION,
  calculateConversionReadinessScore,
  calculateDemandCoverageIndex,
  calculateFinancialImpactScenarios,
  calculateGrowthVelocityModel,
  calculateLeadEngineScore,
  type ScoringInputs,
} from "./scoring";

const dallasInputs: ScoringInputs = {
  audit: {
    overallScore: 72,
    issueCounts: { critical: 1, high: 3, medium: 5, low: 8 },
    crawledPages: 24,
  },
  pageIntelligence: {
    totalPages: 12,
    pagesWithCta: 9,
    pagesWithTrust: 6,
    thinPages: 2,
  },
  masterplan: {
    itemCount: 14,
    firstPhaseCount: 5,
    confidence: 0.72,
    prioritizedServices: ["ac repair", "emergency hvac"],
    prioritizedLocations: ["dallas", "plano"],
  },
  businessProfile: {
    hasVertical: true,
    hasPrimaryOffer: true,
    hasIcp: true,
    hasPrimaryCta: true,
    hasProofPoints: false,
    confidence: 7,
  },
  goal: {
    targetType: "clients",
    targetCount: 120,
    currentCount: 36,
    closeRate: 0.35,
    leadValue: 2400,
    timeframeMonths: 12,
    serviceFocusCount: 2,
    locationCount: 2,
    hasTracking: true,
  },
};

describe("Scoring Framework v1", () => {
  it("returns the documented version", () => {
    expect(SCORING_FRAMEWORK_VERSION).toBe("1.0.0");
  });

  it("is deterministic for the same inputs", () => {
    const a = calculateLeadEngineScore(dallasInputs);
    const b = calculateLeadEngineScore(dallasInputs);
    expect(a).toEqual(b);
  });

  it("produces reasoning with affirmative and penalty entries", () => {
    const res = calculateLeadEngineScore(dallasInputs);
    expect(res.reasoning.some((r) => r.kind === "affirmative")).toBe(true);
    expect(res.reasoning.some((r) => r.kind === "penalty")).toBe(true);
    expect(res.score).toBeGreaterThan(0);
    expect(res.score).toBeLessThanOrEqual(100);
  });

  it("degrades gracefully with empty inputs (does not throw)", () => {
    const empty: ScoringInputs = {};
    expect(() => calculateLeadEngineScore(empty)).not.toThrow();
    expect(() => calculateConversionReadinessScore(empty)).not.toThrow();
    expect(() => calculateDemandCoverageIndex(empty)).not.toThrow();
    expect(() => calculateGrowthVelocityModel(empty)).not.toThrow();
    expect(() => calculateFinancialImpactScenarios(empty)).not.toThrow();

    const dci = calculateDemandCoverageIndex(empty);
    expect(dci.isPlaceholder).toBe(true);
    expect(dci.confidence).toBeLessThan(0.5);
  });

  it("financial scenarios scale low < mid < high", () => {
    const f = calculateFinancialImpactScenarios(dallasInputs);
    const [low, mid, high] = f.scenarios;
    expect(low.monthlyRevenue).toBeLessThanOrEqual(mid.monthlyRevenue);
    expect(mid.monthlyRevenue).toBeLessThanOrEqual(high.monthlyRevenue);
    expect(f.assumptions.closeRate).toBe(0.35);
  });

  it("growth velocity projects monotonic cumulative leads over horizon", () => {
    const v = calculateGrowthVelocityModel(dallasInputs);
    expect(v.cumulativeLeads.length).toBe(12);
    for (let i = 1; i < v.cumulativeLeads.length; i++) {
      expect(v.cumulativeLeads[i]).toBeGreaterThanOrEqual(v.cumulativeLeads[i - 1]);
    }
  });

  it("conversion readiness reflects CTA + trust share", () => {
    const r = calculateConversionReadinessScore(dallasInputs);
    expect(r.pagesEvaluated).toBe(12);
    expect(r.score).toBeGreaterThan(40);
  });
});
