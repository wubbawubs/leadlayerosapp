/**
 * Market Intelligence — Shared Schemas (Ticket 2).
 *
 * Contracts for market scans, keywords, demand clusters and summary.
 * Pure Zod + types. No DB, no API.
 *
 * See: docs/MARKET_INTELLIGENCE_DATA_MODEL.md
 */

import { z } from "zod";

// JSON-safe recursive value (serializable across server-fn boundary).
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

export const MARKET_INTELLIGENCE_SCHEMA_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const marketScanStatusSchema = z.enum([
  "draft",
  "pending",
  "running",
  "completed",
  "failed",
  "stale",
]);
export type MarketScanStatus = z.infer<typeof marketScanStatusSchema>;

export const marketScanSourceSchema = z.enum([
  "manual",
  "dataforseo",
  "import",
  "synthetic_fixture",
]);
export type MarketScanSource = z.infer<typeof marketScanSourceSchema>;

export const keywordIntentSchema = z.enum([
  "emergency",
  "service",
  "commercial",
  "informational",
  "comparison",
  "branded",
  "unknown",
]);
export type KeywordIntent = z.infer<typeof keywordIntentSchema>;

export const clusterPrioritySchema = z.enum(["low", "medium", "high", "critical"]);
export type ClusterPriority = z.infer<typeof clusterPrioritySchema>;

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export const marketScanSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  siteId: z.string().uuid().nullable().optional(),
  growthGoalId: z.string().uuid().nullable().optional(),
  status: marketScanStatusSchema,
  language: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  vertical: z.string().nullable().optional(),
  services: z.array(z.string()),
  locations: z.array(z.string()),
  source: marketScanSourceSchema,
  scanStartedAt: z.string().nullable().optional(),
  scanCompletedAt: z.string().nullable().optional(),
  summary: z.record(z.string(), jsonValueSchema).default({}),
  confidence: z.number().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MarketScan = z.infer<typeof marketScanSchema>;

export const marketKeywordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  marketScanId: z.string().uuid(),
  service: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  keyword: z.string(),
  normalizedKeyword: z.string().nullable().optional(),
  intent: keywordIntentSchema.nullable().optional(),
  volume: z.number().int().nullable().optional(),
  difficulty: z.number().nullable().optional(),
  competition: z.number().nullable().optional(),
  cpc: z.number().nullable().optional(),
  source: marketScanSourceSchema,
  confidence: z.number().nullable().optional(),
  raw: z.record(z.string(), jsonValueSchema).default({}),
  createdAt: z.string(),
});
export type MarketKeyword = z.infer<typeof marketKeywordSchema>;

export const marketDemandClusterSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  marketScanId: z.string().uuid(),
  clusterName: z.string(),
  service: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  intent: keywordIntentSchema.nullable().optional(),
  totalVolume: z.number().int().nullable().optional(),
  keywordCount: z.number().int().nullable().optional(),
  averageDifficulty: z.number().nullable().optional(),
  averageCompetition: z.number().nullable().optional(),
  opportunityScore: z.number().nullable().optional(),
  priority: clusterPrioritySchema.nullable().optional(),
  reasoning: z.array(z.string()).default([]),
  representativeKeywords: z.array(z.string()).default([]),
  createdAt: z.string(),
});
export type MarketDemandCluster = z.infer<typeof marketDemandClusterSchema>;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const createMarketKeywordInputSchema = z.object({
  keyword: z.string().min(1).max(255),
  service: z.string().max(120).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  intent: keywordIntentSchema.optional(),
  volume: z.number().int().min(0).max(10_000_000).nullable().optional(),
  difficulty: z.number().min(0).max(100).nullable().optional(),
  competition: z.number().min(0).max(1).nullable().optional(),
  cpc: z.number().min(0).max(1000).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  raw: z.record(z.string(), jsonValueSchema).optional(),
});
export type CreateMarketKeywordInput = z.infer<typeof createMarketKeywordInputSchema>;

export const createMarketScanInputSchema = z.object({
  tenantId: z.string().uuid(),
  growthGoalId: z.string().uuid().nullable().optional(),
  siteId: z.string().uuid().nullable().optional(),
  language: z.string().max(8).optional(),
  country: z.string().max(64).nullable().optional(),
  region: z.string().max(64).nullable().optional(),
  vertical: z.string().max(64).nullable().optional(),
  services: z.array(z.string().min(1).max(120)).max(50).default([]),
  locations: z.array(z.string().min(1).max(120)).max(50).default([]),
  source: marketScanSourceSchema.default("manual"),
  status: marketScanStatusSchema.default("draft"),
  keywords: z.array(createMarketKeywordInputSchema).max(2000).default([]),
});
export type CreateMarketScanInput = z.infer<typeof createMarketScanInputSchema>;

// ---------------------------------------------------------------------------
// Summary contract — feeds the Blueprint
// ---------------------------------------------------------------------------

export const topEntityVolumeSchema = z.object({
  name: z.string(),
  totalVolume: z.number().nullable(),
  keywordCount: z.number(),
  opportunityScore: z.number().nullable(),
});
export type TopEntityVolume = z.infer<typeof topEntityVolumeSchema>;

export const clusterLocalityTypeSchema = z.enum(["local", "generic_reference", "mixed"]);
export type ClusterLocalityType = z.infer<typeof clusterLocalityTypeSchema>;

export const summaryClusterSchema = z.object({
  clusterName: z.string(),
  service: z.string().nullable(),
  location: z.string().nullable(),
  intent: keywordIntentSchema.nullable(),
  totalVolume: z.number().nullable(),
  opportunityScore: z.number().nullable(),
  priority: clusterPrioritySchema.nullable(),
  representativeKeywords: z.array(z.string()),
  localityType: clusterLocalityTypeSchema.default("local"),
});
export type SummaryCluster = z.infer<typeof summaryClusterSchema>;

export const localityBreakdownSchema = z.object({
  localDemandVolume: z.number(),
  genericReferenceDemandVolume: z.number(),
  totalScannedDemandVolume: z.number(),
  localKeywordCount: z.number(),
  genericReferenceKeywordCount: z.number(),
  keywordsWithVolumeCount: z.number(),
  totalKeywordCount: z.number(),
  volumeCoveragePercent: z.number(),
});
export type LocalityBreakdown = z.infer<typeof localityBreakdownSchema>;

export const marketDemandSummarySchema = z.object({
  available: z.boolean(),
  source: marketScanSourceSchema.nullable(),
  scanId: z.string().uuid().nullable(),
  scanCompletedAt: z.string().nullable(),
  language: z.string().nullable(),
  totalKeywords: z.number(),
  keywordsWithVolume: z.number(),
  totalAddressableVolume: z.number().nullable(),
  averageDifficulty: z.number().nullable(),
  clusterCount: z.number(),
  topClusters: z.array(summaryClusterSchema),
  genericReferenceClusters: z.array(summaryClusterSchema).default([]),
  localityBreakdown: localityBreakdownSchema.optional(),
  topServices: z.array(topEntityVolumeSchema),
  topLocations: z.array(topEntityVolumeSchema),
  intentDistribution: z.record(keywordIntentSchema, z.number()),
  confidence: z.number(),
  warnings: z.array(z.string()),
});
export type MarketDemandSummary = z.infer<typeof marketDemandSummarySchema>;
