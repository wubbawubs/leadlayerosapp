/**
 * Competitive Intelligence — Competitor Type Classifier (Ticket 4b).
 *
 * Pure. Decides whether a SERP / aggregated competitor is actually a
 * direct local business, a directory/aggregator, a franchise, a
 * content/listicle, or unknown.
 *
 * The Blueprint uses this to separate "direct competitors" from
 * "SERP intermediaries" so we don't tell the client that Yelp is
 * their competitor.
 */

export type CompetitorType =
  | "local_business"
  | "directory"
  | "aggregator"
  | "franchise"
  | "content"
  | "unknown";

export interface ClassifyCompetitorInput {
  domain: string;
  url?: string | null;
  title?: string | null;
  snippet?: string | null;
  localPackName?: string | null;
  homepageMarkdown?: string | null;
  /** Optional trust signals already extracted from the homepage. */
  hasTrustSignals?: {
    phone?: boolean;
    address?: boolean;
    emergency?: boolean;
    licensing?: boolean;
  } | null;
}

export interface ClassifyCompetitorResult {
  type: CompetitorType;
  confidence: number; // 0–1
  reasons: string[];
}

const DIRECTORY_DOMAINS = new Set([
  "yelp.com",
  "yellowpages.com",
  "yp.com",
  "angi.com",
  "angieslist.com",
  "homeadvisor.com",
  "thumbtack.com",
  "bbb.org",
  "expertise.com",
  "houzz.com",
  "porch.com",
  "checkatrade.com",
  "trustpilot.com",
  "nextdoor.com",
  "manta.com",
  "superpages.com",
  "citysearch.com",
  "mapquest.com",
  "foursquare.com",
  "tripadvisor.com",
  "facebook.com",
  "linkedin.com",
]);

const AGGREGATOR_DOMAINS = new Set([
  "indeed.com",
  "glassdoor.com",
  "ziprecruiter.com",
  "amazon.com",
  "ebay.com",
  "walmart.com",
  "homedepot.com",
  "lowes.com",
]);

const CONTENT_DOMAINS = new Set([
  "wikipedia.org",
  "reddit.com",
  "quora.com",
  "medium.com",
  "forbes.com",
  "nytimes.com",
  "consumeraffairs.com",
]);

const LISTICLE_PATTERNS: RegExp[] = [
  /\btop\s*\d+\b/i,
  /\bbest\s+\w+.*\bin\b/i,
  /\b\d+\s+best\b/i,
  /\bnear me\b.*\blist\b/i,
  /\breviews?\s+of\b/i,
  /\bcompare\b/i,
  /\bdirectory\b/i,
  /\b(how to|guide|cost|signs|tips|why)\b/i,
];

function rootDomain(d: string): string {
  const parts = d.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

export function classifyCompetitorType(
  input: ClassifyCompetitorInput,
): ClassifyCompetitorResult {
  const reasons: string[] = [];
  const domain = (input.domain ?? "").toLowerCase().replace(/^www\./, "");
  const root = rootDomain(domain);
  const title = input.title ?? "";
  const snippet = input.snippet ?? "";
  const localPackName = (input.localPackName ?? "").trim();

  // A. Known directory / aggregator domains — strongest signal.
  if (DIRECTORY_DOMAINS.has(domain) || DIRECTORY_DOMAINS.has(root)) {
    reasons.push(`Known directory domain: ${root}`);
    return { type: "directory", confidence: 0.98, reasons };
  }
  if (AGGREGATOR_DOMAINS.has(domain) || AGGREGATOR_DOMAINS.has(root)) {
    reasons.push(`Known aggregator domain: ${root}`);
    return { type: "aggregator", confidence: 0.95, reasons };
  }
  if (CONTENT_DOMAINS.has(domain) || CONTENT_DOMAINS.has(root)) {
    reasons.push(`Known content/publisher domain: ${root}`);
    return { type: "content", confidence: 0.95, reasons };
  }

  // B. Listicle / directory-style patterns in title.
  let listicleHits = 0;
  for (const re of LISTICLE_PATTERNS) {
    if (re.test(title) || re.test(snippet)) listicleHits += 1;
  }
  if (listicleHits >= 1 && !localPackName) {
    reasons.push(`Listicle/content pattern detected (${listicleHits} hit${listicleHits === 1 ? "" : "s"}) in title/snippet`);
    return {
      type: listicleHits >= 2 ? "directory" : "content",
      confidence: 0.7 + Math.min(0.2, listicleHits * 0.05),
      reasons,
    };
  }

  // C. Local pack appearance → almost certainly a real local business.
  if (localPackName) {
    reasons.push(`Appears in Google local pack as "${localPackName}"`);
    const ts = input.hasTrustSignals;
    const trustHits = [ts?.phone, ts?.address, ts?.emergency, ts?.licensing].filter(
      Boolean,
    ).length;
    if (trustHits >= 1) {
      reasons.push(`Homepage exposes ${trustHits} trust signal(s)`);
    }
    return { type: "local_business", confidence: 0.9, reasons };
  }

  // D. Franchise heuristic: large brand-style root domain with location-y URL.
  const url = (input.url ?? "").toLowerCase();
  const looksLikeLocationPath = /\/(locations?|stores?|service-area|cities)\//.test(url);
  const corporateBrand = /^(?:[a-z]+)\.com$/i.test(root) && root.length <= 18;
  if (looksLikeLocationPath && corporateBrand) {
    reasons.push("Location-style URL on a short corporate brand domain");
    return { type: "franchise", confidence: 0.65, reasons };
  }

  // E. Trust signals present → treat as local business with medium confidence.
  const ts = input.hasTrustSignals;
  const trustHits = [ts?.phone, ts?.address, ts?.emergency, ts?.licensing].filter(
    Boolean,
  ).length;
  if (trustHits >= 2) {
    reasons.push(`Homepage exposes ${trustHits} trust signals (phone/address/etc.)`);
    return { type: "local_business", confidence: 0.7, reasons };
  }
  if (trustHits === 1) {
    reasons.push("Homepage exposes 1 trust signal");
    return { type: "local_business", confidence: 0.55, reasons };
  }

  reasons.push("No directory match, no listicle pattern, no local-pack or trust evidence");
  return { type: "unknown", confidence: 0.35, reasons };
}

/**
 * Produce a clean display name for a competitor row.
 * Priority: localPackName → cleaned title → root domain.
 * For directory/content types we keep something meaningful but readable.
 */
export function cleanCompetitorDisplayName(input: {
  title?: string | null;
  domain: string;
  localPackName?: string | null;
  type?: CompetitorType;
}): string {
  const lp = (input.localPackName ?? "").trim();
  if (lp) return lp;

  const root = rootDomain(input.domain);
  const title = (input.title ?? "").trim();

  if (!title) return root;

  // Strip common listicle prefixes / pipe-separated suffixes.
  let cleaned = title
    .replace(/^\s*top\s*\d+\s*(best)?\s*/i, "")
    .replace(/^\s*\d+\s+best\s+/i, "Best ")
    .replace(/\s*[|\-–—]\s*(yelp|angi|homeadvisor|bbb|houzz|thumbtack|porch).*$/i, "")
    .replace(/\s*[|\-–—].*$/, "") // drop everything after first separator
    .trim();

  if (!cleaned) cleaned = root;

  // For directory/content rows, prefix with the publisher root to keep
  // it clear that this is a directory, not a business name.
  if (input.type === "directory" || input.type === "aggregator" || input.type === "content") {
    return `${cleaned} (${root})`;
  }
  return cleaned;
}
