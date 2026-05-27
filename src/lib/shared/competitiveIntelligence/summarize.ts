/**
 * Competitive Intelligence — Summary builder (Ticket 4 + 4b).
 *
 * Pure. Builds the CompetitorMatrixSummary that the Blueprint consumes.
 * No DB, no API.
 *
 * Ticket 4b: splits competitors into direct local businesses vs SERP
 * intermediaries (directories, aggregators, content/listicles) so the
 * Blueprint can present them differently and so directories don't
 * dominate the median competitor score.
 */

import type {
  Competitor,
  CompetitorGap,
  CompetitorMatrixRow,
  CompetitorMatrixSummary,
  CompetitorScan,
  CompetitorSerpResult,
  CompetitorTypeSchema,
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

const INTERMEDIARY_TYPES: ReadonlySet<CompetitorTypeSchema> = new Set([
  "directory",
  "aggregator",
  "content",
]);

function isIntermediaryType(t: CompetitorTypeSchema | null | undefined): boolean {
  return !!t && INTERMEDIARY_TYPES.has(t);
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
  const competitorType =
    typeof sb.competitorType === "string"
      ? (sb.competitorType as CompetitorTypeSchema)
      : null;
  const competitorTypeConfidence =
    typeof sb.competitorTypeConfidence === "number"
      ? (sb.competitorTypeConfidence as number)
      : null;
  const competitorTypeReasons = Array.isArray(sb.competitorTypeReasons)
    ? (sb.competitorTypeReasons as string[])
    : [];

  // Phase B fields, stored in score_breakdown to avoid DB migrations.
  const localPackMatched = sb.localPackMatched === true;
  const localPackMatchConfidence =
    typeof sb.localPackMatchConfidence === "number"
      ? (sb.localPackMatchConfidence as number)
      : null;
  const localPackMatchSignals = Array.isArray(sb.localPackMatchSignals)
    ? (sb.localPackMatchSignals as string[])
    : [];
  const pageDepthLimited = sb.pageDepthLimited === true;
  const pageDepthUnknownReason =
    typeof sb.pageDepthUnknownReason === "string"
      ? (sb.pageDepthUnknownReason as string)
      : null;
  const servicePageSamples = Array.isArray(sb.servicePageSamples)
    ? (sb.servicePageSamples as Array<{ url: string; matchedReason: string }>)
    : [];
  const locationPageSamples = Array.isArray(sb.locationPageSamples)
    ? (sb.locationPageSamples as Array<{ url: string; matchedReason: string }>)
    : [];
  const servicePagesConfidence =
    sb.servicePagesConfidence === "high" || sb.servicePagesConfidence === "medium" || sb.servicePagesConfidence === "low"
      ? (sb.servicePagesConfidence as "high" | "medium" | "low")
      : null;
  const locationPagesConfidence =
    sb.locationPagesConfidence === "high" || sb.locationPagesConfidence === "medium" || sb.locationPagesConfidence === "low"
      ? (sb.locationPagesConfidence as "high" | "medium" | "low")
      : null;
  const contentPagesCount =
    typeof sb.contentPagesCount === "number" ? (sb.contentPagesCount as number) : null;
  const excludedCandidateCount =
    typeof sb.excludedCandidateCount === "number" ? (sb.excludedCandidateCount as number) : null;
  const classifierWarnings = Array.isArray(sb.classifierWarnings)
    ? (sb.classifierWarnings as string[])
    : [];
  const existingServicePagesCount =
    typeof sb.existingServicePagesCount === "number"
      ? (sb.existingServicePagesCount as number)
      : null;
  const existingLocationPagesCount =
    typeof sb.existingLocationPagesCount === "number"
      ? (sb.existingLocationPagesCount as number)
      : null;
  const plannedServicePagesCount =
    typeof sb.plannedServicePagesCount === "number"
      ? (sb.plannedServicePagesCount as number)
      : null;
  const plannedLocationPagesCount =
    typeof sb.plannedLocationPagesCount === "number"
      ? (sb.plannedLocationPagesCount as number)
      : null;

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
    competitorType,
    competitorTypeConfidence,
    competitorTypeReasons,
    localPackMatched,
    localPackMatchConfidence,
    localPackMatchSignals,
    pageDepthLimited,
    pageDepthUnknownReason,
    servicePageSamples,
    locationPageSamples,
    servicePagesConfidence,
    locationPagesConfidence,
    contentPagesCount,
    excludedCandidateCount,
    classifierWarnings,
    existingServicePagesCount,
    existingLocationPagesCount,
    plannedServicePagesCount,
    plannedLocationPagesCount,
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
      directRows: [],
      intermediaryRows: [],
      directCompetitorCount: 0,
      intermediaryCount: 0,
      medianCompetitorScore: null,
      medianDirectCompetitorScore: null,
      selfScore: null,
      gaps: [],
      warnings: [],
      source: "dataforseo+firecrawl",
    };
  }

  const selfComp = competitors.find((c) => c.isSelf) ?? null;
  const others = competitors.filter((c) => !c.isSelf);

  const allRows = [...others]
    .sort((a, b) => (b.competitorScore ?? -1) - (a.competitorScore ?? -1))
    .map(toRow);
  const self = selfComp ? toRow(selfComp) : null;

  const directRows = allRows.filter((r) => !isIntermediaryType(r.competitorType));
  const intermediaryRows = allRows.filter((r) => isIntermediaryType(r.competitorType));

  // Use direct competitors for median + gap computation when available.
  const gapBaseRows = directRows.length >= 2 ? directRows : allRows;

  const allScores = allRows
    .map((r) => r.competitorScore)
    .filter((s): s is number => typeof s === "number");
  const directScores = directRows
    .map((r) => r.competitorScore)
    .filter((s): s is number => typeof s === "number");
  const medianCompetitorScore = median(allScores);
  const medianDirectCompetitorScore = median(directScores);
  const selfScore = self?.competitorScore ?? null;

  const gaps: CompetitorGap[] = [];
  let reviewComparisonLimited = false;
  if (self) {
    const reviewCoverage =
      gapBaseRows.length > 0
        ? gapBaseRows.filter((r) => typeof r.gbpReviewCount === "number").length /
          gapBaseRows.length
        : 0;
    const compReviewCounts = gapBaseRows
      .map((r) => r.gbpReviewCount)
      .filter((n): n is number => typeof n === "number");
    // Phase B: only surface "review volume" as a gap when ≥50% of direct
    // competitors actually have review data — otherwise it's noise.
    if (
      reviewCoverage >= 0.5 &&
      compReviewCounts.length > 0 &&
      (self.gbpReviewCount ?? 0) < (median(compReviewCounts) ?? 0)
    ) {
      const matchedCount = gapBaseRows.filter((r) => typeof r.gbpReviewCount === "number").length;
      gaps.push({
        label: "Review volume",
        detail:
          `Top competitors have a larger reviewed footprint on Google. Closing this gap is the single highest-leverage trust move. Based on matched review data for ${matchedCount}/${gapBaseRows.length} direct competitors.`,
        selfValue: self.gbpReviewCount,
        competitorMedian: median(compReviewCounts),
      });
    } else if (compReviewCounts.length > 0 && reviewCoverage < 0.5) {
      reviewComparisonLimited = true;
    }
    const compSvc = gapBaseRows
      .map((r) => r.servicePagesCount)
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
    const compLoc = gapBaseRows
      .map((r) => r.locationPagesCount)
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
    const compSerp = gapBaseRows.map((r) => r.serpAppearanceCount);
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
  if (reviewComparisonLimited) {
    warnings.push(
      "Review comparison limited because local-pack matches were incomplete. Review-volume gap is suppressed until more competitors are matched.",
    );
  }
  if (allRows.length === 0) {
    warnings.push("No external competitors were captured in this scan.");
  }
  if (intermediaryRows.length > 0) {
    warnings.push(
      `${intermediaryRows.length} SERP result${intermediaryRows.length === 1 ? "" : "s"} appear to be directories or listicles. They are shown separately as SERP intermediaries and excluded from direct competitor scoring.`,
    );
  }
  if (directRows.length > 0 && directRows.length < 2) {
    warnings.push(
      "Only one direct local-business competitor was captured. Gap analysis falls back to all captured rows.",
    );
  }
  const noisyRows = directRows.filter((r) =>
    (r.classifierWarnings ?? []).includes("classifier_noise_detected") ||
    (r.classifierWarnings ?? []).includes("location_count_needs_validation"),
  );
  if (noisyRows.length > 0) {
    warnings.push(
      `Page-depth scan included noisy candidates for ${noisyRows.length} competitor${noisyRows.length === 1 ? "" : "s"}; counts need validation.`,
    );
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
    competitorCount: allRows.length,
    self,
    rows: allRows,
    directRows,
    intermediaryRows,
    directCompetitorCount: directRows.length,
    intermediaryCount: intermediaryRows.length,
    medianCompetitorScore,
    medianDirectCompetitorScore,
    selfScore,
    gaps: gaps.slice(0, 3),
    warnings,
    source: scan.source ?? "dataforseo+firecrawl",
  };
}
