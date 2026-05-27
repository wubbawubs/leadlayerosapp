/**
 * Competitive Intelligence — Shared Schemas (Ticket 4).
 *
 * Pure Zod + types for competitor scans, competitors, SERP results and
 * the matrix summary that feeds the Blueprint.
 */

import { z } from "zod";

export const COMPETITIVE_INTELLIGENCE_SCHEMA_VERSION = "1.0.0";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const competitorScanStatusSchema = z.enum([
  "draft",
  "running",
  "completed",
  "failed",
  "partial",
]);
export type CompetitorScanStatus = z.infer<typeof competitorScanStatusSchema>;

export const trustSignalsSchema = z
  .object({
    phone: z.boolean().default(false),
    address: z.boolean().default(false),
    emergency: z.boolean().default(false),
    licensing: z.boolean().default(false),
    certifications: z.array(z.string()).default([]),
    rawMatches: z.array(z.string()).default([]),
  })
  .default({
    phone: false,
    address: false,
    emergency: false,
    licensing: false,
    certifications: [],
    rawMatches: [],
  });
export type TrustSignals = z.infer<typeof trustSignalsSchema>;

export const competitorScanSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  growthGoalId: z.string().uuid().nullable().optional(),
  marketScanId: z.string().uuid().nullable().optional(),
  status: competitorScanStatusSchema,
  source: z.string().nullable().optional(),
  clustersScanned: z.number().int().nullable().optional(),
  serpResultsCollected: z.number().int().nullable().optional(),
  scanStartedAt: z.string().nullable().optional(),
  scanCompletedAt: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  summary: z.record(z.string(), jsonValueSchema).default({}),
  confidence: z.number().nullable().optional(),
  partial: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CompetitorScan = z.infer<typeof competitorScanSchema>;

export const competitorSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  competitorScanId: z.string().uuid(),
  domain: z.string(),
  displayName: z.string().nullable().optional(),
  isSelf: z.boolean().default(false),
  serpAppearanceCount: z.number().int().default(0),
  clustersAppearedIn: z.array(z.string()).default([]),
  gbpName: z.string().nullable().optional(),
  gbpRating: z.number().nullable().optional(),
  gbpReviewCount: z.number().int().nullable().optional(),
  gbpCategory: z.string().nullable().optional(),
  servicePagesCount: z.number().int().nullable().optional(),
  locationPagesCount: z.number().int().nullable().optional(),
  servicePagesSample: z.array(z.string()).default([]),
  locationPagesSample: z.array(z.string()).default([]),
  trustSignals: trustSignalsSchema,
  competitorScore: z.number().nullable().optional(),
  scoreBreakdown: z.record(z.string(), jsonValueSchema).default({}),
  scoreConfidence: z.number().nullable().optional(),
  dataCompleteness: z.number().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Competitor = z.infer<typeof competitorSchema>;

export const competitorSerpResultSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  competitorScanId: z.string().uuid(),
  competitorId: z.string().uuid().nullable().optional(),
  clusterKey: z.string().nullable().optional(),
  keyword: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  rank: z.number().int().nullable().optional(),
  url: z.string().nullable().optional(),
  domain: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  snippet: z.string().nullable().optional(),
  isLocalPack: z.boolean().default(false),
  localPackName: z.string().nullable().optional(),
  localPackRating: z.number().nullable().optional(),
  localPackReviewCount: z.number().int().nullable().optional(),
  raw: z.record(z.string(), jsonValueSchema).default({}),
  createdAt: z.string(),
});
export type CompetitorSerpResult = z.infer<typeof competitorSerpResultSchema>;

export const identityModeSchema = z.enum([
  "domain_match",
  "brand_match",
  "connected_site",
  "profile_baseline",
  "unknown_baseline",
]);
export type IdentityModeSchema = z.infer<typeof identityModeSchema>;

export const rankingPresenceSchema = z.enum(["found", "brand_only", "not_found"]);
export type RankingPresenceSchema = z.infer<typeof rankingPresenceSchema>;

// Matrix row used by the Blueprint UI.
export const competitorMatrixRowSchema = z.object({
  domain: z.string(),
  displayName: z.string().nullable(),
  isSelf: z.boolean(),
  serpAppearanceCount: z.number(),
  clustersAppearedIn: z.array(z.string()),
  gbpRating: z.number().nullable(),
  gbpReviewCount: z.number().nullable(),
  gbpCategory: z.string().nullable(),
  servicePagesCount: z.number().nullable(),
  locationPagesCount: z.number().nullable(),
  trustSignals: trustSignalsSchema,
  competitorScore: z.number().nullable(),
  scoreConfidence: z.number().nullable(),
  dataCompleteness: z.number().nullable(),
  reviewsUnknown: z.boolean().default(false),
  // Self-row identity fields (null/defaults for competitor rows).
  identityMode: identityModeSchema.nullable().default(null),
  identityConfidence: z.number().nullable().default(null),
  identityWarnings: z.array(z.string()).default([]),
  rankingPresence: rankingPresenceSchema.nullable().default(null),
  temporaryDomain: z.boolean().default(false),
});
export type CompetitorMatrixRow = z.infer<typeof competitorMatrixRowSchema>;

export const competitorGapSchema = z.object({
  label: z.string(),
  detail: z.string(),
  selfValue: z.union([z.number(), z.string(), z.null()]),
  competitorMedian: z.union([z.number(), z.string(), z.null()]),
});
export type CompetitorGap = z.infer<typeof competitorGapSchema>;

export const competitorMatrixSummarySchema = z.object({
  available: z.boolean(),
  scanId: z.string().uuid().nullable(),
  scanCompletedAt: z.string().nullable(),
  status: competitorScanStatusSchema.nullable(),
  partial: z.boolean().default(false),
  clustersScanned: z.number().default(0),
  serpResultsCollected: z.number().default(0),
  competitorCount: z.number().default(0),
  self: competitorMatrixRowSchema.nullable(),
  rows: z.array(competitorMatrixRowSchema).default([]),
  medianCompetitorScore: z.number().nullable(),
  selfScore: z.number().nullable(),
  gaps: z.array(competitorGapSchema).default([]),
  warnings: z.array(z.string()).default([]),
  source: z.string().default("dataforseo+firecrawl"),
});
export type CompetitorMatrixSummary = z.infer<typeof competitorMatrixSummarySchema>;

export const runCompetitorScanInputSchema = z.object({
  tenantId: z.string().uuid(),
  growthGoalId: z.string().uuid().nullable().optional(),
  marketScanId: z.string().uuid().nullable().optional(),
  maxClusters: z.number().int().min(1).max(20).default(5),
  maxCompetitors: z.number().int().min(1).max(20).default(5),
  forceRefresh: z.boolean().optional(),
});
export type RunCompetitorScanInput = z.infer<typeof runCompetitorScanInputSchema>;
