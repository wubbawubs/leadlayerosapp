/**
 * WordPress Draft Creation V1 — server functions.
 *
 * Flow: approved page_brief execution_artifact → publishing_bundle → wordpress_drafts row.
 *
 * Gates enforced before calling WordPress:
 *   - artifact.status must be "approved"
 *   - artifact.artifact_type must be "page_brief"
 *   - wordpress_connection.status must be "connected"
 *   - capabilities.canCreateDraft must be true
 *   - V1: self-hosted WordPress only. WP.com draft creation is unsupported.
 *
 * No live publish. The maximum automated WP status written is "draft".
 * Credentials are never returned to the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decrypt } from "@/lib/shared/secrets/crypto.server";
import { createSelfHostedWordpressDraft } from "@/lib/shared/wpcom/wp-rest.server";
import { pageBriefToGutenbergContent } from "./gutenberg.server";
import {
  CreateWordpressDraftInputSchema,
  GetWordpressDraftForArtifactInputSchema,
  ListWordpressDraftsInputSchema,
  MarkWordpressDraftPublishedInputSchema,
  type DraftSafetyChecks,
  type WordpressDraftPayload,
} from "./schemas";
import type { PageBriefArtifactPayload, ArtifactQualityGates } from "@/lib/shared/executionArtifacts/schemas";

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

// ------------------------------------------------------------------
// Credential loader (mirrors wordpressConnections.functions.ts pattern)
// Credentials are never returned to the client.
// ------------------------------------------------------------------

async function loadCredentials(
  siteConnectionId: string,
  tenantId: string,
  kind: string,
): Promise<{ username: string | null; secret: string }> {
  const secretKey =
    kind === "wordpress_com"
      ? `site:${siteConnectionId}:wpcom_access_token`
      : `site:${siteConnectionId}:app_password`;

  const { data: row, error } = await supabaseAdmin
    .from("tenant_secrets")
    .select("value_encrypted, encryption_version")
    .eq("tenant_id", tenantId)
    .eq("key", secretKey)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error(`Credential not found — re-add the WordPress connection (key: ${secretKey})`);

  const secret = decrypt(row.value_encrypted, row.encryption_version);

  if (kind === "self_hosted") {
    const { data: sc } = await supabaseAdmin
      .from("site_connections")
      .select("username")
      .eq("id", siteConnectionId)
      .maybeSingle();
    return { username: sc?.username ?? null, secret };
  }

  return { username: null, secret };
}

// ------------------------------------------------------------------
// 1. createWordpressDraftFromArtifact
//    The primary server action: approved artifact → WP draft
// ------------------------------------------------------------------

export const createWordpressDraftFromArtifact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateWordpressDraftInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    // 1. Load artifact
    const { data: artRow, error: artErr } = await admin
      .from("execution_artifacts")
      .select("id, tenant_id, masterplan_item_id, artifact_type, status, payload, quality_gates, delivery_readiness, risk_flags, missing_context")
      .eq("id", data.artifactId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (artErr) throw artErr;
    if (!artRow) throw new Error("Execution artifact not found");

    // Gate: type check
    if (artRow.artifact_type !== "page_brief") {
      throw new Error(`Draft creation only supported for page_brief artifacts (got: ${artRow.artifact_type as string})`);
    }
    // Gate: must be approved
    if (artRow.status !== "approved") {
      throw new Error(`Artifact must be approved before creating a WordPress draft (current status: ${artRow.status as string})`);
    }

    const payload = artRow.payload as PageBriefArtifactPayload;
    const qualityGates = (artRow.quality_gates ?? {}) as Partial<ArtifactQualityGates>;
    const riskFlags: string[] = Array.isArray(artRow.risk_flags) ? artRow.risk_flags : [];
    const missingContext: string[] = Array.isArray(artRow.missing_context) ? artRow.missing_context : [];

    // 2. Load WordPress connection
    const { data: connRow, error: connErr } = await admin
      .from("wordpress_connections")
      .select("id, site_connection_id, kind, base_url, status, capabilities")
      .eq("tenant_id", data.tenantId)
      .eq("status", "connected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (connErr) throw connErr;
    if (!connRow) throw new Error("No connected WordPress site found. Connect a WordPress site first.");

    const kind = connRow.kind as string;

    // Gate: self-hosted only for V1
    if (kind === "wordpress_com") {
      throw new Error(
        "WordPress.com draft creation is not supported in V1. " +
        "Use a self-hosted WordPress site with Application Passwords enabled.",
      );
    }

    // Gate: canCreateDraft capability
    const caps = (connRow.capabilities ?? {}) as Record<string, unknown>;
    const canCreateDraft = caps.canCreateDraft === true;
    if (!canCreateDraft) {
      throw new Error(
        "The connected WordPress site does not have draft creation capability. " +
        "Re-check the connection from the Sites page to refresh capabilities.",
      );
    }

    // 3. Build safety checks (stored on bundle, checked before API call)
    const safetyChecks: DraftSafetyChecks = {
      artifactApproved: artRow.status === "approved",
      businessProfileReviewed: qualityGates.businessProfileReviewed ?? false,
      toneProfileReviewed: qualityGates.toneProfileReviewed ?? false,
      wordpressConnected: true,
      canCreateDraft,
      noLivePublish: true,
      claimRiskFlagCount: riskFlags.length,
      missingContextCount: missingContext.length,
      checkedAt: new Date().toISOString(),
    };

    if (!safetyChecks.artifactApproved || !safetyChecks.wordpressConnected || !safetyChecks.canCreateDraft) {
      throw new Error("Safety checks failed — cannot create WordPress draft");
    }

    // 4. Transform page brief → WP content
    const draftPayload: WordpressDraftPayload = pageBriefToGutenbergContent(payload);

    // 5. Create publishing_bundle
    const { data: bundle, error: bundleErr } = await admin
      .from("publishing_bundles")
      .insert({
        tenant_id: data.tenantId,
        execution_artifact_id: data.artifactId,
        masterplan_item_id: artRow.masterplan_item_id as string,
        wordpress_connection_id: connRow.id as string,
        status: "draft_ready",
        bundle_type: "wordpress_page_draft",
        payload: draftPayload,
        safety_checks: safetyChecks,
      })
      .select("id")
      .single();
    if (bundleErr) throw bundleErr;

    // 6. Load credentials (never returned to client)
    let wpResult;
    try {
      const { username, secret } = await loadCredentials(
        connRow.site_connection_id as string,
        data.tenantId,
        kind,
      );
      if (!username) throw new Error("WordPress username not found in site connection");

      // 7. Call WP REST API — draft only
      wpResult = await createSelfHostedWordpressDraft({
        baseUrl: connRow.base_url as string,
        username,
        appPassword: secret,
        title: draftPayload.title,
        slug: draftPayload.slug,
        content: draftPayload.content,
        excerpt: draftPayload.excerpt,
      });
    } catch (credErr) {
      // Credential / network failure — record the failed draft row, update bundle
      const errMsg = credErr instanceof Error ? credErr.message : "Credential load failed";
      await admin.from("wordpress_drafts").insert({
        tenant_id: data.tenantId,
        publishing_bundle_id: bundle.id as string,
        wordpress_connection_id: connRow.id as string,
        execution_artifact_id: data.artifactId,
        status: "failed",
        error_message: errMsg,
        raw_response: {},
      });
      await admin
        .from("publishing_bundles")
        .update({ status: "failed", error_message: errMsg })
        .eq("id", bundle.id);
      throw new Error(errMsg);
    }

    // 8. Save wordpress_drafts row
    const draftStatus = wpResult.ok ? "created" : "failed";
    const bundleStatus = wpResult.ok ? "draft_created" : "failed";

    const { data: draftRow, error: draftErr } = await admin
      .from("wordpress_drafts")
      .insert({
        tenant_id: data.tenantId,
        publishing_bundle_id: bundle.id as string,
        wordpress_connection_id: connRow.id as string,
        execution_artifact_id: data.artifactId,
        wp_post_id: wpResult.wpPostId,
        wp_post_type: "page",
        wp_status: wpResult.wpStatus ?? "draft",
        wp_edit_link: wpResult.wpEditLink,
        wp_preview_link: wpResult.wpPreviewLink,
        target_slug: draftPayload.slug,
        title: draftPayload.title,
        status: draftStatus,
        error_message: wpResult.ok ? null : (wpResult.error ?? "WP API error"),
        raw_response: wpResult.rawResponse,
      })
      .select("id")
      .single();
    if (draftErr) throw draftErr;

    // 9. Update bundle status
    await admin
      .from("publishing_bundles")
      .update({ status: bundleStatus, error_message: wpResult.ok ? null : wpResult.error })
      .eq("id", bundle.id);

    if (!wpResult.ok) {
      throw new Error(wpResult.error ?? "WordPress API returned an error");
    }

    return {
      ok: true,
      draftId: draftRow.id as string,
      bundleId: bundle.id as string,
      wpPostId: wpResult.wpPostId,
      wpEditLink: wpResult.wpEditLink,
      wpPreviewLink: wpResult.wpPreviewLink,
      slug: wpResult.slug,
    };
  });

// ------------------------------------------------------------------
// 2. getWordpressDraftForArtifact
//    Returns the latest draft for an artifact (if any)
// ------------------------------------------------------------------

export const getWordpressDraftForArtifact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GetWordpressDraftForArtifactInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    const { data: row, error } = await admin
      .from("wordpress_drafts")
      .select("id, status, wp_post_id, wp_edit_link, wp_preview_link, target_slug, title, error_message, published_at, published_by, published_url, publication_notes, created_at")
      .eq("tenant_id", data.tenantId)
      .eq("execution_artifact_id", data.artifactId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    if (!row) return { draft: null };

    return {
      draft: {
        id: row.id as string,
        status: row.status as string,
        wpPostId: row.wp_post_id as number | null,
        wpEditLink: row.wp_edit_link as string | null,
        wpPreviewLink: row.wp_preview_link as string | null,
        targetSlug: row.target_slug as string | null,
        title: row.title as string | null,
        errorMessage: row.error_message as string | null,
        publishedAt: (row.published_at as string | null) ?? null,
        publishedBy: (row.published_by as string | null) ?? null,
        publishedUrl: (row.published_url as string | null) ?? null,
        publicationNotes: (row.publication_notes as string | null) ?? null,
        createdAt: row.created_at as string,
      },
    };
  });

// ------------------------------------------------------------------
// 3. listWordpressDraftsForTenant
//    List recent drafts for ops/reporting
// ------------------------------------------------------------------

export const listWordpressDraftsForTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListWordpressDraftsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    const { data: rows, error } = await admin
      .from("wordpress_drafts")
      .select("id, status, wp_post_id, wp_edit_link, wp_preview_link, target_slug, title, error_message, published_at, published_by, published_url, publication_notes, created_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw error;

    return {
      drafts: (rows ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        status: r.status as string,
        wpPostId: r.wp_post_id as number | null,
        wpEditLink: r.wp_edit_link as string | null,
        wpPreviewLink: r.wp_preview_link as string | null,
        targetSlug: r.target_slug as string | null,
        title: r.title as string | null,
        errorMessage: r.error_message as string | null,
        publishedAt: (r.published_at as string | null) ?? null,
        publishedBy: (r.published_by as string | null) ?? null,
        publishedUrl: (r.published_url as string | null) ?? null,
        publicationNotes: (r.publication_notes as string | null) ?? null,
        createdAt: r.created_at as string,
      })),
    };
  });

// ------------------------------------------------------------------
// 4. markWordpressDraftPublished
//    Operator confirms that a draft was published in WP admin.
//    This is a manual record — no WP API call is made.
// ------------------------------------------------------------------

export const markWordpressDraftPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MarkWordpressDraftPublishedInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const { data: existing, error: checkErr } = await admin
      .from("wordpress_drafts")
      .select("id, status, published_at")
      .eq("id", data.draftId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (checkErr) throw checkErr;
    if (!existing) throw new Error("WordPress draft not found");
    if (existing.published_at) throw new Error("Draft is already marked as published");

    const { data: row, error } = await admin
      .from("wordpress_drafts")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        published_by: userId,
        published_url: data.publishedUrl ?? null,
        publication_notes: data.notes ?? null,
      })
      .eq("id", data.draftId)
      .eq("tenant_id", data.tenantId)
      .select("id, status, published_at, published_url, publication_notes, wp_edit_link, wp_preview_link, target_slug, title")
      .single();
    if (error) throw error;

    return {
      ok: true,
      draftId: row.id as string,
      status: row.status as string,
      publishedAt: row.published_at as string,
      publishedUrl: (row.published_url as string | null) ?? null,
      title: (row.title as string | null) ?? null,
      targetSlug: (row.target_slug as string | null) ?? null,
    };
  });