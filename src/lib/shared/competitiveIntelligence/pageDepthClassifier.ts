/**
 * Competitive Intelligence — Page depth classifier (Phase B / Ticket 4c-B3 + B2 polish).
 *
 * Pure. Given a list of URLs (e.g. from Firecrawl map) plus the operator's
 * services and locations, count how many URLs look like service pages and
 * how many look like location pages.
 *
 * Phase B2 polish:
 *  - Strict exclusion list (blog / product / careers / etc.) — those URLs
 *    never count as service or location pages. They are tallied as
 *    contentPagesCount instead, and surfaced via excludedCandidateCount so
 *    the scorer can degrade confidence when noise dominates.
 *  - Path-segment boundary matching (instead of substring includes) so
 *    "dallas" doesn't fire on "/dallas-news-article-xyz".
 *  - Homepage ("/") never counts as a location page.
 *  - Confidence labels (`high` | `medium` | `low`) so the score can give
 *    partial credit for noisy classifier output.
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

const GENERIC_SERVICE_SLUGS = [
  "/services/", "/services$", "/our-services", "/what-we-do",
];

const GENERIC_LOCATION_SLUGS = [
  "/service-area", "/service-areas", "/areas-we-serve", "/areas-served",
  "/locations/", "/locations$", "/cities/", "/coverage-area",
];

/**
 * Path patterns that disqualify a URL from being counted as a service or
 * location page. Matched as substrings on the path.
 */
const EXCLUDED_PATH_PATTERNS = [
  "/blog/", "/blog$",
  "/news/", "/news$",
  "/article/", "/articles/",
  "/resources/", "/resource/",
  "/guide/", "/guides/",
  "/tips/", "/tip/",
  "/faq/", "/faqs/",
  "/career/", "/careers/", "/jobs/", "/job/",
  "/product/", "/products/",
  "/shop/", "/cart/", "/checkout/",
  "/tag/", "/tags/",
  "/category/", "/categories/",
  "/author/", "/authors/",
  "/privacy", "/terms", "/cookie",
  "/wp-", "/feed", "/rss",
  "/about-us/careers", "/about/careers",
];

function getPath(u: string): string {
  try {
    return new URL(u).pathname.toLowerCase().replace(/\/+$/, "/") || "/";
  } catch {
    const lower = u.toLowerCase();
    const stripped = lower.replace(/^https?:\/\/[^/]+/, "");
    return stripped || "/";
  }
}

function isExcludedPath(path: string): boolean {
  for (const p of EXCLUDED_PATH_PATTERNS) {
    if (p.endsWith("$")) {
      const t = p.slice(0, -1);
      if (path === t || path === t + "/") return true;
    } else if (path.includes(p)) {
      return true;
    }
  }
  return false;
}

