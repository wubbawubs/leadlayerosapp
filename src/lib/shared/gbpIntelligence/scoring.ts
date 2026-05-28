/**
 * GBP Intelligence V1 — pure scoring + summarization.
 *
 * Conservative scoring: unknown data does NOT inflate scores. We surface
 * gaps explicitly rather than hiding them with optimistic defaults.
 */
import {
  gbpStatusLabel,
  type GbpGap,
  type GbpProfile,
  type GbpRecommendation,
  type GbpSummary,
} from "./schemas";

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Completeness — does the profile have the structural fields a local business needs. */
export function calculateGbpCompletenessScore(p: GbpProfile | null): number {
  if (!p) return 0;
  let s = 0;
  if (p.businessName) s += 12;
  if (p.primaryCategory) s += 14;
  if (p.websiteUrl) s += 10;
  if (p.phone) s += 10;
  if (p.address) s += 10;
  if (p.services.length > 0) s += 14;
  if (p.serviceArea.length > 0) s += 10;
  if (p.photosStatus !== "unknown" && p.photosStatus !== "missing")
    s += p.photosStatus === "strong" ? 10 : p.photosStatus === "ok" ? 8 : 5;
  if (p.postsStatus !== "unknown" && p.postsStatus !== "inactive")
    s += p.postsStatus === "active" ? 10 : 6;
  return clamp(s);
}

/** Trust — reviews, ratings, NAP consistency. */
export function calculateGbpTrustScore(p: GbpProfile | null): number {
  if (!p) return 0;
  let s = 0;
  if (p.reviewCount != null) {
    if (p.reviewCount >= 100) s += 30;
    else if (p.reviewCount >= 50) s += 24;
    else if (p.reviewCount >= 20) s += 16;
    else if (p.reviewCount >= 5) s += 8;
    else s += 2;
  }
  if (p.rating != null) {
    if (p.rating >= 4.7) s += 25;
    else if (p.rating >= 4.3) s += 18;
    else if (p.rating >= 4.0) s += 10;
    else s += 4;
  }
  if (p.napConsistency === "consistent") s += 20;
  else if (p.napConsistency === "partial") s += 10;
  if (p.photosStatus === "strong") s += 10;
  else if (p.photosStatus === "ok") s += 6;
  if (p.status === "reviewed") s += 10;
  else if (p.status === "manual_review") s += 5;
  // V1: no API verification → cap at 85 even if everything filled.
  return clamp(Math.min(s, 85));
}

/** Local visibility — categories, services, service area, review density, posts. */
export function calculateGbpLocalVisibilityScore(p: GbpProfile | null): number {
  if (!p) return 0;
  let s = 0;
  if (p.primaryCategory) s += 20;
  if (p.secondaryCategories.length > 0) s += 10;
  if (p.services.length >= 3) s += 18;
  else if (p.services.length >= 1) s += 10;
  if (p.serviceArea.length > 0) s += 15;
  if ((p.reviewCount ?? 0) >= 20) s += 15;
  else if ((p.reviewCount ?? 0) >= 5) s += 8;
  if (p.postsStatus === "active") s += 12;
  else if (p.postsStatus === "occasional") s += 6;
  if (p.photosStatus === "strong" || p.photosStatus === "ok") s += 10;
  return clamp(s);
}

