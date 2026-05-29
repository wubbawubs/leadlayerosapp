import { z } from "zod";

export const INGESTION_SOURCE_TYPES = ["form_webhook", "wordpress_form", "manual", "other"] as const;
export type IngestionSourceType = (typeof INGESTION_SOURCE_TYPES)[number];

export const INGESTION_SOURCE_STATUSES = ["active", "disabled", "revoked"] as const;
export type IngestionSourceStatus = (typeof INGESTION_SOURCE_STATUSES)[number];

// ------------------------------------------------------------------
// Domain object
// ------------------------------------------------------------------

export const LeadIngestionSourceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  siteConnectionId: z.string().uuid().nullable(),
  name: z.string(),
  sourceType: z.enum(INGESTION_SOURCE_TYPES),
  publicKey: z.string(),
  status: z.enum(INGESTION_SOURCE_STATUSES),
  allowedOrigins: z.array(z.string()),
  defaultSource: z.string(),
  defaultStatus: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LeadIngestionSource = z.infer<typeof LeadIngestionSourceSchema>;

// ------------------------------------------------------------------
// Server function inputs
// ------------------------------------------------------------------

export const CreateLeadIngestionSourceInputSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(100),
  sourceType: z.enum(INGESTION_SOURCE_TYPES).optional().default("form_webhook"),
  siteConnectionId: z.string().uuid().nullable().optional(),
  allowedOrigins: z.array(z.string().url()).optional().default([]),
  defaultSource: z.string().max(80).optional().default("form"),
});
export type CreateLeadIngestionSourceInput = z.infer<typeof CreateLeadIngestionSourceInputSchema>;

export const ListLeadIngestionSourcesInputSchema = z.object({
  tenantId: z.string().uuid(),
});

export const RevokeLeadIngestionSourceInputSchema = z.object({
  tenantId: z.string().uuid(),
  sourceId: z.string().uuid(),
});

// ------------------------------------------------------------------
// Public webhook payload schema (used in the public endpoint)
// ------------------------------------------------------------------

export const WebhookLeadPayloadSchema = z.object({
  publicKey: z.string().min(1),
  name: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(200).optional(),
  message: z.string().max(2000).optional(),
  source: z.string().max(80).optional(),
  service: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  pageUrl: z.string().max(500).optional(),
  referrer: z.string().max(500).optional(),
  utm_source: z.string().max(100).optional(),
  utm_medium: z.string().max(100).optional(),
  utm_campaign: z.string().max(100).optional(),
  utm_term: z.string().max(100).optional(),
  utm_content: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type WebhookLeadPayload = z.infer<typeof WebhookLeadPayloadSchema>;
