/**
 * Competitive Intelligence — Page depth classifier.
 *
 * Pure. Given a list of URLs (e.g. from Firecrawl map) plus the operator's
 * services and locations, count how many URLs look like service pages and
 * how many look like location pages. Deterministic.
 */

function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensFromList(items: string[]): string[] {
  const out = new Set<string>();
  for (const it of items) {
    if (!it) continue;
    const cityPart = it.split(",")[0] ?? it;
    const norm = normalizeToken(cityPart);
    if (!norm) continue;
    // Whole phrase
    out.add(norm.replace(/\s+/g, "-"));
    out.add(norm.replace(/\s+/g, ""));
    // First token (helps "Plano, TX" → "plano")
    const first = norm.split(" ")[0];
    if (first) out.add(first);
  }
  return Array.from(out).filter((t) => t.length >= 3);
}

function urlContainsToken(url: string, tokens: string[]): boolean {
  const u = url.toLowerCase();
  return tokens.some((t) => u.includes(t));
}

export interface PageDepthResult {
  servicePagesCount: number;
  locationPagesCount: number;
  servicePagesSample: string[];
  locationPagesSample: string[];
}

export function classifyMapUrls(
  urls: string[],
  services: string[],
  locations: string[],
): PageDepthResult {
  const serviceTokens = tokensFromList(services);
  const locationTokens = tokensFromList(locations);

  const servicePages: string[] = [];
  const locationPages: string[] = [];

  const seen = new Set<string>();
  for (const raw of urls ?? []) {
    if (!raw) continue;
    const u = raw.trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);

    const isService = urlContainsToken(u, serviceTokens);
    const isLocation = urlContainsToken(u, locationTokens);

    if (isService) servicePages.push(u);
    if (isLocation) locationPages.push(u);
  }

  return {
    servicePagesCount: servicePages.length,
    locationPagesCount: locationPages.length,
    servicePagesSample: servicePages.slice(0, 5),
    locationPagesSample: locationPages.slice(0, 5),
  };
}
