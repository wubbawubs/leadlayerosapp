/**
 * Worker-safe HTML extraction for SEO audit.
 * Uses regex (no DOM, no cheerio) so it runs in Cloudflare Workers.
 * Good enough for v1: title, meta description, first h1, images without alt,
 * link counts (internal/external), JSON-LD schema blocks, rough word count.
 */

export interface ExtractedPage {
  title: string | null;
  meta_description: string | null;
  h1: string | null;
  schema: unknown[] | null;
  images_total: number;
  images_without_alt: number;
  internal_links_count: number;
  external_links_count: number;
  word_count: number;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const m = tag.match(re);
  if (!m) return null;
  return decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
}

function safeHost(u: string): string | null {
  try {
    return new URL(u).host.toLowerCase();
  } catch {
    return null;
  }
}

export function extract(html: string, pageUrl: string): ExtractedPage {
  const pageHost = safeHost(pageUrl);

  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(stripTags(titleMatch[1])) : null;

  // Meta description (also og:description as fallback)
  let meta_description: string | null = null;
  const metaRe = /<meta\b[^>]*>/gi;
  for (const m of html.matchAll(metaRe)) {
    const tag = m[0];
    const name = attr(tag, "name")?.toLowerCase();
    const prop = attr(tag, "property")?.toLowerCase();
    if (name === "description" || prop === "og:description") {
      const c = attr(tag, "content");
      if (c) {
        meta_description = c;
        if (name === "description") break;
      }
    }
  }

  // First H1
  const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = h1Match ? decodeEntities(stripTags(h1Match[1])).slice(0, 500) : null;

  // Images
  let images_total = 0;
  let images_without_alt = 0;
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    images_total++;
    const a = attr(m[0], "alt");
    if (a === null || a.trim() === "") images_without_alt++;
  }

  // Links
  let internal = 0;
  let external = 0;
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)[^>]*>/gi)) {
    const href = attr(m[0], "href");
    if (!href) continue;
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    if (href.startsWith("/")) { internal++; continue; }
    const host = safeHost(href);
    if (!host) continue;
    if (pageHost && host === pageHost) internal++;
    else external++;
  }

  // JSON-LD schema
  const schema: unknown[] = [];
  for (const m of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      schema.push(JSON.parse(m[1].trim()));
    } catch {
      // skip invalid
    }
  }

  // Rough word count of body text
  const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i);
  const bodyText = stripTags(bodyMatch ? bodyMatch[0] : html);
  const word_count = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;

  return {
    title,
    meta_description,
    h1,
    schema: schema.length ? schema : null,
    images_total,
    images_without_alt,
    internal_links_count: internal,
    external_links_count: external,
    word_count,
  };
}

export interface PageIssue {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
}

export function detectIssues(p: ExtractedPage, statusCode: number | null): PageIssue[] {
  const issues: PageIssue[] = [];
  if (statusCode && statusCode >= 400) {
    issues.push({ code: "http_error", severity: "high", message: `HTTP ${statusCode}` });
    return issues;
  }
  if (!p.title) issues.push({ code: "missing_title", severity: "high", message: "Missing <title>" });
  else if (p.title.length < 20) issues.push({ code: "short_title", severity: "medium", message: `Title is ${p.title.length} chars (aim for 30-60)` });
  else if (p.title.length > 65) issues.push({ code: "long_title", severity: "low", message: `Title is ${p.title.length} chars (aim for 30-60)` });

  if (!p.meta_description) issues.push({ code: "missing_meta", severity: "high", message: "Missing meta description" });
  else if (p.meta_description.length < 70) issues.push({ code: "short_meta", severity: "low", message: `Meta description is ${p.meta_description.length} chars (aim for 120-160)` });
  else if (p.meta_description.length > 170) issues.push({ code: "long_meta", severity: "low", message: `Meta description is ${p.meta_description.length} chars (aim for 120-160)` });

  if (!p.h1) issues.push({ code: "missing_h1", severity: "high", message: "Missing H1" });
  if (p.images_without_alt > 0)
    issues.push({ code: "images_no_alt", severity: "medium", message: `${p.images_without_alt} image(s) without alt text` });
  if (!p.schema || p.schema.length === 0)
    issues.push({ code: "no_schema", severity: "low", message: "No JSON-LD schema found" });
  if (p.word_count < 200)
    issues.push({ code: "thin_content", severity: "medium", message: `Only ${p.word_count} words (thin content)` });

  return issues;
}
