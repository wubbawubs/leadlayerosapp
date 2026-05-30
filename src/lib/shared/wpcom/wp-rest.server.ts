/**
 * WordPress REST API helpers (server-only).
 *
 * Two auth paths:
 *   - Self-hosted: Basic auth with username + Application Password
 *   - WordPress.com: Bearer access token from existing OAuth2 flow
 *
 * V1 read caps: MAX_ITEMS total per sync to avoid timeouts on Cloudflare Workers.
 * V1 write caps: createSelfHostedWordpressDraft — draft only, no live publish.
 *   WordPress.com draft creation is NOT supported in V1 (token scope uncertain).
 */

const MAX_ITEMS = 500;
const TIMEOUT_MS = 15_000;
const WPCOM_API = "https://public-api.wordpress.com/rest/v1.1";

// ------------------------------------------------------------------
// URL helpers
// ------------------------------------------------------------------

export function normalizeWordpressBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function getSelfHostedRestBaseUrl(baseUrl: string): string {
  return `${normalizeWordpressBaseUrl(baseUrl)}/wp-json/wp/v2`;
}

// ------------------------------------------------------------------
// Low-level fetch (no secrets logged, timeout enforced)
// ------------------------------------------------------------------

interface FetchResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

async function wpFetch<T>(
  url: string,
  headers: Record<string, string>,
  opts?: { method?: "GET" | "POST"; body?: string },
): Promise<FetchResult<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const method = opts?.method ?? "GET";
    const res = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(opts?.body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: opts?.body,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data };
  } catch (e) {
    clearTimeout(timer);
    const msg = (e as Error).name === "AbortError"
      ? `Timeout after ${TIMEOUT_MS / 1000}s`
      : (e as Error).message;
    return { ok: false, status: 0, error: msg };
  }
}

// ------------------------------------------------------------------
// SEO plugin detection
//
// Calls the public /wp-json root endpoint (no auth required) and inspects
// the namespaces array. Yoast registers "yoast/v1"; Rank Math "rankmath/v1".
// Returns "none" if neither is found or the endpoint is unreachable.
// ------------------------------------------------------------------

export async function detectSeoPlugin(baseUrl: string): Promise<SeoPlugin> {
  const result = await wpFetch<{ namespaces?: string[] }>(
    `${normalizeWordpressBaseUrl(baseUrl)}/wp-json`,
    {},
  );
  if (!result.ok || !Array.isArray(result.data?.namespaces)) return "none";
  const ns = result.data.namespaces;
  if (ns.includes("yoast/v1")) return "yoast";
  if (ns.includes("rankmath/v1")) return "rankmath";
  return "none";
}

// ------------------------------------------------------------------
// Capability result shape
// ------------------------------------------------------------------

export type SeoPlugin = "yoast" | "rankmath" | "none";
export type SeoMetaStatus = "pushed_yoast" | "pushed_rankmath" | "manual_required" | "skipped";

export interface WpCapabilityResult {
  ok: boolean;
  canReadPages: boolean;
  canReadPosts: boolean;
  canCreateDraft: boolean;
  canUploadMedia: boolean;
  canReadTaxonomies: boolean;
  roles: string[];
  wpVersion: string | null;
  seoPlugin: SeoPlugin;
  error?: string;
  httpStatus?: number;
  elapsedMs: number;
}

// ------------------------------------------------------------------
// Self-hosted capability check
// ------------------------------------------------------------------