function buildServicePatterns(services: string[]): { needles: string[]; reasonByNeedle: Map<string, string> } {
  const reasonByNeedle = new Map<string, string>();
  const needles = new Set<string>();
  for (const raw of services) {
    const key = normalizeToken(raw);
    if (!key) continue;
    const declared = key.replace(/\s+/g, "-");
    needles.add(declared);
    reasonByNeedle.set(declared, `declared service: ${raw}`);
    const collapsed = key.replace(/\s+/g, "");
    needles.add(collapsed);
    reasonByNeedle.set(collapsed, `declared service: ${raw}`);
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

function buildLocationPatterns(locations: string[]): { needles: string[]; reasonByNeedle: Map<string, string>; cityTokens: Set<string> } {
  const reasonByNeedle = new Map<string, string>();
  const needles = new Set<string>();
  const cityTokens = new Set<string>();
  for (const raw of locations) {
    if (!raw) continue;
    const city = (raw.split(",")[0] ?? raw).trim();
    const tokens = tokensFromList([city]);
    for (const t of tokens) {
      needles.add(t);
      reasonByNeedle.set(t, `city token: ${city}`);
      cityTokens.add(t);
    }
  }
  for (const g of GENERIC_LOCATION_SLUGS) {
    needles.add(g);
    reasonByNeedle.set(g, "service-area path");
  }
  return { needles: Array.from(needles), reasonByNeedle, cityTokens };
}

/**
 * Path-segment aware match: only fires when the needle appears as a path
 * segment (delimited by `/` or `-`) — prevents `dallas` matching inside
 * `/dallas-news-article`. Slug-style needles starting with `/` are matched
 * as substrings of the path (after exclusion filter).
 */
function findMatchOnPath(
  path: string,
  needles: string[],
  reasonByNeedle: Map<string, string>,
): string | null {
  for (const n of needles) {
    if (!n) continue;
    if (n.endsWith("$")) {
      const trimmed = n.slice(0, -1);
      if (path === trimmed || path === trimmed + "/") {
        return reasonByNeedle.get(n) ?? n;
      }
      continue;
    }
    if (n.startsWith("/")) {
      if (path.includes(n)) return reasonByNeedle.get(n) ?? n;
      continue;
    }
    // Token needle — require path-segment boundary.
    // Match /<n>/ or /<n>$ or /<n>-... or .../-<n>/...
    const re = new RegExp(`(?:^|[/-])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[/-])`);
    if (re.test(path)) return reasonByNeedle.get(n) ?? n;
  }
  return null;
}

export interface PageSample {
  url: string;
  matchedReason: string;
}

export type ClassifierConfidence = "high" | "medium" | "low";

export interface PageDepthResult {
  servicePagesCount: number;
  locationPagesCount: number;
  /** Backwards-compat: kept as `string[]` so existing DB columns keep working. */
  servicePagesSample: string[];
  locationPagesSample: string[];
  /** Phase B: structured samples with reasons. */
  servicePageDetails: PageSample[];
  locationPageDetails: PageSample[];
  /** Phase B2: noise / content tracking. */
  contentPagesCount: number;
  excludedCandidateCount: number;
  servicePagesConfidence: ClassifierConfidence;
  locationPagesConfidence: ClassifierConfidence;
  classifierWarnings: string[];
  warnings: string[];
  totalUrlsConsidered: number;
}

const MAP_LIMITED_THRESHOLD = 8;

function pickConfidence(
  matched: number,
  excluded: number,
  total: number,
  mapLimited: boolean,
): ClassifierConfidence {
  if (matched === 0) return "high"; // 0 is definitive, no inflation risk
  const noiseRatio = excluded / Math.max(1, matched + excluded);
  if (noiseRatio > 0.5) return "low";
  if (mapLimited) return "medium";
  if (matched > 25) return "medium"; // suspiciously high — flag for validation
  return "high";
}

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
  let contentPagesCount = 0;
  let excludedCandidateCount = 0;

  for (const raw of urls ?? []) {
    if (!raw) continue;
    const u = raw.trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);

    const path = getPath(u);

    if (isExcludedPath(path)) {
      // Would-it-have-matched? Track as excluded candidate when the URL
      // contains any service or city token; otherwise just content noise.
      const svcReason = findMatchOnPath(path, svc.needles, svc.reasonByNeedle);
      const locReason = findMatchOnPath(path, loc.needles, loc.reasonByNeedle);
      if (svcReason || locReason) {
        excludedCandidateCount++;
      } else {
        contentPagesCount++;
      }
      continue;
    }

    const svcReason = findMatchOnPath(path, svc.needles, svc.reasonByNeedle);
    let locReason = findMatchOnPath(path, loc.needles, loc.reasonByNeedle);

    // Homepage is never a location page — common false positive when the
    // root URL is the only thing returned by a limited crawl.
    if (locReason && (path === "/" || path === "")) locReason = null;

    if (svcReason) servicePages.push({ url: u, matchedReason: svcReason });
    if (locReason) locationPages.push({ url: u, matchedReason: locReason });
  }

  const warnings: string[] = [];
  const total = seen.size;
  const mapLimited = total < MAP_LIMITED_THRESHOLD;
  if (mapLimited) warnings.push("firecrawl_map_limited");

  const servicePagesConfidence = pickConfidence(
    servicePages.length,
    excludedCandidateCount,
    total,
    mapLimited,
  );
  const locationPagesConfidence = pickConfidence(
    locationPages.length,
    excludedCandidateCount,
    total,
    mapLimited,
  );

  const classifierWarnings: string[] = [];
  if (
    excludedCandidateCount > 0 &&
    excludedCandidateCount >= servicePages.length + locationPages.length
  ) {
    classifierWarnings.push("classifier_noise_detected");
  }
  if (locationPages.length > 20) {
    classifierWarnings.push("location_count_needs_validation");
  }

  return {
    servicePagesCount: servicePages.length,
    locationPagesCount: locationPages.length,
    servicePagesSample: servicePages.slice(0, 5).map((p) => p.url),
    locationPagesSample: locationPages.slice(0, 5).map((p) => p.url),
    servicePageDetails: servicePages.slice(0, 5),
    locationPageDetails: locationPages.slice(0, 5),
    contentPagesCount,
    excludedCandidateCount,
    servicePagesConfidence,
    locationPagesConfidence,
    classifierWarnings,
    warnings,
    totalUrlsConsidered: total,
  };
}
