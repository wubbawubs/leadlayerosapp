/**
 * Competitive Intelligence — Business Entity Resolution (Ticket 4).
 *
 * Pure. Decides which SERP rows belong to the client (self-row) vs which
 * belong to competitors, without relying solely on domain equality.
 *
 * Why: local businesses frequently have:
 *  - temporary domains (wordpress.com, lovable.app, vercel.app)
 *  - wrong connected domain
 *  - no ranking footprint yet
 *  - multiple domains
 *  - GBP/brand visibility but no domain visibility
 *
 * Domain is one identity signal, not the truth. This module scores
 * multiple signals and picks an `identityMode` + `identityConfidence`
 * so the self-row always exists, with honest confidence.
 */

export type IdentityMode =
  | "domain_match"
  | "brand_match"
  | "connected_site"
  | "profile_baseline"
  | "unknown_baseline";

export type RankingPresence = "found" | "brand_only" | "not_found";

export interface SelfIdentity {
  displayName: string;
  domain: string | null;
  identityMode: IdentityMode;
  identityConfidence: number; // 0–1
  rankingPresence: RankingPresence;
  identityWarnings: string[];
  matchedSignals: string[];
  /** Domain to use as the self-row aggregate key (may be the temp domain). */
  selfRowDomain: string;
  /** True when the connected domain looks like a temp/placeholder host. */
  temporaryDomain: boolean;
}

export interface SerpRowLike {
  domain?: string | null;
  url?: string | null;
  title?: string | null;
  snippet?: string | null;
  isLocalPack?: boolean;
  localPackName?: string | null;
}

export interface BuildSelfIdentityInput {
  brandName: string | null;
  connectedDomain: string | null; // already host-only, e.g. "klikklaar86.wordpress.com"
  knownDomains?: string[]; // additional domains to treat as self
  serpRows: SerpRowLike[];
}

const PLACEHOLDER_DOMAIN_SUFFIXES = [
  "wordpress.com",
  "webflow.io",
  "wixsite.com",
  "squarespace.com",
  "lovable.app",
  "lovableproject.com",
  "vercel.app",
  "netlify.app",
  "github.io",
  "myshopify.com",
  "weebly.com",
  "blogspot.com",
  "site123.me",
  "carrd.co",
];

const PLACEHOLDER_DOMAIN_KEYWORDS = [
  "localhost",
  "preview",
  "staging",
  "test.",
  ".test",
  "127.0.0.1",
];

export function normalizeDomain(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input).trim().toLowerCase();
  try {
    if (!s.startsWith("http")) s = `https://${s}`;
    const u = new URL(s);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return String(input).toLowerCase().replace(/^www\./, "").split("/")[0] ?? "";
  }
}