export async function checkSelfHostedCapabilities(opts: {
  baseUrl: string;
  username: string;
  appPassword: string;
}): Promise<WpCapabilityResult> {
  const start = Date.now();
  const restBase = getSelfHostedRestBaseUrl(opts.baseUrl);
  const auth = "Basic " + btoa(`${opts.username}:${opts.appPassword}`);

  // Run user-auth check and SEO plugin detection in parallel
  const [result, seoPlugin] = await Promise.all([
    wpFetch<{
      id?: number;
      roles?: string[];
      capabilities?: Record<string, boolean>;
    }>(`${restBase}/users/me?context=edit`, { Authorization: auth }),
    detectSeoPlugin(opts.baseUrl),
  ]);

  const elapsed = Date.now() - start;

  if (!result.ok || !result.data) {
    return {
      ok: false,
      canReadPages: false,
      canReadPosts: false,
      canCreateDraft: false,
      canUploadMedia: false,
      canReadTaxonomies: false,
      roles: [],
      wpVersion: null,
      seoPlugin,
      error: result.error ?? "Unknown error",
      httpStatus: result.status,
      elapsedMs: elapsed,
    };
  }

  const caps = result.data.capabilities ?? {};
  const roles = result.data.roles ?? [];
  const isPrivileged = roles.some((r) =>
    r === "administrator" || r === "editor" || r === "author",
  );
  const canDraft = isPrivileged || !!caps["edit_posts"];
  const canMedia = isPrivileged || !!caps["upload_files"];

  return {
    ok: true,
    canReadPages: true,
    canReadPosts: true,
    canCreateDraft: canDraft,
    canUploadMedia: canMedia,
    canReadTaxonomies: true,
    roles,
    wpVersion: null,
    seoPlugin,
    httpStatus: result.status,
    elapsedMs: elapsed,
  };
}

// ------------------------------------------------------------------
// Inventory item shape
// ------------------------------------------------------------------

export interface WpInventoryItem {
  id: number;
  type: string;
  status: string;
  title: string;
  slug: string;
  link: string;
  parent: number;
  template: string;
  modified: string;
}

// ------------------------------------------------------------------
// Self-hosted pages / posts fetcher (paginated)
// ------------------------------------------------------------------

async function fetchSelfHostedPostType(opts: {
  restBase: string;
  auth: string;
  endpoint: "pages" | "posts";
  maxItems: number;
}): Promise<WpInventoryItem[]> {
  const collected: WpInventoryItem[] = [];
  let page = 1;
  const perPage = 100;

  while (collected.length < opts.maxItems) {
    const url =
      `${opts.restBase}/${opts.endpoint}?per_page=${perPage}&page=${page}` +
      `&status=publish,draft,private` +
      `&_fields=id,type,status,title,slug,link,parent,template,modified&context=view`;

    const result = await wpFetch<
      Array<{
        id?: number;
        type?: string;
        status?: string;
        title?: { rendered?: string };
        slug?: string;
        link?: string;
        parent?: number;
        template?: string;
        modified?: string;
      }>
    >(url, { Authorization: opts.auth });

    if (!result.ok || !result.data || result.data.length === 0) break;

    for (const item of result.data) {
      collected.push({
        id: item.id ?? 0,
        type: item.type ?? (opts.endpoint === "pages" ? "page" : "post"),
        status: item.status ?? "publish",
        title: item.title?.rendered ?? item.slug ?? "",
        slug: item.slug ?? "",
        link: item.link ?? "",
        parent: item.parent ?? 0,
        template: item.template ?? "",
        modified: item.modified ?? "",
      });
      if (collected.length >= opts.maxItems) break;
    }

    if (result.data.length < perPage) break;
    page++;
  }

  return collected;
}

export async function fetchSelfHostedPages(opts: {
  baseUrl: string;
  username: string;
  appPassword: string;
  maxItems?: number;
}): Promise<WpInventoryItem[]> {
  const restBase = getSelfHostedRestBaseUrl(opts.baseUrl);
  const auth = "Basic " + btoa(`${opts.username}:${opts.appPassword}`);
  return fetchSelfHostedPostType({
    restBase,
    auth,
    endpoint: "pages",
    maxItems: Math.min(opts.maxItems ?? MAX_ITEMS, MAX_ITEMS),
  });
}

