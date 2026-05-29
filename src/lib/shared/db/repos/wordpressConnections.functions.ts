/**
 * WordPress Connection + Inventory V1 — server functions.
 *
 * Credential model: credentials never stored here.
 *   - Self-hosted:   tenant_secrets key `site:{siteConnectionId}:app_password`
 *   - WordPress.com: tenant_secrets key `site:{siteConnectionId}:wpcom_access_token`
 *
 * All functions are read-only toward WordPress. No drafts, no writes.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decrypt } from "@/lib/shared/secrets/crypto.server";
import {
  checkSelfHostedCapabilities,
  checkWpcomCapabilities,
  fetchSelfHostedPages,
  fetchSelfHostedPosts,
  fetchWpcomInventory,
  normalizeWordpressBaseUrl,
  getSelfHostedRestBaseUrl,
} from "@/lib/shared/wpcom/wp-rest.server";
import {
  BuildWordpressPageMappingsSchema,
  CheckWordpressCapabilitiesSchema,
  CreateWordpressConnectionSchema,
  GetWordpressConnectionSchema,
  ListWordpressConnectionsSchema,
  ListWordpressInventorySchema,
  SyncWordpressInventorySchema,
} from "./wordpressConnections.schemas";

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
// Credential loader (reads from tenant_secrets, never returns value to client)
// ------------------------------------------------------------------

async function loadWordpressCredentials(
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
  if (!row) throw new Error(`Credential not found — re-add the connection (key: ${secretKey})`);

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
// 1. Get or create a wordpress_connections row
// ------------------------------------------------------------------

export const getOrCreateWordpressConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateWordpressConnectionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    // Check if already exists for this site_connection.
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("wordpress_connections")
      .select("*")
      .eq("site_connection_id", data.siteConnectionId)
      .maybeSingle();
    if (exErr) throw exErr;
    if (existing) return { connection: rowToConnection(existing) };

    // Load the site_connection to determine kind + base_url.
    const { data: sc, error: scErr } = await supabaseAdmin
      .from("site_connections")
      .select("id, type, base_url, tenant_id")
      .eq("id", data.siteConnectionId)
      .maybeSingle();
    if (scErr) throw scErr;
    if (!sc) throw new Error("Site connection not found");
    if (sc.tenant_id !== data.tenantId) throw new Error("Forbidden: tenant mismatch");

    const kind = sc.type === "wordpress_com" ? "wordpress_com" : "self_hosted";
    const baseUrl = normalizeWordpressBaseUrl(sc.base_url ?? "");
    if (!baseUrl) throw new Error("Site connection has no base_url");

    const { data: created, error: insErr } = await supabaseAdmin
      .from("wordpress_connections")
      .insert({
        tenant_id: data.tenantId,
        site_connection_id: data.siteConnectionId,
        site_id: data.siteId ?? null,
        kind,
        base_url: baseUrl,
        rest_base_url: kind === "self_hosted" ? getSelfHostedRestBaseUrl(baseUrl) : null,
        status: "not_connected",
        capabilities: {},
      })
      .select("*")
      .single();
    if (insErr) throw insErr;

    return { connection: rowToConnection(created) };
  });

// ------------------------------------------------------------------
// 2. Get existing wordpress_connection by siteConnectionId
// ------------------------------------------------------------------

export const getWordpressConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GetWordpressConnectionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    const { data: row, error } = await supabase
      .from("wordpress_connections")
      .select("*")
      .eq("site_connection_id", data.siteConnectionId)
      .maybeSingle();
    if (error) throw error;
    return { connection: row ? rowToConnection(row) : null };
  });

// ------------------------------------------------------------------
// 3. List all wordpress_connections for a tenant
// ------------------------------------------------------------------

export const listWordpressConnections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListWordpressConnectionsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    const { data: rows, error } = await supabase
      .from("wordpress_connections")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { connections: (rows ?? []).map(rowToConnection) };
  });

// ------------------------------------------------------------------
// 4. Check WordPress capabilities
// ------------------------------------------------------------------

export const checkWordpressCapabilities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CheckWordpressCapabilitiesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const { data: conn, error: cErr } = await supabase
      .from("wordpress_connections")
      .select("id, tenant_id, site_connection_id, kind, base_url")
      .eq("id", data.wordpressConnectionId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!conn) throw new Error("WordPress connection not found");
    if (conn.tenant_id !== data.tenantId) throw new Error("Forbidden: tenant mismatch");

    const { username, secret } = await loadWordpressCredentials(
      conn.site_connection_id,
      conn.tenant_id,
      conn.kind,
    );

    let capResult;
    if (conn.kind === "wordpress_com") {
      capResult = await checkWpcomCapabilities({ accessToken: secret });
    } else {
      if (!username) throw new Error("Self-hosted connection has no username");
      capResult = await checkSelfHostedCapabilities({
        baseUrl: conn.base_url,
        username,
        appPassword: secret,
      });
    }

    const newStatus = capResult.ok ? "connected" : "failed";
    const { error: uErr } = await supabaseAdmin
      .from("wordpress_connections")
      .update({
        status: newStatus,
        capabilities: capResult as unknown as Json,
        last_checked_at: new Date().toISOString(),
        error_message: capResult.error ?? null,
      })
      .eq("id", conn.id);
    if (uErr) throw uErr;

    // Return capability info but not the secret.
    const caps: CapabilitiesShape = {
      ok: capResult.ok,
      canReadPages: capResult.canReadPages,
      canReadPosts: capResult.canReadPosts,
      canCreateDraft: capResult.canCreateDraft,
      canUploadMedia: capResult.canUploadMedia,
      canReadTaxonomies: capResult.canReadTaxonomies,
      roles: capResult.roles,
      wpVersion: capResult.wpVersion,
      error: capResult.error,
      elapsedMs: capResult.elapsedMs,
    };
    return { status: newStatus, capabilities: caps };
  });

// ------------------------------------------------------------------
// 5. Sync WordPress site inventory
// ------------------------------------------------------------------

export const syncWordpressSiteInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SyncWordpressInventorySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const { data: conn, error: cErr } = await supabase
      .from("wordpress_connections")
      .select("id, tenant_id, site_connection_id, kind, base_url")
      .eq("id", data.wordpressConnectionId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!conn) throw new Error("WordPress connection not found");
    if (conn.tenant_id !== data.tenantId) throw new Error("Forbidden: tenant mismatch");

    const { username, secret } = await loadWordpressCredentials(
      conn.site_connection_id,
      conn.tenant_id,
      conn.kind,
    );

    let items: import("@/lib/shared/wpcom/wp-rest.server").WpInventoryItem[] = [];

    if (conn.kind === "wordpress_com") {
      const { data: sc } = await supabaseAdmin
        .from("site_connections")
        .select("external_account_id")
        .eq("id", conn.site_connection_id)
        .maybeSingle();
      const blogId = sc?.external_account_id;
      if (!blogId) throw new Error("WordPress.com blog ID not found on site_connection");
      items = await fetchWpcomInventory({ accessToken: secret, blogId });
    } else {
      if (!username) throw new Error("Self-hosted connection has no username");
      const [pages, posts] = await Promise.all([
        fetchSelfHostedPages({ baseUrl: conn.base_url, username, appPassword: secret }),
        fetchSelfHostedPosts({ baseUrl: conn.base_url, username, appPassword: secret }),
      ]);
      items = [...pages, ...posts];
    }

    const now = new Date().toISOString();
    const upsertRows = items.map((item) => ({
      tenant_id: conn.tenant_id,
      wordpress_connection_id: conn.id,
      site_connection_id: conn.site_connection_id,
      wp_post_id: item.id,
      post_type: item.type,
      status: item.status || null,
      title: item.title || null,
      slug: item.slug || null,
      link: item.link || null,
      parent_id: item.parent || null,
      template: item.template || null,
      modified_at: item.modified ? new Date(item.modified).toISOString() : null,
      raw: item as unknown as Json,
      last_synced_at: now,
    }));

    if (upsertRows.length > 0) {
      const { error: upsErr } = await supabaseAdmin
        .from("wordpress_site_inventory")
        .upsert(upsertRows, {
          onConflict: "wordpress_connection_id,wp_post_id,post_type",
        });
      if (upsErr) throw upsErr;
    }

    return { syncedCount: upsertRows.length };
  });

// ------------------------------------------------------------------
// 6. List inventory
// ------------------------------------------------------------------

export const listWordpressSiteInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListWordpressInventorySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    const { data: rows, error } = await supabase
      .from("wordpress_site_inventory")
      .select(
        "id, wp_post_id, post_type, status, title, slug, link, parent_id, template, modified_at, mapped_page_role, last_synced_at",
      )
      .eq("wordpress_connection_id", data.wordpressConnectionId)
      .order("post_type", { ascending: true })
      .order("title", { ascending: true })
      .limit(data.limit ?? 500);
    if (error) throw error;
    return { items: rows ?? [] };
  });

// ------------------------------------------------------------------
// 7. Build page mappings (conservative V1)
// ------------------------------------------------------------------

export const buildWordpressPageMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => BuildWordpressPageMappingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOperator(supabase, userId, data.tenantId);

    const { data: conn, error: cErr } = await supabase
      .from("wordpress_connections")
      .select("id, tenant_id, base_url")
      .eq("id", data.wordpressConnectionId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!conn) throw new Error("WordPress connection not found");
    if (conn.tenant_id !== data.tenantId) throw new Error("Forbidden: tenant mismatch");

    // Load inventory
    const { data: inventory, error: invErr } = await supabaseAdmin
      .from("wordpress_site_inventory")
      .select("id, wp_post_id, post_type, title, slug, link, parent_id, mapped_page_role")
      .eq("wordpress_connection_id", conn.id);
    if (invErr) throw invErr;
    const invRows = inventory ?? [];

    // Load business profile services/locations (optional)
    const { data: bp } = await supabaseAdmin
      .from("business_profiles_v2")
      .select("offer_profile, location_profile")
      .eq("tenant_id", conn.tenant_id)
      .maybeSingle();

    const services: string[] = [];
    const locations: string[] = [];
    if (bp) {
      const offer = (bp.offer_profile as Record<string, unknown> | null) ?? {};
      const loc = (bp.location_profile as Record<string, unknown> | null) ?? {};
      for (const a of [offer.highValueOffers, offer.secondaryOffers]) {
        if (Array.isArray(a)) {
          for (const s of a) {
            if (typeof s === "string" && s.trim()) services.push(s.trim().toLowerCase());
          }
        }
      }
      for (const a of [loc.serviceAreas]) {
        if (Array.isArray(a)) {
          for (const l of a) {
            if (typeof l === "string" && l.trim()) locations.push(l.trim().toLowerCase());
          }
        }
      }
      if (typeof loc.primaryLocation === "string" && loc.primaryLocation.trim()) {
        locations.push(loc.primaryLocation.trim().toLowerCase());
      }
    }

    // Load active masterplan items (optional)
    const { data: planRow } = await supabaseAdmin
      .from("master_plans")
      .select("id")
      .eq("tenant_id", conn.tenant_id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .maybeSingle();

    type MasterplanItemRow = {
      id: string;
      title: string;
      type: string;
      metadata: Record<string, unknown>;
    };
    let masterplanItems: MasterplanItemRow[] = [];
    if (planRow) {
      const { data: items } = await supabaseAdmin
        .from("masterplan_items")
        .select("id, title, type, metadata")
        .eq("tenant_id", conn.tenant_id)
        .eq("master_plan_id", planRow.id)
        .in("status", ["approved", "in_progress", "pending"]);
      masterplanItems = (items ?? []) as MasterplanItemRow[];
    }

    const mappings = buildMappings({
      connectionId: conn.id,
      tenantId: conn.tenant_id,
      baseUrl: conn.base_url,
      inventory: invRows as InventoryRow[],
      services,
      locations,
      masterplanItems,
    });

    // Delete existing mappings for this connection before re-inserting.
    await supabaseAdmin
      .from("wordpress_page_mappings")
      .delete()
      .eq("wordpress_connection_id", conn.id);

    if (mappings.length > 0) {
      const { error: insErr } = await supabaseAdmin
        .from("wordpress_page_mappings")
        .insert(mappings);
      if (insErr) throw insErr;
    }

    const summary = {
      existing: mappings.filter((m) => m.mapping_type === "existing_page").length,
      candidates: mappings.filter((m) => m.mapping_type === "candidate_match").length,
      missing: mappings.filter((m) => m.mapping_type === "missing_page").length,
      manual: mappings.filter((m) => m.mapping_type === "manual_match").length,
      total: mappings.length,
    };

    return { summary };
  });

// ------------------------------------------------------------------
// List mappings
// ------------------------------------------------------------------

export const listWordpressPageMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ tenantId: z.string().uuid(), wordpressConnectionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.tenantId);

    const { data: rows, error } = await supabase
      .from("wordpress_page_mappings")
      .select("id, mapping_type, target_service, target_location, confidence, reasons, inventory_id, masterplan_item_id")
      .eq("wordpress_connection_id", data.wordpressConnectionId)
      .order("mapping_type");
    if (error) throw error;
    return { mappings: rows ?? [] };
  });

// ------------------------------------------------------------------
// Mapping logic (pure, no DB)
// ------------------------------------------------------------------

interface InventoryRow {
  id: string;
  wp_post_id: number;
  post_type: string;
  title: string | null;
  slug: string | null;
  link: string | null;
  parent_id: number | null;
  mapped_page_role: string | null;
}

interface MappingRow {
  tenant_id: string;
  wordpress_connection_id: string;
  inventory_id: string | null;
  masterplan_item_id: string | null;
  mapping_type: string;
  target_service: string | null;
  target_location: string | null;
  confidence: number;
  reasons: string[];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function slugMatch(a: string, b: string): boolean {
  const na = a.replace(/-/g, " ").replace(/_/g, " ").trim().toLowerCase();
  const nb = b.replace(/-/g, " ").replace(/_/g, " ").trim().toLowerCase();
  return na === nb || na.includes(nb) || nb.includes(na);
}

function scoreMatch(
  term: string,
  slug: string | null,
  title: string | null,
): { score: number; reason: string } {
  const normTerm = normalize(term);
  const normSlug = normalize(slug ?? "").replace(/-/g, " ");
  const normTitle = normalize(title ?? "");

  if (normSlug === normTerm || normTitle === normTerm) {
    return { score: 0.9, reason: `Exact match: "${term}"` };
  }
  if (normSlug.includes(normTerm) || normTitle.includes(normTerm)) {
    return { score: 0.7, reason: `Contains term: "${term}"` };
  }
  if (normTerm.includes(normSlug) && normSlug.length > 3) {
    return { score: 0.5, reason: `Slug subset of term: "${term}"` };
  }
  const termWords = normTerm.split(" ").filter((w) => w.length > 3);
  const matchedWords = termWords.filter((w) => normSlug.includes(w) || normTitle.includes(w));
  if (matchedWords.length >= Math.ceil(termWords.length / 2) && termWords.length > 0) {
    return { score: 0.4, reason: `Word overlap: ${matchedWords.join(", ")}` };
  }
  return { score: 0, reason: "" };
}

function isHomepage(item: InventoryRow, baseUrl: string): boolean {
  const slug = (item.slug ?? "").toLowerCase();
  const link = (item.link ?? "").toLowerCase().replace(/\/+$/, "");
  const base = baseUrl.toLowerCase().replace(/\/+$/, "");
  return (
    slug === "" ||
    slug === "home" ||
    slug === "homepage" ||
    (item.post_type === "page" && item.parent_id === 0 && link === base)
  );
}

function isContactPage(item: InventoryRow): boolean {
  const slug = (item.slug ?? "").toLowerCase();
  const title = (item.title ?? "").toLowerCase();
  return (
    slugMatch(slug, "contact") ||
    slugMatch(slug, "contact-us") ||
    slugMatch(slug, "contact-me") ||
    title.includes("contact")
  );
}

function buildMappings(opts: {
  connectionId: string;
  tenantId: string;
  baseUrl: string;
  inventory: InventoryRow[];
  services: string[];
  locations: string[];
  masterplanItems: Array<{ id: string; title: string; type: string; metadata: Record<string, unknown> }>;
}): MappingRow[] {
  const { connectionId, tenantId, inventory, services, locations, masterplanItems, baseUrl } = opts;
  const result: MappingRow[] = [];
  const usedInventoryIds = new Set<string>();

  // --- Homepage
  const homepage = inventory.find((i) => isHomepage(i, baseUrl));
  if (homepage) {
    usedInventoryIds.add(homepage.id);
    result.push({
      tenant_id: tenantId,
      wordpress_connection_id: connectionId,
      inventory_id: homepage.id,
      masterplan_item_id: null,
      mapping_type: "existing_page",
      target_service: null,
      target_location: null,
      confidence: 0.95,
      reasons: ["Detected as homepage (root slug or link matches base URL)"],
    });
  }

  // --- Contact page
  const contact = inventory.find((i) => !usedInventoryIds.has(i.id) && isContactPage(i));
  if (contact) {
    usedInventoryIds.add(contact.id);
    result.push({
      tenant_id: tenantId,
      wordpress_connection_id: connectionId,
      inventory_id: contact.id,
      masterplan_item_id: null,
      mapping_type: "existing_page",
      target_service: null,
      target_location: null,
      confidence: 0.85,
      reasons: ["Detected as contact page (slug/title match)"],
    });
  }

  // --- Masterplan item matching
  for (const item of masterplanItems) {
    // Extract service/location hints from item title and metadata
    const meta = item.metadata as {
      service?: string;
      location?: string;
      targetKeyword?: string;
    };
    const titleLower = item.title.toLowerCase();
    const targetService = meta.service ?? null;
    const targetLocation = meta.location ?? null;
    const searchTerms: string[] = [item.title];
    if (targetService) searchTerms.push(targetService);
    if (targetLocation) searchTerms.push(targetLocation);
    if (meta.targetKeyword) searchTerms.push(meta.targetKeyword);

    // Find best matching inventory item
    let bestId: string | null = null;
    let bestScore = 0;
    const bestReasons: string[] = [];

    for (const inv of inventory) {
      if (usedInventoryIds.has(inv.id)) continue;
      if (inv.post_type === "post") continue; // prefer pages for masterplan targets

      let score = 0;
      const reasons: string[] = [];

      for (const term of searchTerms) {
        const { score: s, reason } = scoreMatch(term, inv.slug, inv.title);
        if (s > score) {
          score = s;
          if (reason) reasons.push(reason);
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestId = inv.id;
        bestReasons.length = 0;
        bestReasons.push(...reasons);
      }
    }

    if (bestId && bestScore >= 0.6) {
      usedInventoryIds.add(bestId);
      result.push({
        tenant_id: tenantId,
        wordpress_connection_id: connectionId,
        inventory_id: bestId,
        masterplan_item_id: item.id,
        mapping_type: bestScore >= 0.85 ? "existing_page" : "candidate_match",
        target_service: targetService,
        target_location: targetLocation,
        confidence: bestScore,
        reasons: bestReasons,
      });
    } else {
      // No matching WP page found → missing_page target
      result.push({
        tenant_id: tenantId,
        wordpress_connection_id: connectionId,
        inventory_id: null,
        masterplan_item_id: item.id,
        mapping_type: "missing_page",
        target_service: targetService,
        target_location: targetLocation,
        confidence: 0,
        reasons: [`No matching WordPress page found for "${item.title}"`],
      });
    }
  }

  // --- Service term matching (for unmapped service pages in inventory)
  for (const svc of services) {
    for (const inv of inventory) {
      if (usedInventoryIds.has(inv.id)) continue;
      if (inv.post_type === "post") continue;
      const { score, reason } = scoreMatch(svc, inv.slug, inv.title);
      if (score >= 0.7) {
        usedInventoryIds.add(inv.id);
        result.push({
          tenant_id: tenantId,
          wordpress_connection_id: connectionId,
          inventory_id: inv.id,
          masterplan_item_id: null,
          mapping_type: score >= 0.85 ? "existing_page" : "candidate_match",
          target_service: svc,
          target_location: null,
          confidence: score,
          reasons: [reason],
        });
      }
    }
  }

  // --- Location term matching
  for (const loc of locations) {
    for (const inv of inventory) {
      if (usedInventoryIds.has(inv.id)) continue;
      if (inv.post_type === "post") continue;
      const { score, reason } = scoreMatch(loc, inv.slug, inv.title);
      if (score >= 0.7) {
        usedInventoryIds.add(inv.id);
        result.push({
          tenant_id: tenantId,
          wordpress_connection_id: connectionId,
          inventory_id: inv.id,
          masterplan_item_id: null,
          mapping_type: score >= 0.85 ? "existing_page" : "candidate_match",
          target_service: null,
          target_location: loc,
          confidence: score,
          reasons: [reason],
        });
      }
    }
  }

  return result;
}

// ------------------------------------------------------------------
// Serializable capability shape (all values are JSON primitives or string[])
// ------------------------------------------------------------------

type CapabilitiesShape = {
  ok?: boolean;
  canReadPages?: boolean;
  canReadPosts?: boolean;
  canCreateDraft?: boolean;
  canUploadMedia?: boolean;
  canReadTaxonomies?: boolean;
  roles?: string[];
  wpVersion?: string | null;
  error?: string;
  httpStatus?: number;
  elapsedMs?: number;
};

// ------------------------------------------------------------------
// Row mapper (DB snake_case → camelCase, no secret fields)
// ------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToConnection(row: any) {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    siteConnectionId: row.site_connection_id as string,
    siteId: (row.site_id as string | null) ?? null,
    kind: row.kind as string,
    baseUrl: row.base_url as string,
    restBaseUrl: (row.rest_base_url as string | null) ?? null,
    status: row.status as string,
    capabilities: (row.capabilities as CapabilitiesShape | null) ?? {} as CapabilitiesShape,
    lastCheckedAt: (row.last_checked_at as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
