/**
 * Audit runner. Given a connected site, lists posts+pages via WordPress.com
 * REST API, fetches each URL, extracts SEO signals, and writes audit_pages
 * + audit summary.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decrypt } from "@/lib/shared/secrets/crypto.server";
import { wpcomFetch } from "@/lib/shared/wpcom/oauth.server";
import { extract, detectIssues, type PageIssue } from "./extract.server";

const MAX_PAGES = 20;
const FETCH_TIMEOUT_MS = 8000;

interface WpcomListItem {
  ID: number;
  URL: string;
  title?: string;
  type?: string;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: ctl.signal,
      headers: { "User-Agent": "LeadLayerAuditBot/1.0" },
    });
  } finally {
    clearTimeout(t);
  }
}

async function loadAccessToken(tenantId: string, connectionId: string): Promise<string> {
  const key = `site:${connectionId}:wpcom_access_token`;
  const { data, error } = await supabaseAdmin
    .from("tenant_secrets")
    .select("value_encrypted, encryption_version")
    .eq("tenant_id", tenantId)
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No access token stored for this site");
  return decrypt(data.value_encrypted, data.encryption_version);
}

export async function runAudit(auditId: string): Promise<void> {
  const { data: audit, error: aErr } = await supabaseAdmin
    .from("audits")
    .select("id, tenant_id, site_connection_id")
    .eq("id", auditId)
    .single();
  if (aErr || !audit) throw aErr ?? new Error("Audit not found");

  await supabaseAdmin
    .from("audits")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", auditId);

  try {
    const { data: site, error: sErr } = await supabaseAdmin
      .from("site_connections")
      .select("id, type, external_account_id, base_url")
      .eq("id", audit.site_connection_id)
      .single();
    if (sErr || !site) throw sErr ?? new Error("Site connection not found");
    if (site.type !== "wordpress_com") {
      throw new Error(`Audit not yet supported for type ${site.type}`);
    }
    if (!site.external_account_id || site.external_account_id === "0") {
      throw new Error("Site connection has no WordPress.com site id — reconnect");
    }

    const token = await loadAccessToken(audit.tenant_id, site.id);
    const siteId = encodeURIComponent(site.external_account_id);

    // List up to MAX_PAGES recent posts + pages
    const [posts, pages] = await Promise.all([
      wpcomFetch<{ posts: WpcomListItem[] }>(
        `/sites/${siteId}/posts?number=${MAX_PAGES}&fields=ID,URL,title,type`,
        token,
      ).catch((e) => { console.error("wpcom posts failed", e); return { posts: [] }; }),
      wpcomFetch<{ posts: WpcomListItem[] }>(
        `/sites/${siteId}/posts?number=${MAX_PAGES}&type=page&fields=ID,URL,title,type`,
        token,
      ).catch((e) => { console.error("wpcom pages failed", e); return { posts: [] }; }),
    ]);

    const all: WpcomListItem[] = [...(pages.posts ?? []), ...(posts.posts ?? [])];
    const seen = new Set<string>();
    const items = all.filter((i) => {
      if (!i.URL || seen.has(i.URL)) return false;
      seen.add(i.URL);
      return true;
    }).slice(0, MAX_PAGES);

    if (items.length === 0) {
      throw new Error("No posts or pages returned from WordPress.com");
    }

    const issueCounts = new Map<string, number>();
    let totalIssues = 0;
    let pagesOk = 0;

    for (const item of items) {
      let statusCode: number | null = null;
      let html = "";
      try {
        const res = await fetchWithTimeout(item.URL);
        statusCode = res.status;
        if (res.ok) html = await res.text();
      } catch (e) {
        statusCode = null;
        await supabaseAdmin.from("audit_pages").insert({
          audit_id: auditId,
          tenant_id: audit.tenant_id,
          url: item.URL,
          status_code: null,
          issues: [
            {
              code: "fetch_failed",
              severity: "high",
              message: (e as Error).message.slice(0, 200),
            },
          ],
        });
        totalIssues += 1;
        issueCounts.set("fetch_failed", (issueCounts.get("fetch_failed") ?? 0) + 1);
        continue;
      }

      const extracted = html ? extract(html, item.URL) : null;
      const issues: PageIssue[] = extracted
        ? detectIssues(extracted, statusCode)
        : [{ code: "http_error", severity: "high", message: `HTTP ${statusCode}` }];

      for (const i of issues) {
        issueCounts.set(i.code, (issueCounts.get(i.code) ?? 0) + 1);
      }
      totalIssues += issues.length;
      if (statusCode && statusCode < 400) pagesOk++;

      const { data: ap, error: apErr } = await supabaseAdmin
        .from("audit_pages")
        .insert({
          audit_id: auditId,
          tenant_id: audit.tenant_id,
          url: item.URL,
          status_code: statusCode,
          title: extracted?.title ?? null,
          meta_description: extracted?.meta_description ?? null,
          h1: extracted?.h1 ?? null,
          schema: (extracted?.schema ?? null) as never,
          images_without_alt: extracted?.images_without_alt ?? 0,
          internal_links_count: extracted?.internal_links_count ?? 0,
          external_links_count: extracted?.external_links_count ?? 0,
          word_count: extracted?.word_count ?? 0,
          issues: issues as never,
        })
        .select("id")
        .single();
      if (apErr) throw apErr;

      // Upsert into pages master list
      const { data: existingPage } = await supabaseAdmin
        .from("pages")
        .select("id")
        .eq("tenant_id", audit.tenant_id)
        .eq("url", item.URL)
        .maybeSingle();

      const pagePayload = {
        tenant_id: audit.tenant_id,
        site_connection_id: site.id,
        url: item.URL,
        title: extracted?.title ?? item.title ?? null,
        wp_post_id: item.ID,
        meta_description: extracted?.meta_description ?? null,
        h1: extracted?.h1 ?? null,
        status_code: statusCode,
        images_without_alt: extracted?.images_without_alt ?? 0,
        last_audited_at: new Date().toISOString(),
        health_score: Math.max(0, 100 - issues.length * 10),
      };

      let pageId: string | null = null;
      if (existingPage) {
        await supabaseAdmin.from("pages").update(pagePayload).eq("id", existingPage.id);
        pageId = existingPage.id;
      } else {
        const { data: ins } = await supabaseAdmin
          .from("pages")
          .insert(pagePayload)
          .select("id")
          .single();
        pageId = ins?.id ?? null;
      }
      if (pageId && ap) {
        await supabaseAdmin.from("audit_pages").update({ page_id: pageId }).eq("id", ap.id);
      }
    }

    const summary = {
      pages_total: items.length,
      pages_ok: pagesOk,
      issues_total: totalIssues,
      issues_by_code: Object.fromEntries(issueCounts),
      health_score: Math.max(
        0,
        100 - Math.round((totalIssues / Math.max(1, items.length)) * 10),
      ),
    };

    await supabaseAdmin
      .from("audits")
      .update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
        pages_count: items.length,
        summary,
      })
      .eq("id", auditId);
  } catch (e) {
    await supabaseAdmin
      .from("audits")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: (e as Error).message.slice(0, 500),
      })
      .eq("id", auditId);
    throw e;
  }
}