export async function fetchSelfHostedPosts(opts: {
  baseUrl: string;
  username: string;
  appPassword: string;
  maxItems?: number;
}): Promise<WpInventoryItem[]> {
  const restBase = getSelfHostedRestBaseUrl(opts.baseUrl);
  const auth = "Basic " + btoa(`${opts.username}:${opts.appPassword}`);
  return fetchSelfHostedPostType({
    restBase,
    auth,
    endpoint: "posts",
    maxItems: Math.min(opts.maxItems ?? 100, MAX_ITEMS),
  });
}

// ------------------------------------------------------------------
// WordPress.com capability check
// ------------------------------------------------------------------

export async function checkWpcomCapabilities(opts: {
  accessToken: string;
}): Promise<WpCapabilityResult> {
  const start = Date.now();
  const result = await wpFetch<{ ID?: number; display_name?: string }>(
    `${WPCOM_API}/me`,
    { Authorization: `Bearer ${opts.accessToken}` },
  );
  const elapsed = Date.now() - start;

  if (!result.ok || !result.data) {
    return {
      ok: false,
      canReadPages: false,
      canReadPosts: false,
      canCreateDraft: false,
      canUploadMedia: false,
      canReadTaxonomies: false,
      roles: [],
      wpVersion: null,
      seoPlugin: "none",
      error: result.error ?? "WPCOM API error",
      httpStatus: result.status,
      elapsedMs: elapsed,
    };
  }

  return {
    ok: true,
    canReadPages: true,
    canReadPosts: true,
    canCreateDraft: true,
    canUploadMedia: true,
    canReadTaxonomies: true,
    roles: ["wpcom_authenticated"],
    wpVersion: null,
    seoPlugin: "none",
    httpStatus: result.status,
    elapsedMs: elapsed,
  };
}

// ------------------------------------------------------------------
// WordPress.com inventory fetch
// ------------------------------------------------------------------

export async function fetchWpcomInventory(opts: {
  accessToken: string;
  blogId: string;
  maxItems?: number;
}): Promise<WpInventoryItem[]> {
  const collected: WpInventoryItem[] = [];
  const maxPerType = Math.floor(Math.min(opts.maxItems ?? MAX_ITEMS, MAX_ITEMS) / 2);

  for (const postType of ["page", "post"] as const) {
    let offset = 0;
    const number = 100;
    let typeCount = 0;

    while (typeCount < maxPerType) {
      const url =
        `${WPCOM_API}/sites/${opts.blogId}/posts?type=${postType}&number=${number}` +
        `&offset=${offset}&status=any` +
        `&fields=ID,type,status,title,slug,URL,parent,modified`;

      const result = await wpFetch<{
        posts?: Array<{
          ID?: number;
          type?: string;
          status?: string;
          title?: string;
          slug?: string;
          URL?: string;
          parent?: { ID?: number } | number | null;
          modified?: string;
        }>;
      }>(url, { Authorization: `Bearer ${opts.accessToken}` });

      if (!result.ok || !result.data?.posts || result.data.posts.length === 0) break;

      for (const item of result.data.posts) {
        const parentId =
          typeof item.parent === "number"
            ? item.parent
            : item.parent && typeof item.parent === "object"
              ? (item.parent.ID ?? 0)
              : 0;
        collected.push({
          id: item.ID ?? 0,
          type: item.type ?? postType,
          status: item.status ?? "publish",
          title: item.title ?? item.slug ?? "",
          slug: item.slug ?? "",
          link: item.URL ?? "",
          parent: parentId,
          template: "",
          modified: item.modified ?? "",
        });
        typeCount++;
        if (typeCount >= maxPerType) break;
      }

      if (result.data.posts.length < number) break;
      offset += number;
    }
  }

  return collected;
}

// ------------------------------------------------------------------
// Draft creation result shape
// ------------------------------------------------------------------

