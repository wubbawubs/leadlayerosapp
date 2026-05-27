/**
 * Competitive Intelligence — Scoring (Ticket 4).
 *
 * Pure scoring functions. No DB, no API, no randomness.
 * Unknowns lower confidence — they do NOT silently inflate scores.
 */

import type { TrustSignals } from "./schemas";

export function normalizeCompetitorDomain(urlOrDomain: string): string {
  if (!urlOrDomain) return "";
  let s = urlOrDomain.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.split("/")[0];
  s = s.split("?")[0];
  s = s.split("#")[0];
  return s;
}

export type PageDepthConfidence = "high" | "medium" | "low";

export interface CompetitorScoreInput {
  clustersAppearedIn: number;
  clustersScanned: number;
  serpAppearanceCount: number;
  totalSerpSlotsScanned: number;
  reviewCount: number | null;
  reviewRating: number | null;
  servicePagesCount: number | null;
  locationPagesCount: number | null;
  servicesCount: number;
  locationsCount: number;
  trustSignals: TrustSignals;
  /** Phase B2 — discount page-depth credit when classifier was noisy. */
  servicePagesConfidence?: PageDepthConfidence;
  locationPagesConfidence?: PageDepthConfidence;
}

export interface CompetitorScoreBreakdown {
  localPackComponent: number;
  reviewsComponent: number;
  pageDepthComponent: number;
  trustComponent: number;
  serpComponent: number;
  reviewsUnknown: boolean;
  pagesUnknown: boolean;
}

export interface CompetitorScoreResult {
  total: number;
  breakdown: CompetitorScoreBreakdown;
}

function confidenceWeight(c: PageDepthConfidence | undefined): number {
  if (c === "low") return 0.25;
  if (c === "medium") return 0.6;
  return 1; // high (or undefined for backwards compat)
}

/**
 * V1 competitor score (0..100).
 *  A. Local pack presence (0..30)
 *  B. Reviews (0..25) — null reviews give a low-confidence neutral value (8)
 *     and flip reviewsUnknown=true so confidence drops.
 *  C. Page depth (0..25)
 *  D. Trust signals (0..10)
 *  E. SERP presence (0..10)
 */
export function computeCompetitorScore(
  input: CompetitorScoreInput,
): CompetitorScoreResult {
  // A. local pack
  const localPackComponent =
    input.clustersScanned > 0
      ? Math.round(
          30 *
            Math.min(1, input.clustersAppearedIn / input.clustersScanned),
        )
      : 0;

  // B. reviews
  let reviewsComponent = 0;
  let reviewsUnknown = false;
  if (
    typeof input.reviewCount === "number" &&
    typeof input.reviewRating === "number" &&
    input.reviewCount > 0 &&
    input.reviewRating > 0
  ) {
    const sizeScore = Math.min(25, Math.log10(input.reviewCount + 1) * 9);
    reviewsComponent = Math.round(
      sizeScore * Math.max(0, Math.min(1, input.reviewRating / 5)),
    );
  } else {
    // Unknown reviews — neutral low-confidence value, flagged.
    reviewsComponent = 8;
    reviewsUnknown = true;
  }

  // C. page depth
  let pageDepthComponent = 0;
  let pagesUnknown = false;
  if (
    input.servicePagesCount == null &&
    input.locationPagesCount == null
  ) {
    pagesUnknown = true;
    pageDepthComponent = 8; // neutral low-confidence
  } else {
    const serviceRatio =
      input.servicesCount > 0
        ? Math.min(1, (input.servicePagesCount ?? 0) / input.servicesCount)
        : 0;
    const locationRatio =
      input.locationsCount > 0
        ? Math.min(1, (input.locationPagesCount ?? 0) / input.locationsCount)
        : 0;
    pageDepthComponent = Math.round(15 * serviceRatio + 10 * locationRatio);
  }

  // D. trust
  let trustComponent = 0;
  if (input.trustSignals.emergency) trustComponent += 3;
  if (input.trustSignals.licensing || input.trustSignals.certifications.length > 0)
    trustComponent += 3;
  if (input.trustSignals.phone && input.trustSignals.address) trustComponent += 4;
  trustComponent = Math.min(10, trustComponent);

  // E. SERP presence (organic across all clusters)
  const serpComponent =
    input.totalSerpSlotsScanned > 0
      ? Math.round(
          10 *
            Math.min(1, input.serpAppearanceCount / input.totalSerpSlotsScanned),
        )
      : 0;

  const total = Math.max(
    0,
    Math.min(
      100,
      localPackComponent +
        reviewsComponent +
        pageDepthComponent +
        trustComponent +
        serpComponent,
    ),
  );

  return {
    total,
    breakdown: {
      localPackComponent,
      reviewsComponent,
      pageDepthComponent,
      trustComponent,
      serpComponent,
      reviewsUnknown,
      pagesUnknown,
    },
  };
}

