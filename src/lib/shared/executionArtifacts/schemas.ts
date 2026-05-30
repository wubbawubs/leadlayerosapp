/**
 * Execution Artifact Foundation V1 — schemas.
 *
 * execution_artifacts is the first real execution layer.
 * proposal_v2 stays for audit-fix micro-proposals.
 *
 * V1 supports: page_brief (service_page, location_page items).
 * Future: page_optimization_brief, cta_recommendation, gbp_checklist, etc.
 */
import { z } from "zod";

// ------------------------------------------------------------------
// Enums
// ------------------------------------------------------------------

export const ARTIFACT_TYPES = [
  "page_brief",
  "page_optimization_brief",
  "cta_recommendation",
  "gbp_checklist",
  "tracking_checklist",
  "review_flow",
  "report_brief",
] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const ARTIFACT_STATUSES = ["draft", "needs_review", "approved", "rejected"] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

export const WORDPRESS_DELIVERY_STATES = [
  "missing",
  "connected",
  "inventory_synced",
] as const;
export type WordpressDeliveryState = (typeof WORDPRESS_DELIVERY_STATES)[number];

// ------------------------------------------------------------------
// Sub-schemas
// ------------------------------------------------------------------

export const PageBriefSectionSchema = z.object({
  heading: z.string().max(160),
  body: z.string().max(1500),
});
export type PageBriefSection = z.infer<typeof PageBriefSectionSchema>;

export const PageBriefFaqItemSchema = z.object({
  question: z.string().max(250),
  answer: z.string().max(500),
});
export type PageBriefFaqItem = z.infer<typeof PageBriefFaqItemSchema>;

export const PageBriefCtaBlockSchema = z.object({
  primary: z.string().max(100),
  secondary: z.string().max(100).nullable().optional(),
  placement: z.string().max(250),
});
export type PageBriefCtaBlock = z.infer<typeof PageBriefCtaBlockSchema>;

export const PageBriefProofBlockSchema = z.object({
  items: z.array(z.string().max(250)).max(8),
  missingProof: z.array(z.string().max(250)).max(8),
});
export type PageBriefProofBlock = z.infer<typeof PageBriefProofBlockSchema>;

export const PageBriefSchemaRecommendationSchema = z.object({
  type: z.string().max(100),
  suggestedFields: z.record(z.string()),
  missingProofForSchema: z.array(z.string().max(250)).max(6),
});
export type PageBriefSchemaRecommendation = z.infer<typeof PageBriefSchemaRecommendationSchema>;

export const PageBriefInternalLinkTargetSchema = z.object({
  anchorText: z.string().max(100),
  targetSlug: z.string().max(150),
  rationale: z.string().max(250),
});
export type PageBriefInternalLinkTarget = z.infer<typeof PageBriefInternalLinkTargetSchema>;

export const PageBriefWordpressMappingSchema = z.object({
  status: z.enum(["existing_page", "missing_page", "candidate_match", "no_inventory"]),
  inventoryItemId: z.string().uuid().nullable(),
  existingSlug: z.string().nullable(),
  existingTitle: z.string().nullable(),
  recommendedAction: z.enum([
    "optimize_existing",
    "create_new",
    "needs_operator_validation",
    "not_applicable",
  ]),
});
export type PageBriefWordpressMapping = z.infer<typeof PageBriefWordpressMappingSchema>;

// ------------------------------------------------------------------
// PageBriefArtifactPayload (stored in execution_artifacts.payload)
// ------------------------------------------------------------------

