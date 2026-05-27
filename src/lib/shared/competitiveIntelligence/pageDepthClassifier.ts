/**
 * Competitive Intelligence — Page depth classifier (Phase B / Ticket 4c-B3).
 *
 * Pure. Given a list of URLs (e.g. from Firecrawl map) plus the operator's
 * services and locations, count how many URLs look like service pages and
 * how many look like location pages.
 *
 * Phase B improvements:
 *  - Fuzzy synonyms for HVAC + general home-service verticals so generic
 *    competitor sites (which won't slugify exactly to "ac repair") are still
 *    recognised.
 *  - "Service-area" location patterns (`/service-area`, `/areas-we-serve`,
 *    `/locations/...`) are recognised even when the city slug is absent.
 *  - Returns `warnings` for callers (e.g. firecrawl_map_limited) so the
 *    confidence scorer can degrade gracefully instead of treating an empty
 *    crawl as confirmed absence.
 *  - Each sample carries a `matchedReason` so the UI can explain WHY a URL
 *    counted as a service / location page.
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
    out.add(norm.replace(/\s+/g, "-"));
    out.add(norm.replace(/\s+/g, ""));
    const first = norm.split(" ")[0];
    if (first) out.add(first);
  }
  return Array.from(out).filter((t) => t.length >= 3);
}

/**
 * Service synonyms — keyed off the user's declared services but extended with
 * common HVAC / home-service vocabulary so any of these slugs count when
 * the user has at least one matching vertical declared.
 */
const SERVICE_SYNONYMS: Record<string, string[]> = {
  "ac repair": [
    "ac-repair", "acrepair", "air-conditioning-repair", "air-conditioner-repair",
    "cooling-repair", "cooling", "ac-service", "ac-services",
  ],
  "air conditioning installation": [
    "ac-installation", "ac-install", "air-conditioning-installation",
    "air-conditioning-install", "new-ac", "ac-replacement",
  ],
  "hvac maintenance": [
    "maintenance-plan", "maintenance-plans", "tune-up", "tuneup",
    "hvac-maintenance", "hvac-tune-up", "service-plan",
  ],
  "emergency hvac repair": [
    "emergency-hvac", "emergency-ac", "emergency-repair", "24-hour",
    "24-7", "24hr", "after-hours",
  ],
  "heating repair": [
    "heating-repair", "heater-repair", "furnace-repair", "furnace",
    "heating-service",
  ],
  "hvac repair": [
    "hvac-repair", "hvac-services", "hvac-service", "heating-and-cooling",
  ],
};

/** Generic service slugs that *always* count as a service page when present. */
const GENERIC_SERVICE_SLUGS = [
  "/services/", "/services$", "/our-services", "/what-we-do",
];

/** Location-page slugs that count even without an explicit city token. */
const GENERIC_LOCATION_SLUGS = [
  "/service-area", "/service-areas", "/areas-we-serve", "/areas-served",
  "/locations/", "/locations$", "/cities/", "/coverage-area",
];

function buildServicePatterns(services: string[]): { needles: string[]; reasonByNeedle: Map<string, string> } {
  const reasonByNeedle = new Map<string, string>();
  const needles = new Set<string>();
  for (const raw of services) {
    const key = normalizeToken(raw);
    if (!key) continue;
    // declared service itself
    const declared = key.replace(/\s+/g, "-");
    needles.add(declared);
    reasonByNeedle.set(declared, `declared service: ${raw}`);
    const collapsed = key.replace(/\s+/g, "");
    needles.add(collapsed);
    reasonByNeedle.set(collapsed, `declared service: ${raw}`);
    // synonyms
    const syns = SERVICE_SYNONYMS[key];
    if (syns) {
      for (const s of syns) {
        needles.add(s);
        reasonByNeedle.set(s, `synonym for "${raw}"`);
      }
    }
  }
  for (const g of GENERIC_SERVICE_SLUGS) {
    needles.add(g);
    reasonByNeedle.set(g, "generic /services/ path");
  }
  return { needles: Array.from(needles), reasonByNeedle };
}

function buildLocationPatterns(locations: string[]): { needles: string[]; reasonByNeedle: Map<string, string> } {
  const reasonByNeedle = new Map<string, string>();
  const needles = new Set<string>();
  for (const raw of locations) {
    if (!raw) continue;
    const city = (raw.split(",")[0] ?? raw).trim();
    const tokens = tokensFromList([city]);
    for (const t of tokens) {
      needles.add(t);
      reasonByNeedle.set(t, `city token: ${city}`);
    }
  }
  for (const g of GENERIC_LOCATION_SLUGS) {
    needles.add(g);
    reasonByNeedle.set(g, "service-area path");
  }
  return { needles: Array.from(needles), reasonByNeedle };
}

function findMatch(
  url: string,
  needles: string[],
  reasonByNeedle: Map<string, string>,
): string | null {
  const u = url.toLowerCase();
  for (const n of needles) {
    if (!n) continue;
    // Support trailing-$ end-of-path needles like "/services$"
    if (n.endsWith("$")) {
      const trimmed = n.slice(0, -1);
      if (u.endsWith(trimmed) || u.endsWith(trimmed + "/")) {
        return reasonByNeedle.get(n) ?? n;
      }
      continue;
    }
    if (u.includes(n)) return reasonByNeedle.get(n) ?? n;
  }
  return null;
}

export interface PageSample {
  url: string;
  matchedReason: string;
}

export interface PageDepthResult {
  servicePagesCount: number;
  locationPagesCount: number;
  /** Backwards-compat: kept as `string[]` so existing DB columns keep working. */
  servicePagesSample: string[];
  locationPagesSample: string[];
  /** Phase B: structured samples with reasons (consumed via score_breakdown). */
  servicePageDetails: PageSample[];
  locationPageDetails: PageSample[];
  warnings: string[];
  totalUrlsConsidered: number;
}

const MAP_LIMITED_THRESHOLD = 8;

export function classifyMapUrls(
  urls: string[],
  services: string[],
  locations: string[],
): PageDepthResult {
  const svc = buildServicePatterns(services);
  const loc = buildLocationPatterns(locations);

  const seen = new Set<string>();
  const servicePages: PageSample[] = [];
  const locationPages: PageSample[] = [];

  for (const raw of urls ?? []) {
    if (!raw) continue;
    const u = raw.trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);

    const svcReason = findMatch(u, svc.needles, svc.reasonByNeedle);
    const locReason = findMatch(u, loc.needles, loc.reasonByNeedle);
    if (svcReason) servicePages.push({ url: u, matchedReason: svcReason });
    if (locReason) locationPages.push({ url: u, matchedReason: locReason });
  }

  const warnings: string[] = [];
  const total = seen.size;
  if (total < MAP_LIMITED_THRESHOLD) {
    warnings.push("firecrawl_map_limited");
  }

  return {
    servicePagesCount: servicePages.length,
    locationPagesCount: locationPages.length,
    servicePagesSample: servicePages.slice(0, 5).map((p) => p.url),
    locationPagesSample: locationPages.slice(0, 5).map((p) => p.url),
    servicePageDetails: servicePages.slice(0, 5),
    locationPageDetails: locationPages.slice(0, 5),
    warnings,
    totalUrlsConsidered: total,
  };
}
