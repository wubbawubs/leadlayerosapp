/**
 * Lead Ingestion Webhook V1 — operator server functions.
 *
 * Operators use these to create and manage webhook keys.
 * The public ingestion endpoint lives at /api/public/lead-ingest.
 *
 * Key generation: 48-char hex (randomBytes(24)) — never expose tenant_id.
 * RLS: operator/owner only for writes; members can read.
 */
import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "crypto";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CreateLeadIngestionSourceInputSchema,
  ListLeadIngestionSourcesInputSchema,
  RevokeLeadIngestionSourceInputSchema,
  type LeadIngestionSource,
  type IngestionSourceType,
  type IngestionSourceStatus,
} from "./schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

// ------------------------------------------------------------------
// Auth helpers
// ------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertOperator(supabase: any, userId: string, tenantId: string) {
  const { data, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: not a member of this tenant");
  if (data.role !== "owner" && data.role !== "operator") {
    throw new Error("Forbidden: requires operator or owner role");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertMember(supabase: any, userId: string, tenantId: string) {
  const { data, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: not a member of this tenant");
}

function rowToSource(r: Record<string, unknown>): LeadIngestionSource {
  return {
    id: r.id as string,
    tenantId: r.tenant_id as string,
    siteConnectionId: (r.site_connection_id as string | null) ?? null,
    name: r.name as string,
    sourceType: (r.source_type as IngestionSourceType) ?? "form_webhook",
    publicKey: r.public_key as string,
    status: (r.status as IngestionSourceStatus) ?? "active",
    allowedOrigins: Array.isArray(r.allowed_origins) ? (r.allowed_origins as string[]) : [],
    defaultSource: (r.default_source as string) ?? "form",
    defaultStatus: (r.default_status as string) ?? "new",
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// ------------------------------------------------------------------
// 1. createLeadIngestionSource
// ------------------------------------------------------------------

export const createLeadIngestionSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateLeadIngestionSourceInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const publicKey = randomBytes(24).toString("hex");

    const { data: row, error } = await admin
      .from("lead_ingestion_sources")
      .insert({
        tenant_id: data.tenantId,
        site_connection_id: data.siteConnectionId ?? null,
        name: data.name,
        source_type: data.sourceType ?? "form_webhook",
        public_key: publicKey,
        status: "active",
        allowed_origins: data.allowedOrigins ?? [],
        default_source: data.defaultSource ?? "form",
        default_status: "new",
      })
      .select("*")
      .single();
    if (error) throw error;

    return { ok: true, source: rowToSource(row as Record<string, unknown>) };
  });

// ------------------------------------------------------------------
// 2. listLeadIngestionSources
// ------------------------------------------------------------------

export const listLeadIngestionSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListLeadIngestionSourcesInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    const { data: rows, error } = await admin
      .from("lead_ingestion_sources")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return {
      sources: (rows ?? []).map((r: Record<string, unknown>) => rowToSource(r)),
    };
  });

// ------------------------------------------------------------------
// 3. revokeLeadIngestionSource
// ------------------------------------------------------------------

export const revokeLeadIngestionSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RevokeLeadIngestionSourceInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const { data: row, error } = await admin
      .from("lead_ingestion_sources")
      .update({ status: "revoked" })
      .eq("id", data.sourceId)
      .eq("tenant_id", data.tenantId)
      .select("*")
      .single();
    if (error) throw error;

    return { ok: true, source: rowToSource(row as Record<string, unknown>) };
  });
