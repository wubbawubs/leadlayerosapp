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
// Capability result shape
// ------------------------------------------------------------------

export interface WpCapabilityResult {
  ok: boolean;
  canReadPages: boolean;
  canReadPosts: boolean;
  canCreateDraft: boolean;
  canUploadMedia: boolean;
  canReadTaxonomies: boolean;
  roles: string[];
  wpVersion: string | null;
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

  const result = await wpFetch<{
    id?: number;
    roles?: string[];
    capabilities?: Record<string, boolean>;
  }>(`${restBase}/users/me?context=edit`, { Authorization: auth });

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
  error?: string;
  httpStatus?: number;
  rawResponse: Record<string, unknown>;
}

// ------------------------------------------------------------------
// Self-hosted: create a draft page (status=draft, no live publish)
//
// V1 scope: self-hosted WordPress only.
// WordPress.com draft creation is NOT supported in V1:
//   The WPCOM REST v1.1 posts endpoint requires a different payload shape
//   and the OAuth token scope granted via the current flow may not include
//   write access to posts. Mark unsupported until explicitly tested and scoped.
// ------------------------------------------------------------------

export async function createSelfHostedWordpressDraft(opts: {
  baseUrl: string;
  username: string;
  appPassword: string;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
}): Promise<WpDraftResult> {
  const restBase = getSelfHostedRestBaseUrl(opts.baseUrl);
  const auth = "Basic " + btoa(`${opts.username}:${opts.appPassword}`);

  const body = JSON.stringify({
    title: opts.title,
    slug: opts.slug,
    content: opts.content,
    excerpt: opts.excerpt ?? "",
    status: "draft",
    type: "page",
  });

  const result = await wpFetch<{
    id?: number;
    status?: string;
    slug?: string;
    link?: string;
  }>(
    `${restBase}/pages`,
    { Authorization: auth },
    { method: "POST", body },
  );

  if (!result.ok || !result.data) {
    return {
      ok: false,
      wpPostId: null,
      wpStatus: null,
      wpEditLink: null,
      wpPreviewLink: null,
      slug: null,
      error: result.error ?? "WP API error",
      httpStatus: result.status,
      rawResponse: {},
    };
  }

  const raw = result.data;
  const postId = typeof raw.id === "number" ? raw.id : null;
  const baseUrlClean = opts.baseUrl.replace(/\/+$/, "");
  const wpEditLink = postId
    ? `${baseUrlClean}/wp-admin/post.php?post=${postId}&action=edit`
    : null;
  const wpPreviewLink = postId
    ? `${baseUrlClean}/?p=${postId}&preview=true`
    : null;

  return {
    ok: true,
    wpPostId: postId,
    wpStatus: raw.status ?? "draft",
    wpEditLink,
    wpPreviewLink,
    slug: raw.slug ?? opts.slug,
    rawResponse: raw as Record<string, unknown>,
    httpStatus: result.status,
  };
}