export function normalizeBusinessName(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(the|llc|inc|co|company|ltd|gmbh|bv|sa|services|service|group)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectTemporaryOrPlaceholderDomain(
  domain: string | null | undefined,
): boolean {
  const d = normalizeDomain(domain);
  if (!d) return true;
  for (const suffix of PLACEHOLDER_DOMAIN_SUFFIXES) {
    if (d === suffix || d.endsWith(`.${suffix}`)) return true;
  }
  for (const kw of PLACEHOLDER_DOMAIN_KEYWORDS) {
    if (d.includes(kw)) return true;
  }
  return false;
}

export interface EntityMatchResult {
  isMatch: boolean;
  score: number; // 0–1
  reasons: string[];
  matchedSignals: string[];
}

/**
 * Score a single SERP row against the known self identity.
 *
 * Signals:
 *  - exact domain match (strongest)
 *  - root domain match
 *  - brand name in local-pack name (very strong)
 *  - brand name in title
 *  - brand name in snippet
 */
export function scoreBusinessEntityMatch(args: {
  row: SerpRowLike;
  selfDomains: string[];
  brandName: string | null;
}): EntityMatchResult {
  const reasons: string[] = [];
  const matchedSignals: string[] = [];
  let score = 0;

  const rowDomain = normalizeDomain(args.row.domain ?? args.row.url ?? "");
  const selfDomainSet = new Set(args.selfDomains.map(normalizeDomain).filter(Boolean));

  if (rowDomain && selfDomainSet.has(rowDomain)) {
    score = Math.max(score, 1);
    matchedSignals.push("domain_exact");
    reasons.push(`Domain match: ${rowDomain}`);
  } else if (rowDomain) {
    // Root domain (apex) match — e.g. blog.example.com vs example.com
    for (const sd of selfDomainSet) {
      if (!sd) continue;
      if (rowDomain.endsWith(`.${sd}`) || sd.endsWith(`.${rowDomain}`)) {
        score = Math.max(score, 0.85);
        matchedSignals.push("domain_root");
        reasons.push(`Root domain match: ${rowDomain} ~ ${sd}`);
        break;
      }
    }
  }

  const brand = normalizeBusinessName(args.brandName);
  if (brand && brand.length >= 3) {
    const localName = normalizeBusinessName(args.row.localPackName ?? null);
    const title = normalizeBusinessName(args.row.title ?? null);
    const snippet = normalizeBusinessName(args.row.snippet ?? null);

    if (localName && (localName === brand || localName.includes(brand))) {
      score = Math.max(score, 0.9);
      matchedSignals.push("brand_local_pack");
      reasons.push(`Brand match in local pack: "${args.row.localPackName}"`);
    }
    if (title.includes(brand)) {
      score = Math.max(score, 0.75);
      matchedSignals.push("brand_title");
      reasons.push(`Brand match in title`);
    } else if (snippet.includes(brand)) {
      score = Math.max(score, 0.55);
      matchedSignals.push("brand_snippet");
      reasons.push(`Brand match in snippet`);
    }
  }

  return {
    isMatch: score >= 0.5,
    score,
    reasons,
    matchedSignals,
  };
}

/**
 * Decide the self identity for a competitor scan.
 *
 * Modes:
 *  A. domain_match     — connected domain found in SERP
 *  B. brand_match      — brand name found in SERP (domain absent)
 *  C. connected_site   — connected site exists, not in SERP, not temp
 *  D. profile_baseline — temp/missing domain, brand known → use brand
 *  E. unknown_baseline — nothing usable, last-resort fallback
 */
export function buildSelfIdentity(input: BuildSelfIdentityInput): SelfIdentity {
  const connectedDomain = normalizeDomain(input.connectedDomain ?? null);
  const isTemp = connectedDomain
    ? detectTemporaryOrPlaceholderDomain(connectedDomain)
    : true;
  const allKnownDomains = Array.from(
    new Set(
      [connectedDomain, ...(input.knownDomains ?? []).map(normalizeDomain)].filter(
        Boolean,
      ),
    ),
  );

  // Find best SERP match.
  let bestMatch: EntityMatchResult | null = null;
  for (const row of input.serpRows) {
    const r = scoreBusinessEntityMatch({
      row,
      selfDomains: allKnownDomains,
      brandName: input.brandName,
    });
    if (!bestMatch || r.score > bestMatch.score) bestMatch = r;
  }

  const warnings: string[] = [];
  const brandDisplay = (input.brandName ?? "").trim();
  let mode: IdentityMode;
  let confidence: number;
  let rankingPresence: RankingPresence;
  let displayName: string;
  let selfRowDomain: string;
  let matchedSignals: string[] = [];

  const hasDomainSignal =
    bestMatch?.matchedSignals.some((s) => s.startsWith("domain")) ?? false;
  const hasBrandSignal =
    bestMatch?.matchedSignals.some((s) => s.startsWith("brand")) ?? false;

  if (hasDomainSignal && !isTemp) {
    mode = "domain_match";
    confidence = 0.95;
    rankingPresence = "found";
    displayName = brandDisplay || connectedDomain;
    selfRowDomain = connectedDomain;
    matchedSignals = bestMatch?.matchedSignals ?? [];
  } else if (hasBrandSignal) {
    mode = "brand_match";
    confidence = isTemp ? 0.7 : 0.8;
    rankingPresence = "brand_only";
    displayName = brandDisplay || connectedDomain || "Your business";
    selfRowDomain = connectedDomain || normalizeDomain(brandDisplay) || "self";
    matchedSignals = bestMatch?.matchedSignals ?? [];
    if (isTemp) {
      warnings.push(
        "Connected domain appears temporary. Brand was matched in SERP, but ranking attribution is approximate.",
      );
    }
  } else if (connectedDomain && !isTemp) {
    mode = "connected_site";
    confidence = 0.55;
    rankingPresence = "not_found";
    displayName = brandDisplay || connectedDomain;
    selfRowDomain = connectedDomain;
    warnings.push(
      "Connected domain was not visible in the scanned SERPs. Self-row uses connected-site baseline.",
    );
  } else if (brandDisplay) {
    mode = "profile_baseline";
    confidence = isTemp ? 0.4 : 0.45;
    rankingPresence = "not_found";
    displayName = brandDisplay;
    selfRowDomain = connectedDomain || "self";
    warnings.push(
      isTemp
        ? "Connected domain appears temporary. Comparison uses Business Profile baseline rather than ranking presence."
        : "Brand was not found in scanned SERPs. Comparison uses Business Profile baseline.",
    );
  } else {
    mode = "unknown_baseline";
    confidence = 0.2;
    rankingPresence = "not_found";
    displayName = connectedDomain || "Your business";
    selfRowDomain = connectedDomain || "self";
    warnings.push(
      "No business name or stable domain is configured. Self identity confidence is very low.",
    );
  }

  if (isTemp && connectedDomain) {
    warnings.push(
      `Detected temporary host "${connectedDomain}". Set a permanent domain in Site Settings to improve confidence.`,
    );
  }

  return {
    displayName,
    domain: connectedDomain || null,
    identityMode: mode,
    identityConfidence: confidence,
    rankingPresence,
    identityWarnings: warnings,
    matchedSignals,
    selfRowDomain,
    temporaryDomain: isTemp,
  };
}
