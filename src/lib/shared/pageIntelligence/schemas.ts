/**
 * Page Intelligence V1 — Zod schemas + allowed-value constants.
 * Server-only at runtime (used by analyzer), but safe to import in UI for types.
 */
import { z } from "zod";

export const PAGE_TYPES = [
  "homepage",
  "service",
  "location",
  "blog",
  "contact",
  "about",
  "faq",
  "pricing",
  "case_study",
  "legal",
  "landing",
  "category",
  "other",
] as const;

export const PAGE_INTENTS = [
  "informational",
  "commercial",
  "local",
  "trust",
  "conversion",
  "support",
  "navigational",
] as const;

export const FUNNEL_STAGES = ["awareness", "consideration", "decision", "retention"] as const;

export const COMMERCIAL_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export const SEO_ROLES = [
  "rank_target",
  "supporting_content",
  "conversion_page",
  "trust_page",
  "navigation_page",
] as const;

export const RISK_LEVELS = ["low", "medium", "high"] as const;

export type PageType = (typeof PAGE_TYPES)[number];
export type PageIntent = (typeof PAGE_INTENTS)[number];
export type FunnelStage = (typeof FUNNEL_STAGES)[number];
export type CommercialPriority = (typeof COMMERCIAL_PRIORITIES)[number];
export type SeoRole = (typeof SEO_ROLES)[number];

/** Null/undefined-tolerant string: LLMs love to return null where a string was expected. */
const nstr = (max: number) =>
  z.preprocess(
    (v) => (v == null ? "" : typeof v === "string" ? v : String(v)),
    z.string().trim().max(max),
  );

/** Null/undefined-tolerant array. */
const narr = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z.preprocess((v) => (v == null ? [] : v), z.array(item).max(max));

export const RiskFlagSchema = z.object({
  flag: nstr(200),
  level: z.preprocess((v) => (v == null ? "low" : v), z.enum(RISK_LEVELS)).default("low"),
  why: nstr(400).optional().default(""),
});

export const MissingPageContextSchema = z.object({
  missing: nstr(300),
  impact: nstr(300).optional().default(""),
});

export const SourceEvidenceSchema = z.object({
  field: nstr(80),
  quote: nstr(400),
});

export const LocalRelevanceSchema = z
  .object({
    isLocal: z.preprocess((v) => (v == null ? false : v), z.boolean()).default(false),
    location: nstr(200).optional().default(""),
    reason: nstr(400).optional().default(""),
  })
  .partial();

/** Strict-but-tolerant schema for LLM response. Optional strings accept null. */
export const PageIntelligenceLLMSchema = z.object({
  pageType: z.preprocess((v) => (v == null ? "other" : v), z.enum(PAGE_TYPES)).default("other"),
  intent: z
    .preprocess((v) => (v == null ? "informational" : v), z.enum(PAGE_INTENTS))
    .default("informational"),
  funnelStage: z
    .preprocess((v) => (v == null ? "awareness" : v), z.enum(FUNNEL_STAGES))
    .optional()
    .default("awareness"),
  commercialPriority: z
    .preprocess((v) => (v == null ? "medium" : v), z.enum(COMMERCIAL_PRIORITIES))
    .default("medium"),
  seoRole: z.enum(SEO_ROLES).nullable().optional().default(null),
  primaryTopic: nstr(200).optional().default(""),
  contentSummary: nstr(800).optional().default(""),
  targetAudience: nstr(300).optional().default(""),
  desiredAction: nstr(200).optional().default(""),
  recommendedCTA: nstr(200).optional().default(""),
  relevantStrategyAngle: nstr(300).optional().default(""),
  localRelevance: LocalRelevanceSchema.optional().default({}),
  riskFlags: narr(RiskFlagSchema, 10).optional().default([]),
  missingPageContext: narr(MissingPageContextSchema, 10).optional().default([]),
  confidence: z.preprocess((v) => (v == null ? 0.5 : v), z.number().min(0).max(1)).default(0.5),
  sourceEvidence: narr(SourceEvidenceSchema, 10).optional().default([]),
});

export type PageIntelligenceLLM = z.infer<typeof PageIntelligenceLLMSchema>;

export interface PageIntelligenceRow {
  id: string;
  tenant_id: string;
  audit_id: string | null;
  page_id: string | null;
  audit_page_id: string | null;
  page_url: string | null;
  page_type: PageType;
  intent: PageIntent;
  funnel_stage: FunnelStage | null;
  commercial_priority: CommercialPriority;
  seo_role: SeoRole | null;
  primary_topic: string | null;
  content_summary: string | null;
  target_audience: string | null;
  desired_action: string | null;
  recommended_cta: string | null;
  relevant_strategy_angle: string | null;
  local_relevance: Record<string, unknown>;
  risk_flags: Array<{ flag: string; level: string; why?: string }>;
  missing_page_context: Array<{ missing: string; impact?: string }>;
  confidence: number;
  source_evidence: Array<{ field: string; quote: string }>;
  model_used: string | null;
  analyzed_at: string;
}