export interface WpDraftResult {
  ok: boolean;
  wpPostId: number | null;
  wpStatus: string | null;
  wpEditLink: string | null;
  wpPreviewLink: string | null;
  slug: string | null;
  seoMetaStatus: SeoMetaStatus;
  error?: string;
  httpStatus?: number;
  rawResponse: Record<string, unknown>;
}

// ------------------------------------------------------------------
// Self-hosted: create a draft page (status=draft, no live publish)
//
// V2: also attempts to push SEO meta (Yoast / Rank Math) in the same
// POST request. If the plugin-specific meta causes a 400, the draft is
// retried without meta and seoMetaStatus is set to "manual_required".
//
// WordPress.com draft creation is NOT supported (token scope uncertain).
// ------------------------------------------------------------------

export async function createSelfHostedWordpressDraft(opts: {
  baseUrl: string;
  username: string;
  appPassword: string;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  seoPlugin?: SeoPlugin;
}): Promise<WpDraftResult> {
  const restBase = getSelfHostedRestBaseUrl(opts.baseUrl);
  const auth = "Basic " + btoa(`${opts.username}:${opts.appPassword}`);
  const baseUrlClean = opts.baseUrl.replace(/\/+$/, "");

  const hasMeta = !!(opts.metaTitle || opts.metaDescription);
  const plugin = opts.seoPlugin ?? "none";

  // Build SEO meta fields object and derive expected status
  let seoMetaStatus: SeoMetaStatus = hasMeta ? "manual_required" : "skipped";
  const metaFields: Record<string, string> = {};

  if (hasMeta && plugin !== "none") {
    if (plugin === "yoast") {
      if (opts.metaTitle) metaFields["_yoast_wpseo_title"] = opts.metaTitle;
      if (opts.metaDescription) metaFields["_yoast_wpseo_metadesc"] = opts.metaDescription;
      seoMetaStatus = "pushed_yoast";
    } else if (plugin === "rankmath") {
      if (opts.metaTitle) metaFields["rank_math_title"] = opts.metaTitle;
      if (opts.metaDescription) metaFields["rank_math_description"] = opts.metaDescription;
      seoMetaStatus = "pushed_rankmath";
    }
  }

  type DraftBody = {
    title: string;
    slug: string;
    content: string;
    excerpt: string;
    status: "draft";
    type: "page";
    meta?: Record<string, string>;
  };

  const basePayload: DraftBody = {
    title: opts.title,
    slug: opts.slug,
    content: opts.content,
    excerpt: opts.excerpt ?? "",
    status: "draft",
    type: "page",
  };

  const payloadWithMeta: DraftBody =
    Object.keys(metaFields).length > 0
      ? { ...basePayload, meta: metaFields }
      : basePayload;

  function buildResult(
    raw: Record<string, unknown>,
    httpStatus: number,
    resolvedSeoStatus: SeoMetaStatus,
  ): WpDraftResult {
    const postId = typeof raw.id === "number" ? raw.id : null;
    return {
      ok: true,
      wpPostId: postId,
      wpStatus: typeof raw.status === "string" ? raw.status : "draft",
      wpEditLink: postId ? `${baseUrlClean}/wp-admin/post.php?post=${postId}&action=edit` : null,
      wpPreviewLink: postId ? `${baseUrlClean}/?p=${postId}&preview=true` : null,
      slug: typeof raw.slug === "string" ? raw.slug : opts.slug,
      seoMetaStatus: resolvedSeoStatus,
      rawResponse: raw,
      httpStatus,
    };
  }

  // First attempt: with meta (if any)
  const result = await wpFetch<Record<string, unknown>>(
    `${restBase}/pages`,
    { Authorization: auth },
    { method: "POST", body: JSON.stringify(payloadWithMeta) },
  );

  if (result.ok && result.data) {
    return buildResult(result.data, result.status, seoMetaStatus);
  }

  // If the request failed with 400 and we included plugin meta, the meta fields
  // may have been rejected (e.g. plugin not enabled, version too old).
  // Retry without meta — draft creation must not be blocked by SEO plugin state.
  if (result.status === 400 && Object.keys(metaFields).length > 0) {
    const retry = await wpFetch<Record<string, unknown>>(
      `${restBase}/pages`,
      { Authorization: auth },
      { method: "POST", body: JSON.stringify(basePayload) },
    );
    if (retry.ok && retry.data) {
      // Meta push failed — operator must enter manually
      return buildResult(retry.data, retry.status, "manual_required");
    }
    return {
      ok: false,
      wpPostId: null,
      wpStatus: null,
      wpEditLink: null,
      wpPreviewLink: null,
      slug: null,
      seoMetaStatus: "manual_required",
      error: retry.error ?? result.error ?? "WP API error",
      httpStatus: retry.status,
      rawResponse: {},
    };
  }

  return {
    ok: false,
    wpPostId: null,
    wpStatus: null,
    wpEditLink: null,
    wpPreviewLink: null,
    slug: null,
    seoMetaStatus,
    error: result.error ?? "WP API error",
    httpStatus: result.status,
    rawResponse: {},
  };
}

