/**
 * Market Intelligence — Pure utilities (Ticket 2).
 *
 * Deterministic helpers for normalizing keywords, inferring intent,
 * scoring opportunity, clustering demand and summarizing scans.
 *
 * Rules:
 *  - No DB, no API, no randomness.
 *  - Missing volume/difficulty must not throw — they lower confidence instead.
 *  - Never invent search volume.
 *
 * See: docs/MARKET_INTELLIGENCE_DATA_MODEL.md
 */

import type {
  ClusterPriority,
  KeywordIntent,
  MarketDemandCluster,
  MarketDemandSummary,
  MarketKeyword,
  MarketScan,
  TopEntityVolume,
} from "./schemas";

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export function normalizeKeyword(keyword: string): string {
  if (!keyword) return "";
  return keyword
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Intent inference
// ---------------------------------------------------------------------------

const EMERGENCY_TOKENS = [
  "emergency",
  "urgent",
  "same day",
  "24 hour",
  "24-hour",
  "24hr",
  "no cooling",
  "no heat",
  "broken",
  "not working",
  "after hours",
];
const SERVICE_TOKENS = [
  "repair",
  "service",
  "install",
  "installation",
  "replacement",
  "maintenance",
  "tune up",
  "tune-up",
];
const COMMERCIAL_TOKENS = [
  "near me",
  "company",
  "contractor",
  "companies",
  "pros",
  "specialist",
  "price",
  "quote",
  "cost",
];
const INFORMATIONAL_TOKENS = [
  "how",
  "why",
  "what",
  "signs",
  "guide",
  "tips",
  "should i",
  "when to",
];
const COMPARISON_TOKENS = ["best", "top", " vs ", "vs.", "compare", "comparison", "review", "reviews"];

export function inferKeywordIntent(
  keyword: string,
  brandTokens: string[] = [],
): KeywordIntent {
  const norm = ` ${normalizeKeyword(keyword)} `;
  if (!norm.trim()) return "unknown";

  for (const b of brandTokens) {
    const nb = normalizeKeyword(b);
    if (nb && norm.includes(` ${nb} `)) return "branded";
  }
  if (EMERGENCY_TOKENS.some((t) => norm.includes(t))) return "emergency";
  if (COMPARISON_TOKENS.some((t) => norm.includes(t))) return "comparison";
  if (INFORMATIONAL_TOKENS.some((t) => norm.startsWith(` ${t} `))) return "informational";
  if (SERVICE_TOKENS.some((t) => norm.includes(t))) return "service";
  if (COMMERCIAL_TOKENS.some((t) => norm.includes(t))) return "commercial";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Opportunity score
// ---------------------------------------------------------------------------

export interface OpportunityScoreInput {
  volume?: number | null;
  difficulty?: number | null; // 0..100 (higher = harder)
  competition?: number | null; // 0..1 (higher = more competitive)
  intent?: KeywordIntent | null;
}

/**
 * V1 opportunity score: 0..100.
 *
 *  - High volume increases score (log-scaled).
 *  - Lower difficulty / competition increases score.
 *  - Emergency / commercial / service intent boost score.
 *  - Missing volume → score is computed conservatively, never crashes.
 */
export function calculateOpportunityScore(input: OpportunityScoreInput): number {
  const { volume, difficulty, competition, intent } = input;

  // Volume component (0..60). Log-scaled so 1k → ~30, 10k → ~50.
  let volumeComponent = 15; // default when missing
  if (typeof volume === "number" && Number.isFinite(volume) && volume > 0) {
    const log = Math.log10(volume + 1); // 0..~7
    volumeComponent = Math.min(60, Math.round(log * 14));
  }

  // Difficulty component (0..25). Lower difficulty = higher score.
  let difficultyComponent = 12;
  if (typeof difficulty === "number" && Number.isFinite(difficulty)) {
    const clamped = Math.max(0, Math.min(100, difficulty));
    difficultyComponent = Math.round(25 * (1 - clamped / 100));
  }

  // Competition component (0..10). Lower competition = higher score.
  let competitionComponent = 5;
  if (typeof competition === "number" && Number.isFinite(competition)) {
    const clamped = Math.max(0, Math.min(1, competition));
    competitionComponent = Math.round(10 * (1 - clamped));
  }

  // Intent multiplier — additive boost up to 15.
  let intentBoost = 0;
  switch (intent) {
    case "emergency":
      intentBoost = 15;
      break;
    case "commercial":
      intentBoost = 10;
      break;
    case "service":
      intentBoost = 8;
      break;
    case "comparison":
      intentBoost = 5;
      break;
    case "branded":
      intentBoost = 2;
      break;
    case "informational":
      intentBoost = 1;
      break;
    default:
      intentBoost = 0;
  }

  const raw = volumeComponent + difficultyComponent + competitionComponent + intentBoost;
  return Math.max(0, Math.min(100, raw));
}

function priorityFromScore(score: number | null | undefined): ClusterPriority {
  if (score == null || !Number.isFinite(score)) return "low";
  if (score >= 80) return "critical";
  if (score >= 65) return "high";
  if (score >= 45) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

export interface ClusterableKeyword {
  keyword: string;
  service?: string | null;
  location?: string | null;
  intent?: KeywordIntent | null;
  volume?: number | null;
  difficulty?: number | null;
  competition?: number | null;
}

type DraftCluster = Omit<MarketDemandCluster, "id" | "tenantId" | "marketScanId" | "createdAt">;

/**
 * Groups keywords into demand clusters by (service, location, intent).
 * Keys without service/location/intent fall into an "other" bucket so we
 * never lose keywords. Deterministic ordering.
 */
export function clusterMarketKeywords(keywords: ClusterableKeyword[]): DraftCluster[] {
  if (!Array.isArray(keywords) || keywords.length === 0) return [];

  const buckets = new Map<string, ClusterableKeyword[]>();
  for (const kw of keywords) {
    if (!kw?.keyword) continue;
    const service = (kw.service || "").trim() || null;
    const location = (kw.location || "").trim() || null;
    const intent = kw.intent || inferKeywordIntent(kw.keyword);
    const key = `${service ?? "_"}::${location ?? "_"}::${intent}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push({ ...kw, intent });
  }

  const drafts: DraftCluster[] = [];
  for (const [, items] of buckets) {
    const service = items[0].service?.trim() || null;
    const location = items[0].location?.trim() || null;
    const intent = (items[0].intent as KeywordIntent) || "unknown";

    const volumes = items.map((i) => i.volume).filter((v): v is number => typeof v === "number");
    const difficulties = items
      .map((i) => i.difficulty)
      .filter((v): v is number => typeof v === "number");
    const competitions = items
      .map((i) => i.competition)
      .filter((v): v is number => typeof v === "number");

    const totalVolume = volumes.length ? volumes.reduce((a, b) => a + b, 0) : null;
    const averageDifficulty = difficulties.length
      ? Math.round((difficulties.reduce((a, b) => a + b, 0) / difficulties.length) * 10) / 10
      : null;
    const averageCompetition = competitions.length
      ? Math.round((competitions.reduce((a, b) => a + b, 0) / competitions.length) * 100) / 100
      : null;

    const opportunityScore = Math.round(
      items.reduce(
        (sum, kw) =>
          sum +
          calculateOpportunityScore({
            volume: kw.volume,
            difficulty: kw.difficulty,
            competition: kw.competition,
            intent,
          }),
        0,
      ) / items.length,
    );

    // Top 5 representative keywords by volume desc, then alpha.
    const representativeKeywords = [...items]
      .sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || a.keyword.localeCompare(b.keyword))
      .slice(0, 5)
      .map((k) => k.keyword);

    const reasoning: string[] = [];
    if (totalVolume != null) reasoning.push(`Aggregate volume ${totalVolume} across ${items.length} keywords.`);
    else reasoning.push(`${items.length} keywords with no volume data — score uses fallbacks.`);
    if (averageDifficulty != null) reasoning.push(`Average difficulty ${averageDifficulty}.`);
    if (intent === "emergency" || intent === "commercial" || intent === "service") {
      reasoning.push(`Intent "${intent}" indicates lead-ready demand.`);
    }

    const clusterName = [service, location, intent]
      .filter((p): p is string => !!p && p !== "unknown")
      .join(" • ") || "Uncategorised demand";

    drafts.push({
      clusterName,
      service,
      location,
      intent,
      totalVolume,
      keywordCount: items.length,
      averageDifficulty,
      averageCompetition,
      opportunityScore,
      priority: priorityFromScore(opportunityScore),
      reasoning,
      representativeKeywords,
    });
  }

  // Deterministic order: opportunity desc, then name asc.
  drafts.sort(
    (a, b) =>
      (b.opportunityScore ?? -1) - (a.opportunityScore ?? -1) ||
      a.clusterName.localeCompare(b.clusterName),
  );
  return drafts;
}

// ---------------------------------------------------------------------------
// Summary (feeds Blueprint)
// ---------------------------------------------------------------------------

function topByVolume(
  clusters: MarketDemandCluster[] | DraftCluster[],
  pick: (c: MarketDemandCluster | DraftCluster) => string | null | undefined,
  limit = 5,
): TopEntityVolume[] {
  const map = new Map<string, { totalVolume: number | null; keywordCount: number; bestOpp: number | null }>();
  for (const c of clusters) {
    const name = pick(c);
    if (!name) continue;
    const cur = map.get(name) ?? { totalVolume: null, keywordCount: 0, bestOpp: null };
    if (c.totalVolume != null) cur.totalVolume = (cur.totalVolume ?? 0) + c.totalVolume;
    cur.keywordCount += c.keywordCount ?? 0;
    if (c.opportunityScore != null) {
      cur.bestOpp = cur.bestOpp == null ? c.opportunityScore : Math.max(cur.bestOpp, c.opportunityScore);
    }
    map.set(name, cur);
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({
      name,
      totalVolume: v.totalVolume,
      keywordCount: v.keywordCount,
      opportunityScore: v.bestOpp,
    }))
    .sort((a, b) => (b.totalVolume ?? -1) - (a.totalVolume ?? -1) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function summarizeMarketScan(
  scan: MarketScan | null,
  keywords: MarketKeyword[],
  clusters: MarketDemandCluster[],
): MarketDemandSummary {
  if (!scan) {
    return emptySummary();
  }

  const keywordsWithVolume = keywords.filter((k) => typeof k.volume === "number").length;
  const totalAddressableVolume = keywords.reduce(
    (sum, k) => (typeof k.volume === "number" ? sum + k.volume : sum),
    0,
  );
  const difficulties = keywords
    .map((k) => k.difficulty)
    .filter((d): d is number => typeof d === "number");
  const avgDifficulty = difficulties.length
    ? Math.round((difficulties.reduce((a, b) => a + b, 0) / difficulties.length) * 10) / 10
    : null;

  const intentDistribution: Record<KeywordIntent, number> = {
    emergency: 0,
    service: 0,
    commercial: 0,
    informational: 0,
    comparison: 0,
    branded: 0,
    unknown: 0,
  };
  for (const k of keywords) {
    const intent = (k.intent ?? "unknown") as KeywordIntent;
    intentDistribution[intent] = (intentDistribution[intent] ?? 0) + 1;
  }

  const topClusters = [...clusters]
    .sort(
      (a, b) =>
        (b.opportunityScore ?? -1) - (a.opportunityScore ?? -1) ||
        (b.totalVolume ?? -1) - (a.totalVolume ?? -1),
    )
    .slice(0, 8)
    .map((c) => ({
      clusterName: c.clusterName,
      service: c.service ?? null,
      location: c.location ?? null,
      intent: (c.intent ?? null) as KeywordIntent | null,
      totalVolume: c.totalVolume ?? null,
      opportunityScore: c.opportunityScore ?? null,
      priority: (c.priority ?? null) as ClusterPriority | null,
      representativeKeywords: c.representativeKeywords ?? [],
    }));

  const warnings: string[] = [];
  if (keywords.length === 0) warnings.push("Scan has no keywords yet.");
  if (keywordsWithVolume === 0 && keywords.length > 0) {
    warnings.push("No keyword has volume data — opportunity scores use fallbacks.");
  }
  if (scan.source === "synthetic_fixture" || scan.source === "manual") {
    warnings.push(`Source is "${scan.source}" — not a live market scan.`);
  }

  // Confidence: ratio of keywords-with-volume + scan source factor.
  const volumeRatio = keywords.length ? keywordsWithVolume / keywords.length : 0;
  const sourceFactor =
    scan.source === "dataforseo" ? 1 : scan.source === "import" ? 0.7 : 0.4;
  const confidence = Math.round(volumeRatio * sourceFactor * 100) / 100;

  return {
    available: keywords.length > 0,
    source: scan.source,
    scanId: scan.id,
    scanCompletedAt: scan.scanCompletedAt ?? null,
    language: scan.language ?? null,
    totalKeywords: keywords.length,
    keywordsWithVolume,
    totalAddressableVolume: keywordsWithVolume > 0 ? totalAddressableVolume : null,
    averageDifficulty: avgDifficulty,
    clusterCount: clusters.length,
    topClusters,
    topServices: topByVolume(clusters, (c) => c.service ?? null),
    topLocations: topByVolume(clusters, (c) => c.location ?? null),
    intentDistribution,
    confidence,
    warnings,
  };
}

export function emptySummary(): MarketDemandSummary {
  return {
    available: false,
    source: null,
    scanId: null,
    scanCompletedAt: null,
    language: null,
    totalKeywords: 0,
    keywordsWithVolume: 0,
    totalAddressableVolume: null,
    averageDifficulty: null,
    clusterCount: 0,
    topClusters: [],
    topServices: [],
    topLocations: [],
    intentDistribution: {
      emergency: 0,
      service: 0,
      commercial: 0,
      informational: 0,
      comparison: 0,
      branded: 0,
      unknown: 0,
    },
    confidence: 0,
    warnings: [],
  };
}
