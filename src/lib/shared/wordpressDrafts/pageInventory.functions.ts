/**
 * Page Inventory — unified list of all pages for a tenant.
 *
 * Merges:
 *   - wordpress_drafts  → new pages created by LeadLayer
 *   - wordpress_page_updates (status=applied) → existing pages optimized by LeadLayer
 *
 * Deduplication: a page that has both a draft AND an optimization shows the
 * most recent action as the canonical state.
 *
 * Powers the Pages tab in the client command center.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

export interface PageInventoryItem {
  id: string;
  source: "leadlayer_new" | "leadlayer_optimized";
  type: "new_page" | "optimized";
  status: "live" | "draft" | "failed";
  draftStatus: string | null; // raw wordpress_drafts.status — Publishing Gate state for new-page drafts
  title: string | null;
  slug: string | null;
  url: string | null;
  wpEditLink: string | null;
  wpPreviewLink: string | null;
  wpPostId: number | null;
  seoMetaStatus: string | null;
  publishedAt: string | null;
  lastActionAt: string;
}

export const getPageInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ tenantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: member } = await supabase
      .from("memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (!member) throw new Error("Forbidden");

    const [draftRows, updateRows] = await Promise.all([
      // New pages (drafts)
      admin
        .from("wordpress_drafts")
        .select(
          "id, title, target_slug, wp_post_id, wp_edit_link, wp_preview_link, published_url, status, seo_meta_status, published_at, created_at, updated_at",
        )
        .eq("tenant_id", data.tenantId)
        .order("created_at", { ascending: false }),

      // Optimized existing pages
      admin
        .from("wordpress_page_updates")
        .select(
          "id, wp_post_id, wordpress_connection_id, snapshot_id, applied_at, created_at, raw_response",
        )
        .eq("tenant_id", data.tenantId)
        .eq("status", "applied")
        .order("applied_at", { ascending: false }),
    ]);

    // Load inventory titles for optimized pages
    const optimizedPostIds = (updateRows ?? [])
      .map((u: { wp_post_id: number }) => u.wp_post_id)
      .filter(Boolean);
    const invTitleByPostId = new Map<
      number,
      { title: string | null; slug: string | null; link: string | null }
    >();
    if (optimizedPostIds.length > 0) {
      const { data: invRows } = await admin
        .from("wordpress_site_inventory")
        .select("wp_post_id, title, slug, link")
        .eq("tenant_id", data.tenantId)
        .in("wp_post_id", optimizedPostIds);
      for (const r of (invRows ?? []) as Array<{
        wp_post_id: number;
        title: string | null;
        slug: string | null;
        link: string | null;
      }>) {
        invTitleByPostId.set(r.wp_post_id, { title: r.title, slug: r.slug, link: r.link });
      }
    }

    const items: PageInventoryItem[] = [];

    // Track wp_post_ids we've seen to deduplicate
    const seenPostIds = new Set<number>();

    // New pages from drafts
    for (const r of (draftRows ?? []) as Array<{
      id: string;
      title: string | null;
      target_slug: string | null;
      wp_post_id: number | null;
      wp_edit_link: string | null;
      wp_preview_link: string | null;
      published_url: string | null;
      status: string;
      seo_meta_status: string | null;
      published_at: string | null;
      created_at: string;
      updated_at: string;
    }>) {
      if (r.wp_post_id) seenPostIds.add(r.wp_post_id);
      const status: PageInventoryItem["status"] =
        r.status === "published" ? "live" : r.status === "failed" ? "failed" : "draft";
      items.push({
        id: r.id,
        source: "leadlayer_new",
        type: "new_page",
        status,
        draftStatus: r.status,
        title: r.title,
        slug: r.target_slug,
        url: r.published_url,
        wpEditLink: r.wp_edit_link,
        wpPreviewLink: r.wp_preview_link,
        wpPostId: r.wp_post_id,
        seoMetaStatus: r.seo_meta_status,
        publishedAt: r.published_at,
        lastActionAt: r.updated_at,
      });
    }

    // Optimized existing pages — skip if already in drafts (same wp_post_id)
    for (const r of (updateRows ?? []) as Array<{
      id: string;
      wp_post_id: number;
      wordpress_connection_id: string;
      applied_at: string;
      created_at: string;
      raw_response: Record<string, unknown> | null;
    }>) {
      if (seenPostIds.has(r.wp_post_id)) continue; // draft covers this page
      const inv = invTitleByPostId.get(r.wp_post_id);
      const raw = r.raw_response ?? {};
      items.push({
        id: r.id,
        source: "leadlayer_optimized",
        type: "optimized",
        status: "live",
        draftStatus: null,
        title:
          inv?.title ??
          (typeof raw.title === "object" && raw.title !== null
            ? ((raw.title as Record<string, unknown>).rendered as string | null)
            : null),
        slug: inv?.slug ?? (typeof raw.slug === "string" ? raw.slug : null),
        url: inv?.link ?? (typeof raw.link === "string" ? raw.link : null),
        wpEditLink: null,
        wpPreviewLink: null,
        wpPostId: r.wp_post_id,
        seoMetaStatus: null,
        publishedAt: r.applied_at,
        lastActionAt: r.applied_at,
      });
    }

    // Sort: live first, then draft, then by lastActionAt desc
    const statusOrder = { live: 0, draft: 1, failed: 2 };
    items.sort((a, b) => {
      const sd = statusOrder[a.status] - statusOrder[b.status];
      if (sd !== 0) return sd;
      return new Date(b.lastActionAt).getTime() - new Date(a.lastActionAt).getTime();
    });

    return { pages: items };
  });
