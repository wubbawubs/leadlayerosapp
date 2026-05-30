import { z } from "zod";

// ------------------------------------------------------------------
// Enums
// ------------------------------------------------------------------

export const ELIGIBILITY_STATUSES = ["safe", "meta_only", "manual_mode", "blocked"] as const;
export type EligibilityStatus = (typeof ELIGIBILITY_STATUSES)[number];

export const DETECTED_BUILDERS = [
  "elementor",
  "divi",
  "wpbakery",
  "beaver",
  "unknown_builder",
  "gutenberg",
  "classic",
  "none",
] as const;
export type DetectedBuilder = (typeof DETECTED_BUILDERS)[number];

export const UPDATE_MODES = ["full_content", "meta_only", "manual"] as const;
export type UpdateMode = (typeof UPDATE_MODES)[number];

export const PAGE_UPDATE_STATUSES = ["pending", "applied", "failed"] as const;
export type PageUpdateStatus = (typeof PAGE_UPDATE_STATUSES)[number];

// ------------------------------------------------------------------
// PageOptimizationSnapshot domain object
// ------------------------------------------------------------------

export const PageOptimizationSnapshotSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  wordpressConnectionId: z.string().uuid(),
  wpPostId: z.number().int(),
  wpPostType: z.string(),
  wpStatus: z.string().nullable(),
  title: z.string().nullable(),
  slug: z.string().nullable(),
  link: z.string().nullable(),
  excerpt: z.string().nullable(),
  rawContent: z.string().nullable(),
  renderedContent: z.string().nullable(),
  detectedBuilder: z.string().nullable(),
  eligibilityStatus: z.enum(ELIGIBILITY_STATUSES),
  contentHash: z.string(),
  fetchedAt: z.string(),
  createdAt: z.string(),
});
export type PageOptimizationSnapshot = z.infer<typeof PageOptimizationSnapshotSchema>;

// ------------------------------------------------------------------
// PageOptimizationBriefPayload — stored in execution_artifacts.payload
// ------------------------------------------------------------------

export const PageOptimizationBriefPayloadSchema = z.object({
  // Target
  targetWpPostId: z.number().int(),
  targetUrl: z.string().nullable(),
  pageType: z.enum(["page", "post"]).default("page"),
  updateMode: z.enum(UPDATE_MODES),

  // Before state reference
  beforeSnapshotId: z.string().uuid(),
  currentTitle: z.string().nullable(),
  currentMetaTitle: z.string().nullable(),
  currentMetaDesc: z.string().nullable(),
  currentContentHash: z.string(),

  // Recommended changes — null = do not change
  recommendedTitle: z.string().nullable(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  improvedIntro: z.string().nullable(),
  ctaBlock: z
    .object({
      primary: z.string(),
      secondary: z.string().optional(),
      placement: z.string().optional(),
    })
    .nullable(),
  proofBlock: z.object({ items: z.array(z.string()) }).nullable(),
  faqBlock: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .nullable(),
  schemaRecommendation: z
    .object({ type: z.string(), suggestedFields: z.record(z.string()) })
    .nullable(),
  internalLinks: z.array(
    z.object({
      anchorText: z.string(),
      targetSlug: z.string(),
      rationale: z.string(),
    }),
  ),

  // Operator guidance
  operatorChecklist: z.array(z.string()),
  riskFlags: z.array(z.string()),
  missingContext: z.array(z.string()),
  assumptions: z.array(z.string()),
  successMetric: z.string(),
});
export type PageOptimizationBriefPayload = z.infer<typeof PageOptimizationBriefPayloadSchema>;

// ------------------------------------------------------------------
// PageOptimizationUpdate domain object
// ------------------------------------------------------------------

export const PageOptimizationUpdateSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  executionArtifactId: z.string().uuid().nullable(),
  snapshotId: z.string().uuid().nullable(),
  wordpressConnectionId: z.string().uuid(),
  wpPostId: z.number().int(),
  status: z.enum(PAGE_UPDATE_STATUSES),
  appliedAt: z.string().nullable(),
  appliedBy: z.string().uuid().nullable(),
  updateSource: z.string(),
  fieldsUpdated: z.array(z.string()),
  errorMessage: z.string().nullable(),
  rawResponse: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PageOptimizationUpdate = z.infer<typeof PageOptimizationUpdateSchema>;

// ------------------------------------------------------------------
// Server function inputs
// ------------------------------------------------------------------

export const FetchExistingPageInputSchema = z.object({
  tenantId: z.string().uuid(),
  wordpressConnectionId: z.string().uuid(),
  wpPostId: z.number().int().positive(),
});
export type FetchExistingPageInput = z.infer<typeof FetchExistingPageInputSchema>;

export const GeneratePageOptimizationBriefInputSchema = z.object({
  tenantId: z.string().uuid(),
  snapshotId: z.string().uuid(),
  masterplanItemId: z.string().uuid().optional(),
  targetService: z.string().optional(),
  targetLocation: z.string().optional(),
  updateModeOverride: z.enum(UPDATE_MODES).optional(),
});
export type GeneratePageOptimizationBriefInput = z.infer<
  typeof GeneratePageOptimizationBriefInputSchema
>;

export const ApplyPageOptimizationInputSchema = z.object({
  tenantId: z.string().uuid(),
  artifactId: z.string().uuid(),
  confirmLivePage: z.boolean().optional(),
});
export type ApplyPageOptimizationInput = z.infer<typeof ApplyPageOptimizationInputSchema>;
