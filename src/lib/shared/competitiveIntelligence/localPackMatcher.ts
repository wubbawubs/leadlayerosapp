/**
 * Competitive Intelligence — Local Pack ↔ Competitor matcher (Phase B / Ticket 4c-B1).
 *
 * Pure. Given a candidate competitor (aggregated from organic SERP rows) and
 * the local-pack items captured in the same scan, decide whether any local
 * pack entry actually refers to the same business — without inventing data.
 *
 * Why: DataForSEO's local pack often returns no `website` (so domain match
 * fails), but the business is clearly the same as an organic row. We score
 * normalized business name similarity + domain root match + city/address
 * overlap + service-context overlap. Below a confidence threshold we keep
 * `matched=false` and leave reviews/rating UNKNOWN. Never attach review
 * counts when the match is weak.
 */
import { normalizeBusinessName, normalizeDomain } from "./entityResolution";

export interface LocalPackItem {
  name: string | null;
  domain: string | null;
  url: string | null;
  rating: number | null;
  reviewCount: number | null;
  category: string | null;
  address: string | null;
}

export interface CompetitorCandidate {
  domain: string;
  title?: string | null;
  snippet?: string | null;
  url?: string | null;
}

export interface LocalPackMatchResult {
  matched: boolean;
  matchConfidence: number; // 0..1
  matchedSignals: string[];
  gbpName?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  category?: string | null;
  address?: string | null;
  website?: string | null;
}

function rootDomain(d: string | null | undefined): string {
  const n = normalizeDomain(d ?? "");
  const parts = n.split(".");
  if (parts.length <= 2) return n;
  return parts.slice(-2).join(".");
}

/** Token-set Jaccard similarity on normalized business names. */
function nameSimilarity(a: string, b: string): number {
  const na = normalizeBusinessName(a);
  const nb = normalizeBusinessName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const sa = new Set(na.split(/\s+/).filter((t) => t.length >= 3));
  const sb = new Set(nb.split(/\s+/).filter((t) => t.length >= 3));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function tokenOverlap(haystack: string, needles: string[]): number {
  if (!haystack) return 0;
  const h = haystack.toLowerCase();
  let hits = 0;
  for (const n of needles) {
    const nn = (n ?? "").toLowerCase().trim();
    if (!nn) continue;
    const city = nn.split(",")[0].trim();
    if (city && h.includes(city)) hits++;
  }
  return hits;
}

export interface MatchLocalPackArgs {
  competitor: CompetitorCandidate;
  localPackItems: LocalPackItem[];
  services?: string[];
  locations?: string[];
}

export function matchLocalPackToCompetitor(
  args: MatchLocalPackArgs,
): LocalPackMatchResult {
  const { competitor, localPackItems } = args;
  const services = args.services ?? [];
  const locations = args.locations ?? [];

  const compRoot = rootDomain(competitor.domain);
  const compTitle = competitor.title ?? "";
  const compName = compTitle.split(/[|\-–—]/)[0].trim();

  let best: { score: number; signals: string[]; item: LocalPackItem } | null = null;

  for (const lp of localPackItems) {
    let score = 0;
    const signals: string[] = [];

    // Domain match (strong)
    const lpDomain = normalizeDomain(lp.domain ?? lp.url ?? "");
    if (lpDomain && compRoot && (lpDomain === competitor.domain || rootDomain(lpDomain) === compRoot)) {
      score = Math.max(score, 0.95);
      signals.push("domain_match");
    }

    // Name similarity
    if (lp.name) {
      const nameSim = Math.max(
        nameSimilarity(lp.name, compName),
        nameSimilarity(lp.name, compTitle),
      );
      if (nameSim >= 0.85) {
        score = Math.max(score, 0.9);
        signals.push(`name_exact(${nameSim.toFixed(2)})`);
      } else if (nameSim >= 0.5) {
        score = Math.max(score, 0.65);
        signals.push(`name_strong(${nameSim.toFixed(2)})`);
      } else if (nameSim >= 0.3) {
        score = Math.max(score, 0.4);
        signals.push(`name_weak(${nameSim.toFixed(2)})`);
      }
    }

    // Address / city overlap reinforces (but does not stand alone)
    const addr = lp.address ?? "";
    const cityHits = tokenOverlap(addr, locations);
    if (cityHits > 0 && score > 0) {
      score = Math.min(1, score + 0.08);
      signals.push(`city_overlap(${cityHits})`);
    }

    // Category / service overlap reinforces
    const cat = lp.category ?? "";
    const svcHits = tokenOverlap(cat, services);
    if (svcHits > 0 && score > 0) {
      score = Math.min(1, score + 0.05);
      signals.push(`service_overlap(${svcHits})`);
    }

    if (!best || score > best.score) {
      best = { score, signals, item: lp };
    }
  }

  // Require ≥0.6 to attach review/rating data. Anything weaker → matched=false.
  if (!best || best.score < 0.6) {
    return {
      matched: false,
      matchConfidence: best?.score ?? 0,
      matchedSignals: best?.signals ?? [],
    };
  }

  return {
    matched: true,
    matchConfidence: Math.round(best.score * 100) / 100,
    matchedSignals: best.signals,
    gbpName: best.item.name,
    rating: best.item.rating,
    reviewCount: best.item.reviewCount,
    category: best.item.category,
    address: best.item.address,
    website: best.item.url ?? best.item.domain ?? null,
  };
}
