/**
 * Firecrawl wrapper (Ticket 4) — server-only.
 *
 * Best-effort competitor signal collection. Every call is wrapped to fail
 * soft so a single competitor failure cannot break the whole scan.
 *
 * Configuration: requires FIRECRAWL_API_KEY env var. The SDK picks it up
 * automatically. If it is missing, helpers return clear configuration errors
 * without throwing.
 */

import Firecrawl from "@mendable/firecrawl-js";

export function isFirecrawlConfigured(): boolean {
  return !!process.env.FIRECRAWL_API_KEY;
}

export function firecrawlConfigurationError(): string {
  return "Firecrawl is not configured. Add FIRECRAWL_API_KEY to enable Competitive Intelligence.";
}

let _client: Firecrawl | null = null;
function getClient(): Firecrawl {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error(firecrawlConfigurationError());
  if (!_client) _client = new Firecrawl({ apiKey: key });
  return _client;
}

export interface MapDomainResult {
  ok: boolean;
  urls: string[];
  error?: string;
}

export async function mapDomain(
  domain: string,
  opts?: { limit?: number },
): Promise<MapDomainResult> {
  try {
    const url = `https://${domain.replace(/^https?:\/\//, "")}`;
    const fc = getClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await fc.map(url, {
      limit: opts?.limit ?? 200,
      includeSubdomains: false,
    });
    const links: string[] = Array.isArray(res?.links)
      ? res.links
      : Array.isArray(res?.data?.links)
        ? res.data.links
        : [];
    return { ok: true, urls: links.filter((l) => typeof l === "string") };
  } catch (err) {
    return {
      ok: false,
      urls: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface ScrapeHomepageResult {
  ok: boolean;
  markdown: string | null;
  links: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw?: Record<string, any>;
  error?: string;
}

export async function scrapeHomepage(
  domain: string,
): Promise<ScrapeHomepageResult> {
  try {
    const url = `https://${domain.replace(/^https?:\/\//, "")}`;
    const fc = getClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await fc.scrape(url, {
      formats: ["markdown", "links"],
      onlyMainContent: false,
    });
    const markdown: string | null =
      typeof res?.markdown === "string"
        ? res.markdown
        : typeof res?.data?.markdown === "string"
          ? res.data.markdown
          : null;
    const links: string[] = Array.isArray(res?.links)
      ? res.links
      : Array.isArray(res?.data?.links)
        ? res.data.links
        : [];
    return {
      ok: true,
      markdown,
      links: links.filter((l) => typeof l === "string"),
      raw: res,
    };
  } catch (err) {
    return {
      ok: false,
      markdown: null,
      links: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
