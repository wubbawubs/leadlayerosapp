/**
 * Competitive Intelligence — Summary builder (Ticket 4).
 *
 * Pure. Builds the CompetitorMatrixSummary that the Blueprint consumes.
 * No DB, no API.
 */

import type {
  Competitor,
  CompetitorGap,
  CompetitorMatrixRow,
  CompetitorMatrixSummary,
  CompetitorScan,
  CompetitorSerpResult,
} from "./schemas";

function median(nums: number[]): number | null {
  const xs = nums.filter((n) => typeof n === "number" && Number.isFinite(n));
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
    : sorted[mid];
}

function toRow(c: Competitor): CompetitorMatrixRow {
  const sb = (c.scoreBreakdown as Record<string, unknown>) ?? {};
  const reviewsUnknown = sb.reviewsUnknown === true;
  const identityMode =
    typeof sb.identityMode === "string"
      ? (sb.identityMode as CompetitorMatrixRow["identityMode"])
      : null;
  const identityConfidence =
    typeof sb.identityConfidence === "number" ? (sb.identityConfidence as number) : null;
  const identityWarnings = Array.isArray(sb.identityWarnings)
    ? (sb.identityWarnings as string[])
    : [];
  const rankingPresence =
    typeof sb.rankingPresence === "string"
      ? (sb.rankingPresence as CompetitorMatrixRow["rankingPresence"])
      : null;
  const temporaryDomain = sb.temporaryDomain === true;
  return {
    domain: c.domain,
    displayName: c.displayName ?? null,
    isSelf: c.isSelf,
    serpAppearanceCount: c.serpAppearanceCount,
    clustersAppearedIn: c.clustersAppearedIn,
    gbpRating: c.gbpRating ?? null,
    gbpReviewCount: c.gbpReviewCount ?? null,
    gbpCategory: c.gbpCategory ?? null,
    servicePagesCount: c.servicePagesCount ?? null,
    locationPagesCount: c.locationPagesCount ?? null,
    trustSignals: c.trustSignals,
    competitorScore: c.competitorScore ?? null,
    scoreConfidence: c.scoreConfidence ?? null,
    dataCompleteness: c.dataCompleteness ?? null,
    reviewsUnknown,
    identityMode,
    identityConfidence,
    identityWarnings,
    rankingPresence,
    temporaryDomain,
  };
}

export function buildCompetitorMatrixSummary(
  scan: CompetitorScan | null,
  competitors: Competitor[],
  _serpResults: CompetitorSerpResult[],
): CompetitorMatrixSummary {
  if (!scan) {
    return {
      available: false,
      scanId: null,
      scanCompletedAt: null,
      status: null,
      partial: false,
      clustersScanned: 0,
      serpResultsCollected: 0,
      competitorCount: 0,
      self: null,
      rows: [],
      medianCompetitorScore: null,
      selfScore: null,
      gaps: [],
      warnings: [],
      source: "dataforseo+firecrawl",
    };
  }

  const selfComp = competitors.find((c) => c.isSelf) ?? null;
  const others = competitors.filter((c) => !c.isSelf);

  const rows = [...others]
    .sort((a, b) => (b.competitorScore ?? -1) - (a.competitorScore ?? -1))
    .map(toRow);
  const self = selfComp ? toRow(selfComp) : null;

  const competitorScores = others
    .map((c) => c.competitorScore)
    .filter((s): s is number => typeof s === "number");
  const medianCompetitorScore = median(competitorScores);
  const selfScore = self?.competitorScore ?? null;

  const gaps: CompetitorGap[] = [];
  if (self) {
    // Reviews gap
    const compReviewCounts = others
      .map((c) => c.gbpReviewCount)
      .filter((n): n is number => typeof n === "number");
    if (
      compReviewCounts.length > 0 &&
      (self.gbpReviewCount ?? 0) < (median(compReviewCounts) ?? 0)
    ) {
      gaps.push({
        label: "Review volume",
        detail:
          "Top competitors have a larger reviewed footprint on Google. Closing this gap is the single highest-leverage trust move.",
        selfValue: self.gbpReviewCount,
        competitorMedian: median(compReviewCounts),
      });
    }
    // Service page depth
    const compSvc = others
      .map((c) => c.servicePagesCount)
      .filter((n): n is number => typeof n === "number");
    if (
      compSvc.length > 0 &&
      (self.servicePagesCount ?? 0) < (median(compSvc) ?? 0)
    ) {
      gaps.push({
        label: "Service page coverage",
        detail:
          "Competitors maintain more dedicated service pages, capturing intent that currently routes around your site.",
        selfValue: self.servicePagesCount,
        competitorMedian: median(compSvc),
      });
    }
    // Location page depth
    const compLoc = others
      .map((c) => c.locationPagesCount)
      .filter((n): n is number => typeof n === "number");
    if (
      compLoc.length > 0 &&
      (self.locationPagesCount ?? 0) < (median(compLoc) ?? 0)
    ) {
      gaps.push({
        label: "Location coverage",
        detail:
          "Competitors publish more location-specific pages, winning city-level queries you should be present for.",
        selfValue: self.locationPagesCount,
        competitorMedian: median(compLoc),
      });
    }
    // SERP appearances
    const compSerp = others.map((c) => c.serpAppearanceCount);
    const selfSerp = self.serpAppearanceCount;
    if (compSerp.length > 0 && selfSerp < (median(compSerp) ?? 0)) {
      gaps.push({
        label: "Local SERP presence",
        detail:
          "Across the scanned local clusters, competitors appear more frequently in top SERP positions.",
        selfValue: selfSerp,
        competitorMedian: median(compSerp),
      });
    }
  }

  const warnings: string[] = [];
  if (scan.partial) {
    warnings.push(
      "Scan completed partially — some clusters or competitors returned errors. Scores reflect available data only.",
    );
  }
  if (others.length === 0) {
    warnings.push("No external competitors were captured in this scan.");
  }
  if (!self) {
    warnings.push("Self row is missing — tenant domain could not be resolved.");
  } else {
    if (self.identityMode === "profile_baseline" || self.identityMode === "unknown_baseline") {
      warnings.push(
        "Client site was not found in scanned SERPs. Gaps are based on connected site / profile baseline vs observed competitors.",
      );
    } else if (self.identityMode === "connected_site") {
      warnings.push(
        "Connected domain was not visible in scanned SERPs. Self-row uses connected-site baseline.",
      );
    }
    if (self.temporaryDomain) {
      warnings.push(
        "Connected domain appears temporary. Competitive comparison uses profile/site baseline.",
      );
    }
    for (const w of self.identityWarnings ?? []) {
      if (!warnings.includes(w)) warnings.push(w);
    }
  }

  return {
    available: true,
    scanId: scan.id,
    scanCompletedAt: scan.scanCompletedAt ?? null,
    status: scan.status,
    partial: scan.partial,
    clustersScanned: scan.clustersScanned ?? 0,
    serpResultsCollected: scan.serpResultsCollected ?? 0,
    competitorCount: others.length,
    self,
    rows,
    medianCompetitorScore,
    selfScore,
    gaps: gaps.slice(0, 3),
    warnings,
    source: scan.source ?? "dataforseo+firecrawl",
  };
}