export const PageBriefArtifactPayloadSchema = z.object({
  pageType: z.enum(["service_page", "location_page"]),
  targetService: z.string().nullable(),
  targetLocation: z.string().nullable(),
  // Primary keyword targeted in H1, meta title, and introBlock first paragraph
  primaryKeyword: z.string().max(120).nullable().default(null),
  // Full keyword cluster from DataForSEO — secondary terms for natural language coverage
  keywordCluster: z.array(z.string().max(120)).max(20).default([]),
  keywordVolume: z.number().int().nullable().default(null),
  keywordDifficulty: z.number().nullable().default(null),
  targetSlug: z.string().max(150),
  parentSlug: z.string().max(150).nullable(),
  h1: z.string().max(120),
  metaTitle: z.string().max(70),
  metaDescription: z.string().max(160),
  introBlock: z.string().max(2000),
  serviceSections: z.array(PageBriefSectionSchema).max(8),
  faqBlock: z.array(PageBriefFaqItemSchema).max(8),
  proofBlock: PageBriefProofBlockSchema,
  ctaBlock: PageBriefCtaBlockSchema,
  schemaRecommendation: PageBriefSchemaRecommendationSchema,
  internalLinkTargets: z.array(PageBriefInternalLinkTargetSchema).max(6),
  wordpressMapping: PageBriefWordpressMappingSchema,
  operatorNotes: z.string().max(1000),
  successMetric: z.string().max(300),
  assumptions: z.array(z.string().max(300)).max(10),
  missingContext: z.array(z.string().max(300)).max(10),
  riskFlags: z.array(z.string().max(300)).max(10),
});
export type PageBriefArtifactPayload = z.infer<typeof PageBriefArtifactPayloadSchema>;

// ------------------------------------------------------------------
// Quality gates (stored in execution_artifacts.quality_gates)
// ------------------------------------------------------------------

export const ArtifactQualityGatesSchema = z.object({
  businessProfileReviewed: z.boolean(),
  toneProfileReviewed: z.boolean(),
  claimGuardrailsPresent: z.boolean(),
  inputQualityOk: z.boolean(),
  gatesPassedAt: z.string().nullable(),
  gateFailureReasons: z.array(z.string()),
});
export type ArtifactQualityGates = z.infer<typeof ArtifactQualityGatesSchema>;

// ------------------------------------------------------------------
// Delivery readiness (stored in execution_artifacts.delivery_readiness)
// ------------------------------------------------------------------

export const ArtifactDeliveryReadinessSchema = z.object({
  wordpress: z.enum(WORDPRESS_DELIVERY_STATES),
  wordpressConnectionId: z.string().uuid().nullable(),
  inventoryCount: z.number().int(),
  hasMappingForThisItem: z.boolean(),
  draftReadyAfterApproval: z.boolean(),
  blockers: z.array(z.string()),
});
export type ArtifactDeliveryReadiness = z.infer<typeof ArtifactDeliveryReadinessSchema>;

// ------------------------------------------------------------------
// Top-level ExecutionArtifact (domain object)
// ------------------------------------------------------------------

export const ExecutionArtifactSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  masterplanItemId: z.string().uuid(),
  growthGoalId: z.string().uuid().nullable(),
  artifactType: z.enum(ARTIFACT_TYPES),
  status: z.enum(ARTIFACT_STATUSES),
  payload: PageBriefArtifactPayloadSchema,
  qualityGates: ArtifactQualityGatesSchema,
  deliveryReadiness: ArtifactDeliveryReadinessSchema,
  riskFlags: z.array(z.string()),
  missingContext: z.array(z.string()),
  generatedFrom: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ExecutionArtifact = z.infer<typeof ExecutionArtifactSchema>;

// ------------------------------------------------------------------
// Server function inputs
// ------------------------------------------------------------------

export const GeneratePageBriefInputSchema = z.object({
  tenantId: z.string().uuid(),
  masterplanItemId: z.string().uuid(),
});
export type GeneratePageBriefInput = z.infer<typeof GeneratePageBriefInputSchema>;

export const UpdateExecutionArtifactStatusInputSchema = z.object({
  tenantId: z.string().uuid(),
  artifactId: z.string().uuid(),
  status: z.enum(ARTIFACT_STATUSES),
  operatorNote: z.string().max(1000).optional(),
});
export type UpdateExecutionArtifactStatusInput = z.infer<
  typeof UpdateExecutionArtifactStatusInputSchema
>;
