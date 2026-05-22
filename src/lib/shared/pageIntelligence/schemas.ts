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

/** Lenient string array for LLM output. */
const StrArr = z.array(z.string().trim().min(1).max(400)).max(20);

export const RiskFlagSchema = z.object({
  flag: z.string().trim().min(1).max(200),
  level: z.enum(RISK_LEVELS).default("low"),
  why: z.string().trim().max(400).optional().default(""),
});

export const MissingPageContextSchema = z.object({
  missing: z.string().trim().min(1).max(300),
  impact: z.string().trim().max(300).optional().default(""),
});

export const SourceEvidenceSchema = z.object({
  field: z.string().trim().max(80),
  quote: z.string().trim().max(400),
});

export const LocalRelevanceSchema = z
  .object({
    isLocal: z.boolean().optional().default(false),
    location: z.string().trim().max(200).optional().default(""),
    reason: z.string().trim().max(400).optional().default(""),
  })
  .partial();

/** Strict schema for LLM response. */
export const PageIntelligenceLLMSchema = z.object({
  pageType: z.enum(PAGE_TYPES).default("other"),
  intent: z.enum(PAGE_INTENTS).default("informational"),
  funnelStage: z.enum(FUNNEL_STAGES).optional().default("awareness"),
  commercialPriority: z.enum(COMMERCIAL_PRIORITIES).default("medium"),
  seoRole: z.enum(SEO_ROLES).optional().nullable().default(null),
  primaryTopic: z.string().trim().max(200).optional().default(""),
  contentSummary: z.string().trim().max(800).optional().default(""),
  targetAudience: z.string().trim().max(300).optional().default(""),
  desiredAction: z.string().trim().max(200).optional().default(""),
  recommendedCTA: z.string().trim().max(200).optional().default(""),
  relevantStrategyAngle: z.string().trim().max(300).optional().default(""),
  localRelevance: LocalRelevanceSchema.optional().default({}),
  riskFlags: z.array(RiskFlagSchema).max(10).optional().default([]),
  missingPageContext: z.array(MissingPageContextSchema).max(10).optional().default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  sourceEvidence: z.array(SourceEvidenceSchema).max(10).optional().default([]),
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