function deriveGaps(p: GbpProfile | null): GbpGap[] {
  if (!p) {
    return [
      { code: "no_profile", label: "GBP profile not reviewed", severity: "high" },
      { code: "reviews_unknown", label: "Reviews not verified", severity: "high" },
      {
        code: "categories_unknown",
        label: "Primary category and services not confirmed",
        severity: "medium",
      },
    ];
  }
  const g: GbpGap[] = [];
  if (p.status === "not_connected" || p.status === "unavailable") {
    g.push({ code: "access", label: "Access not confirmed", severity: "high" });
  }
  if (!p.primaryCategory)
    g.push({ code: "primary_category", label: "Primary category missing", severity: "high" });
  if (p.services.length === 0)
    g.push({ code: "services", label: "Service list missing", severity: "high" });
  if (p.serviceArea.length === 0)
    g.push({ code: "service_area", label: "Service area not defined", severity: "medium" });
  if (p.reviewCount == null)
    g.push({ code: "reviews_unknown", label: "Review count not verified", severity: "high" });
  else if (p.reviewCount < 20)
    g.push({
      code: "reviews_low",
      label: "Low review volume",
      detail: `Only ${p.reviewCount} review${p.reviewCount === 1 ? "" : "s"} captured.`,
      severity: "medium",
    });
  if (p.rating != null && p.rating < 4.3)
    g.push({
      code: "rating_low",
      label: "Average rating below 4.3",
      detail: `Current rating ${p.rating.toFixed(1)} risks suppressing local pack visibility.`,
      severity: "medium",
    });
  if (p.postsStatus === "inactive" || p.postsStatus === "unknown")
    g.push({ code: "posts", label: "GBP posts inactive", severity: "medium" });
  if (p.photosStatus === "weak" || p.photosStatus === "missing" || p.photosStatus === "unknown")
    g.push({ code: "photos", label: "Photos weak or missing", severity: "medium" });
  if (p.napConsistency === "inconsistent" || p.napConsistency === "unknown")
    g.push({
      code: "nap",
      label: "NAP consistency not confirmed",
      severity: "medium",
    });
  if (!p.profileUrl)
    g.push({ code: "profile_url", label: "GBP profile URL not captured", severity: "low" });
  return g;
}

function deriveRecommendations(p: GbpProfile | null): GbpRecommendation[] {
  if (!p) {
    return [
      {
        code: "review_profile",
        title: "Review the GBP profile",
        detail:
          "Open Google Business Profile, confirm category + services + service area, and record the data here.",
      },
    ];
  }
  const r: GbpRecommendation[] = [];
  if (p.services.length === 0)
    r.push({
      code: "add_services",
      title: "Add a full service list",
      detail: "Mirror priority services so Google can match them to local intent queries.",
    });
  if ((p.reviewCount ?? 0) < 20)
    r.push({
      code: "review_velocity",
      title: "Launch a review-request loop",
      detail: "Aim for steady monthly review velocity from completed jobs.",
    });
  if (p.postsStatus !== "active")
    r.push({
      code: "posts_cadence",
      title: "Post weekly updates",
      detail: "GBP posts increase profile activity signals and click-through.",
    });
  if (p.photosStatus !== "strong" && p.photosStatus !== "ok")
    r.push({
      code: "photos",
      title: "Refresh photos",
      detail: "Add team, job-site, and exterior photos to boost trust.",
    });
  if (p.napConsistency !== "consistent")
    r.push({
      code: "nap_check",
      title: "Audit NAP across directories",
      detail: "Inconsistent name / address / phone across the web suppresses local rankings.",
    });
  return r;
}

/** Conservative summary used by the Blueprint. */
export function summarizeGbpProfile(p: GbpProfile | null): GbpSummary {
  const completeness = calculateGbpCompletenessScore(p);
  const trust = calculateGbpTrustScore(p);
  const local = calculateGbpLocalVisibilityScore(p);
  const gaps = deriveGaps(p);
  const recommendations = deriveRecommendations(p);
  const warnings: string[] = [];
  if (!p) warnings.push("No GBP profile captured yet — local trust layer is unverified.");
  else {
    if (p.source !== "google_api")
      warnings.push("GBP data is operator-entered, not API-verified.");
    if (p.status === "not_connected" || p.status === "unavailable")
      warnings.push("GBP access is not confirmed.");
  }
  const status = p?.status ?? "not_connected";
  return {
    available: !!p,
    status,
    source: p?.source ?? "manual",
    profile: p,
    completenessScore: completeness,
    trustScore: trust,
    localVisibilityScore: local,
    gaps,
    recommendations,
    warnings,
    statusLabel: gbpStatusLabel(status),
  };
}
