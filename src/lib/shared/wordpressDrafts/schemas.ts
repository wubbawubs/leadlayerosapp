import { z } from "zod";

// ------------------------------------------------------------------
// Enums
// ------------------------------------------------------------------

export const PUBLISHING_BUNDLE_STATUSES = [
  "draft_ready",
  "draft_created",
  "needs_review",
  "approved_for_publish",
  "rejected",
  "failed",
] as const;
export type PublishingBundleStatus = (typeof PUBLISHING_BUNDLE_STATUSES)[number];

export const WORDPRESS_DRAFT_STATUSES = [
  "created",
  "failed",
  "needs_review",
  "approved_for_publish",
  "published",
] as const;
export type WordpressDraftStatus = (typeof WORDPRESS_DRAFT_STATUSES)[number];

// ------------------------------------------------------------------
// Gutenberg block shapes
// ------------------------------------------------------------------

export const GutenbergBlockSchema = z.object({
  blockName: z.string(),
  attrs: z.record(z.string(), z.unknown()).optional(),
  innerContent: z.string(),
});
export type GutenbergBlock = z.infer<typeof GutenbergBlockSchema>;

// ------------------------------------------------------------------
// Safety checks stored on publishing_bundle.safety_checks
// ------------------------------------------------------------------

export const DraftSafetyChecksSchema = z.object({
  artifactApproved: z.boolean(),
  businessProfileReviewed: z.boolean(),
  toneProfileReviewed: z.boolean(),
  wordpressConnected: z.boolean(),
  canCreateDraft: z.boolean(),
  noLivePublish: z.boolean(),
  claimRiskFlagCount: z.number().int(),
  missingContextCount: z.number().int(),
  checkedAt: z.string(),
});
export type DraftSafetyChecks = z.infer<typeof DraftSafetyChecksSchema>;

// ------------------------------------------------------------------
// Payload stored on publishing_bundle.payload
// ------------------------------------------------------------------

export const WordpressDraftPayloadSchema = z.object({
  title: z.string(),
  slug: z.string(),
  content: z.string(),
  excerpt: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  pageType: z.string(),
  targetService: z.string().nullable(),
  targetLocation: z.string().nullable(),
});
export type WordpressDraftPayload = z.infer<typeof WordpressDraftPayloadSchema>;

// ------------------------------------------------------------------
// Domain object: PublishingBundle
// ------------------------------------------------------------------

export const PublishingBundleSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  executionArtifactId: z.string().uuid(),
  masterplanItemId: z.string().uuid().nullable(),
  wordpressConnectionId: z.string().uuid().nullable(),
  status: z.enum(PUBLISHING_BUNDLE_STATUSES),
  bundleType: z.literal("wordpress_page_draft"),
  payload: WordpressDraftPayloadSchema,
  safetyChecks: DraftSafetyChecksSchema.nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublishingBundle = z.infer<typeof PublishingBundleSchema>;

// ------------------------------------------------------------------
// Domain object: WordpressDraft
// ------------------------------------------------------------------

export const WordpressDraftSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  publishingBundleId: z.string().uuid(),
  wordpressConnectionId: z.string().uuid(),
  executionArtifactId: z.string().uuid(),
  wpPostId: z.number().nullable(),
  wpPostType: z.string(),
  wpStatus: z.string(),
  wpEditLink: z.string().nullable(),
  wpPreviewLink: z.string().nullable(),
  targetSlug: z.string().nullable(),
  title: z.string().nullable(),
  status: z.enum(WORDPRESS_DRAFT_STATUSES),
  errorMessage: z.string().nullable(),
  publishedAt: z.string().nullable(),
  publishedBy: z.string().uuid().nullable(),
  publishedUrl: z.string().nullable(),
  publicationNotes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WordpressDraft = z.infer<typeof WordpressDraftSchema>;

// ------------------------------------------------------------------
// Server function input schemas
// ------------------------------------------------------------------

export const CreateWordpressDraftInputSchema = z.object({
  tenantId: z.string().uuid(),
  artifactId: z.string().uuid(),
});
export type CreateWordpressDraftInput = z.infer<typeof CreateWordpressDraftInputSchema>;

export const GetWordpressDraftForArtifactInputSchema = z.object({
  tenantId: z.string().uuid(),
  artifactId: z.string().uuid(),
});

export const ListWordpressDraftsInputSchema = z.object({
  tenantId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const MarkWordpressDraftPublishedInputSchema = z.object({
  tenantId: z.string().uuid(),
  draftId: z.string().uuid(),
  publishedUrl: z.string().url().max(2000).optional(),
  notes: z.string().max(1000).optional(),
});
export type MarkWordpressDraftPublishedInput = z.infer<typeof MarkWordpressDraftPublishedInputSchema>;