// ------------------------------------------------------------------
// Fetch an existing page with edit context (raw content available).
//
// Self-hosted WordPress only. WP.com not supported.
// ------------------------------------------------------------------

export interface WpPageFetchResult {
  ok: boolean;
  wpPostId: number;
  title: { raw: string; rendered: string } | null;
  content: { raw: string; rendered: string } | null;
  excerpt: { raw: string; rendered: string } | null;
  status: string | null;
  slug: string | null;
  link: string | null;
  meta: Record<string, unknown>;
  error?: string;
  httpStatus?: number;
  rawResponse: Record<string, unknown>;
}

export async function fetchSelfHostedWordpressPage(opts: {
  baseUrl: string;
  username: string;
  appPassword: string;
  wpPostId: number;
}): Promise<WpPageFetchResult> {
  const restBase = getSelfHostedRestBaseUrl(opts.baseUrl);
  const auth = "Basic " + btoa(`${opts.username}:${opts.appPassword}`);

  const result = await wpFetch<Record<string, unknown>>(
    `${restBase}/pages/${opts.wpPostId}?context=edit`,
    { Authorization: auth },
  );

  if (!result.ok || !result.data) {
    return {
      ok: false,
      wpPostId: opts.wpPostId,
      title: null,
      content: null,
      excerpt: null,
      status: null,
      slug: null,
      link: null,
      meta: {},
      error: result.error ?? "WP API error fetching page",
      httpStatus: result.status,
      rawResponse: {},
    };
  }

  const raw = result.data;

  function extractRenderable(field: unknown): { raw: string; rendered: string } | null {
    if (!field || typeof field !== "object") return null;
    const f = field as Record<string, unknown>;
    return {
      raw: typeof f.raw === "string" ? f.raw : "",
      rendered: typeof f.rendered === "string" ? f.rendered : "",
    };
  }

  return {
    ok: true,
    wpPostId: opts.wpPostId,
    title: extractRenderable(raw.title),
    content: extractRenderable(raw.content),
    excerpt: extractRenderable(raw.excerpt),
    status: typeof raw.status === "string" ? raw.status : null,
    slug: typeof raw.slug === "string" ? raw.slug : null,
    link: typeof raw.link === "string" ? raw.link : null,
    meta: (raw.meta && typeof raw.meta === "object" ? raw.meta : {}) as Record<string, unknown>,
    httpStatus: result.status,
    rawResponse: raw,
  };
}

// ------------------------------------------------------------------
// Update (PATCH) an existing page — approved fields only.
//
// Only sends explicitly provided fields. Does NOT touch status/publish.
// Self-hosted WordPress only. WP.com not supported.
// ------------------------------------------------------------------

