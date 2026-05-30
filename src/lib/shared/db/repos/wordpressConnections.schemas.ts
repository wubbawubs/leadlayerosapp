import { z } from "zod";

// ------------------------------------------------------------------
// Enums
// ------------------------------------------------------------------

export const WordpressConnectionKindSchema = z.enum(["self_hosted", "wordpress_com"]);
export type WordpressConnectionKind = z.infer<typeof WordpressConnectionKindSchema>;

export const WordpressConnectionStatusSchema = z.enum([
  "not_connected",
  "connected",
  "failed",
  "needs_review",
  "revoked",
]);
export type WordpressConnectionStatus = z.infer<typeof WordpressConnectionStatusSchema>;

export const WordpressMappingTypeSchema = z.enum([
  "existing_page",
  "missing_page",
  "candidate_match",
  "manual_match",
]);
export type WordpressMappingType = z.infer<typeof WordpressMappingTypeSchema>;

// ------------------------------------------------------------------
// Capability check result
// ------------------------------------------------------------------

export const CapabilityCheckResultSchema = z.object({
  ok: z.boolean(),
  canReadPages: z.boolean().optional(),
  canReadPosts: z.boolean().optional(),
  canCreateDraft: z.boolean().optional(),
  canUploadMedia: z.boolean().optional(),
  canReadTaxonomies: z.boolean().optional(),
  roles: z.array(z.string()).optional(),
  wpVersion: z.string().nullable().optional(),
  seoPlugin: z.enum(["yoast", "rankmath", "none"]).optional(),
  error: z.string().optional(),
  httpStatus: z.number().optional(),
  elapsedMs: z.number().optional(),
});
export type CapabilityCheckResult = z.infer<typeof CapabilityCheckResultSchema>;

// ------------------------------------------------------------------
// Domain types (aligned with DB rows)
// ------------------------------------------------------------------

export const WordpressConnectionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  siteConnectionId: z.string().uuid(),
  siteId: z.string().uuid().nullable(),
  kind: WordpressConnectionKindSchema,
  baseUrl: z.string(),
  restBaseUrl: z.string().nullable(),
  status: WordpressConnectionStatusSchema,
  capabilities: CapabilityCheckResultSchema.partial(),
  lastCheckedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WordpressConnection = z.infer<typeof WordpressConnectionSchema>;

export const WordpressSiteInventoryItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  wordpressConnectionId: z.string().uuid(),
  siteConnectionId: z.string().uuid(),
  siteId: z.string().uuid().nullable(),
  wpPostId: z.number(),
  postType: z.string(),
  status: z.string().nullable(),
  title: z.string().nullable(),
  slug: z.string().nullable(),
  link: z.string().nullable(),
  parentId: z.number().nullable(),
  template: z.string().nullable(),
  modifiedAt: z.string().nullable(),
  contentHash: z.string().nullable(),
  mappedPageRole: z.string().nullable(),
  lastSyncedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WordpressSiteInventoryItem = z.infer<typeof WordpressSiteInventoryItemSchema>;

export const WordpressPageMappingSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  wordpressConnectionId: z.string().uuid(),
  inventoryId: z.string().uuid().nullable(),
  pageIntelligenceId: z.string().uuid().nullable(),
  masterplanItemId: z.string().uuid().nullable(),
  mappingType: WordpressMappingTypeSchema,
  targetService: z.string().nullable(),
  targetLocation: z.string().nullable(),
  confidence: z.number(),
  reasons: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WordpressPageMapping = z.infer<typeof WordpressPageMappingSchema>;

// ------------------------------------------------------------------
// Server function inputs
// ------------------------------------------------------------------

export const CreateWordpressConnectionSchema = z.object({
  tenantId: z.string().uuid(),
  siteConnectionId: z.string().uuid(),
  siteId: z.string().uuid().nullable().optional(),
});
export type CreateWordpressConnectionInput = z.infer<typeof CreateWordpressConnectionSchema>;

export const CheckWordpressCapabilitiesSchema = z.object({
  tenantId: z.string().uuid(),
  wordpressConnectionId: z.string().uuid(),
});
export type CheckWordpressCapabilitiesInput = z.infer<typeof CheckWordpressCapabilitiesSchema>;

export const SyncWordpressInventorySchema = z.object({
  tenantId: z.string().uuid(),
  wordpressConnectionId: z.string().uuid(),
});
export type SyncWordpressInventoryInput = z.infer<typeof SyncWordpressInventorySchema>;

export const ListWordpressInventorySchema = z.object({
  tenantId: z.string().uuid(),
  wordpressConnectionId: z.string().uuid(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const BuildWordpressPageMappingsSchema = z.object({
  tenantId: z.string().uuid(),
  wordpressConnectionId: z.string().uuid(),
});

export const GetWordpressConnectionSchema = z.object({
  tenantId: z.string().uuid(),
  siteConnectionId: z.string().uuid(),
});

export const ListWordpressConnectionsSchema = z.object({
  tenantId: z.string().uuid(),
});
