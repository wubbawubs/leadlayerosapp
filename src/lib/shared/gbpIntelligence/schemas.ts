/**
 * GBP Intelligence V1 — shared schemas and types.
 *
 * Pure types + Zod input validation for the Google Business Profile
 * intelligence layer. No DB / network calls live here.
 */
import { z } from "zod";

export const GBP_STATUSES = [
  "not_connected",
  "connected",
  "manual_review",
  "reviewed",
  "unavailable",
] as const;
export type GbpStatus = (typeof GBP_STATUSES)[number];

export const GBP_SOURCES = ["manual", "google_api", "import", "operator_review"] as const;
export type GbpSource = (typeof GBP_SOURCES)[number];

export const GBP_PHOTOS_STATUSES = ["unknown", "missing", "weak", "ok", "strong"] as const;
export type GbpPhotosStatus = (typeof GBP_PHOTOS_STATUSES)[number];

export const GBP_POSTS_STATUSES = ["unknown", "inactive", "occasional", "active"] as const;
export type GbpPostsStatus = (typeof GBP_POSTS_STATUSES)[number];

export const GBP_NAP_STATUSES = ["unknown", "inconsistent", "partial", "consistent"] as const;
export type GbpNapStatus = (typeof GBP_NAP_STATUSES)[number];

export interface GbpGap {
  code: string;
  label: string;
  detail?: string;
  severity?: "low" | "medium" | "high";
}

export interface GbpRecommendation {
  code: string;
  title: string;
  detail?: string;
}

export interface GbpProfile {
  id: string;
  tenantId: string;
  siteId: string | null;
  growthGoalId: string | null;
  status: GbpStatus;
  source: GbpSource;
  businessName: string | null;
  profileUrl: string | null;
  primaryCategory: string | null;
  secondaryCategories: string[];
  rating: number | null;
  reviewCount: number | null;
  reviewVelocity: Record<string, number>;
  services: string[];
  serviceArea: string[];
  address: string | null;
  phone: string | null;
  websiteUrl: string | null;
  photosStatus: GbpPhotosStatus;
  postsStatus: GbpPostsStatus;
  napConsistency: GbpNapStatus;
  completenessScore: number | null;
  trustScore: number | null;
  localVisibilityScore: number | null;
  gaps: GbpGap[];
  recommendations: GbpRecommendation[];
  notes: string | null;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GbpSummary {
  available: boolean;
  status: GbpStatus;
  source: GbpSource;
  profile: GbpProfile | null;
  /** Composite score 0–100, conservative when data is unknown. */
  completenessScore: number;
  trustScore: number;
  localVisibilityScore: number;
  gaps: GbpGap[];
  recommendations: GbpRecommendation[];
  warnings: string[];
  /** UI-friendly: "reviewed", "manual review", "not connected", etc. */
  statusLabel: string;
}

export const CreateOrUpdateGbpProfileInputSchema = z.object({
  tenantId: z.string().uuid(),
  growthGoalId: z.string().uuid().nullable().optional(),
  status: z.enum(GBP_STATUSES).default("manual_review"),
  source: z.enum(GBP_SOURCES).default("manual"),
  businessName: z.string().trim().max(255).nullable().optional(),
  profileUrl: z.string().trim().max(1024).nullable().optional(),
  primaryCategory: z.string().trim().max(255).nullable().optional(),
  secondaryCategories: z.array(z.string().trim().min(1).max(255)).max(20).optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  reviewCount: z.number().int().min(0).max(1_000_000).nullable().optional(),
  services: z.array(z.string().trim().min(1).max(255)).max(50).optional(),
  serviceArea: z.array(z.string().trim().min(1).max(255)).max(50).optional(),
  address: z.string().trim().max(512).nullable().optional(),
  phone: z.string().trim().max(64).nullable().optional(),
  websiteUrl: z.string().trim().max(1024).nullable().optional(),
  photosStatus: z.enum(GBP_PHOTOS_STATUSES).optional(),
  postsStatus: z.enum(GBP_POSTS_STATUSES).optional(),
  napConsistency: z.enum(GBP_NAP_STATUSES).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});
export type CreateOrUpdateGbpProfileInput = z.infer<
  typeof CreateOrUpdateGbpProfileInputSchema
>;

export function gbpStatusLabel(status: GbpStatus): string {
  switch (status) {
    case "reviewed":
      return "Reviewed";
    case "manual_review":
      return "Manual review";
    case "connected":
      return "Connected";
    case "unavailable":
      return "Unavailable";
    default:
      return "Not connected";
  }
}

/** Map a DB row → GbpProfile. Forgiving about extra keys / nulls. */
export function rowToGbpProfile(row: Record<string, unknown>): GbpProfile {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const numObj = (v: unknown): Record<string, number> => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, number> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "number" && Number.isFinite(val)) out[k] = val;
    }
    return out;
  };
  return {
    id: String(row.id ?? ""),
    tenantId: String(row.tenant_id ?? ""),
    siteId: (row.site_id as string | null) ?? null,
    growthGoalId: (row.growth_goal_id as string | null) ?? null,
    status: (row.status as GbpStatus) ?? "not_connected",
    source: (row.source as GbpSource) ?? "manual",
    businessName: (row.business_name as string | null) ?? null,
    profileUrl: (row.profile_url as string | null) ?? null,
    primaryCategory: (row.primary_category as string | null) ?? null,
    secondaryCategories: arr(row.secondary_categories),
    rating: row.rating == null ? null : Number(row.rating),
    reviewCount: row.review_count == null ? null : Number(row.review_count),
    reviewVelocity: numObj(row.review_velocity),
    services: arr(row.services),
    serviceArea: arr(row.service_area),
    address: (row.address as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    websiteUrl: (row.website_url as string | null) ?? null,
    photosStatus: (row.photos_status as GbpPhotosStatus) ?? "unknown",
    postsStatus: (row.posts_status as GbpPostsStatus) ?? "unknown",
    napConsistency: (row.nap_consistency as GbpNapStatus) ?? "unknown",
    completenessScore:
      row.completeness_score == null ? null : Number(row.completeness_score),
    trustScore: row.trust_score == null ? null : Number(row.trust_score),
    localVisibilityScore:
      row.local_visibility_score == null ? null : Number(row.local_visibility_score),
    gaps: Array.isArray(row.gaps) ? (row.gaps as GbpGap[]) : [],
    recommendations: Array.isArray(row.recommendations)
      ? (row.recommendations as GbpRecommendation[])
      : [],
    notes: (row.notes as string | null) ?? null,
    lastReviewedAt: (row.last_reviewed_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}