export interface WpPageUpdatePatch {
  title?: string;
  content?: string;
  excerpt?: string;
  meta?: Record<string, string>;
}

export interface WpPageUpdateResult {
  ok: boolean;
  wpPostId: number;
  wpStatus: string | null;
  link: string | null;
  error?: string;
  httpStatus?: number;
  rawResponse: Record<string, unknown>;
}

export async function updateSelfHostedWordpressPage(opts: {
  baseUrl: string;
  username: string;
  appPassword: string;
  wpPostId: number;
  patch: WpPageUpdatePatch;
}): Promise<WpPageUpdateResult> {
  const restBase = getSelfHostedRestBaseUrl(opts.baseUrl);
  const auth = "Basic " + btoa(`${opts.username}:${opts.appPassword}`);

  const body: Record<string, unknown> = {};
  if (opts.patch.title !== undefined) body.title = opts.patch.title;
  if (opts.patch.content !== undefined) body.content = opts.patch.content;
  if (opts.patch.excerpt !== undefined) body.excerpt = opts.patch.excerpt;
  if (opts.patch.meta && Object.keys(opts.patch.meta).length > 0) body.meta = opts.patch.meta;

  if (Object.keys(body).length === 0) {
    return {
      ok: false,
      wpPostId: opts.wpPostId,
      wpStatus: null,
      link: null,
      error: "No patch fields provided",
      httpStatus: 0,
      rawResponse: {},
    };
  }

  const result = await wpFetch<Record<string, unknown>>(
    `${restBase}/pages/${opts.wpPostId}`,
    { Authorization: auth },
    { method: "POST", body: JSON.stringify(body) },
  );

  if (!result.ok || !result.data) {
    return {
      ok: false,
      wpPostId: opts.wpPostId,
      wpStatus: null,
      link: null,
      error: result.error ?? "WP API error on page update",
      httpStatus: result.status,
      rawResponse: {},
    };
  }

  const raw = result.data;
  return {
    ok: true,
    wpPostId: opts.wpPostId,
    wpStatus: typeof raw.status === "string" ? raw.status : null,
    link: typeof raw.link === "string" ? raw.link : null,
    httpStatus: result.status,
    rawResponse: raw,
  };
}

// ------------------------------------------------------------------
// Publish an existing draft — PATCH status to "publish".
//
// V2C: operator-confirmed only. Never called automatically.
// Self-hosted WordPress only (WordPress.com unsupported).
// The WP REST API accepts POST /pages/{id} for updates.
// ------------------------------------------------------------------

export interface WpPublishResult {
  ok: boolean;
  wpPostId: number;
  wpStatus: string | null;
  publishedUrl: string | null;
  error?: string;
  httpStatus?: number;
  rawResponse: Record<string, unknown>;
}

export async function publishSelfHostedWordpressDraft(opts: {
  baseUrl: string;
  username: string;
  appPassword: string;
  wpPostId: number;
}): Promise<WpPublishResult> {
  const restBase = getSelfHostedRestBaseUrl(opts.baseUrl);
  const auth = "Basic " + btoa(`${opts.username}:${opts.appPassword}`);

  const result = await wpFetch<Record<string, unknown>>(
    `${restBase}/pages/${opts.wpPostId}`,
    { Authorization: auth },
    { method: "POST", body: JSON.stringify({ status: "publish" }) },
  );

  if (!result.ok || !result.data) {
    return {
      ok: false,
      wpPostId: opts.wpPostId,
      wpStatus: null,
      publishedUrl: null,
      error: result.error ?? "WP API error on publish",
      httpStatus: result.status,
      rawResponse: {},
    };
  }

  const raw = result.data;
  return {
    ok: true,
    wpPostId: opts.wpPostId,
    wpStatus: typeof raw.status === "string" ? raw.status : null,
    publishedUrl: typeof raw.link === "string" ? raw.link : null,
    httpStatus: result.status,
    rawResponse: raw,
  };
}