export interface ConfidenceInput {
  localPackDataPresent: boolean;
  reviewDataPresent: boolean;
  firecrawlMapSuccess: boolean;
  homepageScrapeSuccess: boolean;
  pageCountsAvailable: boolean;
  /** Phase B — optional dimensions. Older callers can omit. */
  competitorTypeKnown?: boolean;
  /** 0..1 match strength when local-pack ↔ competitor was attempted. */
  localPackMatchConfidence?: number | null;
  /** True when Firecrawl map returned very few URLs (page-depth unreliable). */
  firecrawlMapLimited?: boolean;
  /** True when only SERP presence is known (no Firecrawl, no reviews). */
  serpOnly?: boolean;
}

/**
 * Returns 0..1 confidence based on signal completeness, with Phase B caps:
 *  - reviews + page depth both unknown  → ≤0.50
 *  - Firecrawl map failed               → ≤0.60
 *  - SERP-only signal                   → ≤0.45
 *  - competitor type unknown            → −0.10
 *  - local-pack match attempted but weak → −0.10
 *  - Firecrawl map limited              → −0.10
 */
export function computeScoreConfidence(input: ConfidenceInput): number {
  const weights = {
    localPackDataPresent: 0.2,
    reviewDataPresent: 0.25,
    firecrawlMapSuccess: 0.15,
    homepageScrapeSuccess: 0.1,
    pageCountsAvailable: 0.2,
    competitorTypeKnown: 0.1,
  };
  let score = 0;
  for (const [k, w] of Object.entries(weights)) {
    const v = (input as unknown as Record<string, boolean | undefined>)[k];
    if (v === true) score += w;
  }

  if (input.competitorTypeKnown === false) score -= 0.1;
  if (
    typeof input.localPackMatchConfidence === "number" &&
    input.localPackMatchConfidence > 0 &&
    input.localPackMatchConfidence < 0.6
  ) {
    score -= 0.1;
  }
  if (input.firecrawlMapLimited === true) score -= 0.1;

  let capped = Math.max(0, Math.min(1, score));

  const reviewsUnknown = !input.reviewDataPresent;
  const pageDepthUnknown = !input.pageCountsAvailable;
  if (reviewsUnknown && pageDepthUnknown) capped = Math.min(capped, 0.5);
  if (input.firecrawlMapSuccess === false) capped = Math.min(capped, 0.6);
  if (input.serpOnly === true) capped = Math.min(capped, 0.45);

  return Math.max(0, Math.min(1, Math.round(capped * 100) / 100));
}

export function computeDataCompleteness(input: ConfidenceInput): number {
  // Data completeness ignores the caps — it's a pure "% of signals present" view.
  const weights = {
    localPackDataPresent: 0.2,
    reviewDataPresent: 0.25,
    firecrawlMapSuccess: 0.15,
    homepageScrapeSuccess: 0.1,
    pageCountsAvailable: 0.2,
    competitorTypeKnown: 0.1,
  };
  let score = 0;
  for (const [k, w] of Object.entries(weights)) {
    const v = (input as unknown as Record<string, boolean | undefined>)[k];
    if (v === true) score += w;
  }
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}
