/**
 * Competitive Intelligence — Orchestrator (Ticket 4).
 *
 * Server-only. Pulls top local clusters from the latest market scan,
 * runs SERP for each, discovers competitor domains, enriches them via
 * Firecrawl, scores them, and persists everything.
 *
 * Fail-soft:
 *  - Cluster SERP failure → recorded, scan continues.
 *  - Firecrawl per-competitor failure → recorded, scan continues.
 *  - Missing review / local-pack data → unknown, not zero.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  isDataForSeoConfigured,
} from "@/lib/marketIntelligence/dataForSeoAuth.server";
import {
  fetchSerpForKeyword,
  type SerpOrganicResult,
  type SerpLocalPackResult,
} from "./dataForSeoSerp.server";
import {
  isFirecrawlConfigured,
  mapDomain,
  scrapeHomepage,
} from "./firecrawl.server";
import {
  computeCompetitorScore,
  computeScoreConfidence,
  computeDataCompleteness,
  normalizeCompetitorDomain,
} from "@/lib/shared/competitiveIntelligence/scoring";
import { classifyMapUrls } from "@/lib/shared/competitiveIntelligence/pageDepthClassifier";
import { parseHomepageMarkdown } from "@/lib/shared/competitiveIntelligence/trustExtractor";
import { buildCompetitorMatrixSummary } from "@/lib/shared/competitiveIntelligence/summarize";
import {
  buildSelfIdentity,
  detectTemporaryOrPlaceholderDomain,
  type SelfIdentity,
  type SerpRowLike,
} from "@/lib/shared/competitiveIntelligence/entityResolution";
import {
  competitorScanSchema,
  competitorSchema,
  type Competitor,
  type CompetitorMatrixSummary,
  type CompetitorScan,
  type TrustSignals,
} from "@/lib/shared/competitiveIntelligence/schemas";
import { summarizeMarketScan } from "@/lib/shared/marketIntelligence/cluster";

export interface RunCompetitorScanArgs {
  tenantId: string;
  growthGoalId?: string | null;
  marketScanId?: string | null;
  maxClusters?: number;
  maxCompetitors?: number;
  forceRefresh?: boolean;
}

export interface RunCompetitorScanResult {
  scan: CompetitorScan;
  competitors: Competitor[];
  summary: CompetitorMatrixSummary;
}

function extractHostname(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const u = new URL(input.startsWith("http") ? input : `https://${input}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return String(input).toLowerCase().replace(/^www\./, "").split("/")[0] || null;
  }
}

/**
 * US state abbreviation → full state name, used to convert client-friendly
 * locations like "Dallas, TX" into the format DataForSEO SERP expects
 * ("Dallas,Texas,United States"). Country-level fallback is handled by the
 * caller if the city-level location is rejected.
 */
const US_STATE_ABBR: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

function countryFullName(country: string | null): string {
  const c = (country ?? "US").toUpperCase();
  if (c === "US" || c === "USA") return "United States";
  if (c === "CA") return "Canada";
  if (c === "GB" || c === "UK") return "United Kingdom";
  if (c === "AU") return "Australia";
  return c;
}

function pickSerpLocationName(
  clusterLocation: string | null,
  scanLocations: string[],
  country: string | null,
): string {
  const countryName = countryFullName(country);
  const loc = (clusterLocation ?? scanLocations[0] ?? "").trim();
  if (!loc) return countryName;
  // Already contains a country marker — normalise spaces only.
  if (/united states|usa|canada|united kingdom|australia/i.test(loc)) {
    return loc.replace(/\s*,\s*/g, ",");
  }
  // Split "City, ST" → ["City", "ST"] (also handles "City, State").
  const parts = loc.split(",").map((p) => p.trim()).filter(Boolean);
  const city = parts[0] ?? "";
  const stateRaw = parts[1] ?? "";
  const stateExpanded =
    stateRaw.length === 2 && US_STATE_ABBR[stateRaw.toUpperCase()]
      ? US_STATE_ABBR[stateRaw.toUpperCase()]
      : stateRaw;
  return [city, stateExpanded, countryName].filter(Boolean).join(",");
}


async function loadSelfDomains(tenantId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("site_connections")
    .select("base_url")
    .eq("tenant_id", tenantId);
  const hosts = new Set<string>();
  for (const row of data ?? []) {
    const h = extractHostname(row.base_url);
    if (h) hosts.add(h);
  }
  return Array.from(hosts);
}

async function loadBrandName(tenantId: string): Promise<string | null> {
  // business_profiles_v2.business_identity.businessName | brandName (preferred)
  // Fallback to legacy business_profiles.business_name.
  try {
    const { data: v2 } = await supabaseAdmin
      .from("business_profiles_v2" as never)
      .select("business_identity")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const identity = (v2 as { business_identity?: Record<string, unknown> } | null)
      ?.business_identity;
    if (identity) {
      const name =
        (identity.brandName as string | undefined) ??
        (identity.businessName as string | undefined);
      if (name && name.trim()) return name.trim();
    }
  } catch {
    // ignore
  }
  try {
    const { data: legacy } = await supabaseAdmin
      .from("business_profiles" as never)
      .select("business_name")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const name = (legacy as { business_name?: string | null } | null)?.business_name;
    if (name && name.trim()) return name.trim();
  } catch {
    // ignore
  }
  return null;
}

interface ClusterRun {
  clusterKey: string;
  keyword: string;
  locationName: string;
  organic: SerpOrganicResult[];
  localPack: SerpLocalPackResult[];
  error?: string;
}

interface AggregatedCompetitor {
  domain: string;
  serpAppearanceCount: number;
  clusterKeys: Set<string>;
  bestRankSum: number; // for sort tiebreak
  bestRankCount: number;
  displayName?: string | null;
  // From any local-pack hit:
  gbpName?: string | null;
  gbpRating?: number | null;
  gbpReviewCount?: number | null;
  gbpCategory?: string | null;
}

function mapScanRow(row: Record<string, unknown>): CompetitorScan {
  return competitorScanSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    growthGoalId: row.growth_goal_id ?? null,
    marketScanId: row.market_scan_id ?? null,
    status: row.status,
    source: row.source ?? null,
    clustersScanned: row.clusters_scanned ?? null,
    serpResultsCollected: row.serp_results_collected ?? null,
    scanStartedAt: row.scan_started_at ?? null,
    scanCompletedAt: row.scan_completed_at ?? null,
    errorMessage: row.error_message ?? null,
    summary: (row.summary as Record<string, unknown>) ?? {},
    confidence: row.confidence != null ? Number(row.confidence) : null,
    partial: !!row.partial,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapCompetitorRow(row: Record<string, unknown>): Competitor {
  return competitorSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    competitorScanId: row.competitor_scan_id,
    domain: row.domain,
    displayName: row.display_name ?? null,
    isSelf: !!row.is_self,
    serpAppearanceCount: row.serp_appearance_count ?? 0,
    clustersAppearedIn: Array.isArray(row.clusters_appeared_in)
      ? (row.clusters_appeared_in as string[])
      : [],
    gbpName: row.gbp_name ?? null,
    gbpRating: row.gbp_rating != null ? Number(row.gbp_rating) : null,
    gbpReviewCount: row.gbp_review_count ?? null,
    gbpCategory: row.gbp_category ?? null,
    servicePagesCount: row.service_pages_count ?? null,
    locationPagesCount: row.location_pages_count ?? null,
    servicePagesSample: Array.isArray(row.service_pages_sample)
      ? (row.service_pages_sample as string[])
      : [],
    locationPagesSample: Array.isArray(row.location_pages_sample)
      ? (row.location_pages_sample as string[])
      : [],
    trustSignals: (row.trust_signals as TrustSignals) ?? {
      phone: false,
      address: false,
      emergency: false,
      licensing: false,
      certifications: [],
      rawMatches: [],
    },
    competitorScore: row.competitor_score != null ? Number(row.competitor_score) : null,
    scoreBreakdown: (row.score_breakdown as Record<string, unknown>) ?? {},
    scoreConfidence: row.score_confidence != null ? Number(row.score_confidence) : null,
    dataCompleteness:
      row.data_completeness != null ? Number(row.data_completeness) : null,
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function runCompetitorScan(
  args: RunCompetitorScanArgs,
): Promise<RunCompetitorScanResult> {
  const {
    tenantId,
    growthGoalId = null,
    marketScanId = null,
    maxClusters = 5,
    maxCompetitors = 5,
  } = args;

  if (!isDataForSeoConfigured()) {
    throw new Error(
      "DataForSEO is not configured. Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to enable Competitive Intelligence.",
    );
  }

  // 1. Resolve market scan.
  let scanQuery = supabaseAdmin
    .from("market_scans")
    .select("*")
    .eq("tenant_id", tenantId)
    .in("status", ["completed", "stale"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (marketScanId) scanQuery = scanQuery.eq("id", marketScanId);
  else if (growthGoalId) scanQuery = scanQuery.eq("growth_goal_id", growthGoalId);
  const { data: scanRows, error: scanErr } = await scanQuery;
  if (scanErr) throw scanErr;
  const marketScan = scanRows?.[0];
  if (!marketScan) {
    throw new Error("Run a market scan before competitor intelligence.");
  }

  // 2. Build a fresh summary so we have classified local clusters.
  const [{ data: kwRows }, { data: clRows }] = await Promise.all([
    supabaseAdmin
      .from("market_keywords")
      .select("*")
      .eq("market_scan_id", marketScan.id),
    supabaseAdmin
      .from("market_demand_clusters")
      .select("*")
      .eq("market_scan_id", marketScan.id),
  ]);

  // Minimal map for summarizeMarketScan (we only need clusters classified).
  const summary = summarizeMarketScan(
    {
      id: marketScan.id,
      tenantId: marketScan.tenant_id,
      status: marketScan.status,
      services: Array.isArray(marketScan.services) ? marketScan.services : [],
      locations: Array.isArray(marketScan.locations) ? marketScan.locations : [],
      source: marketScan.source ?? "manual",
      createdAt: marketScan.created_at,
      updatedAt: marketScan.updated_at,
      summary: {},
    } as never,
    (kwRows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      tenantId: r.tenant_id as string,
      marketScanId: r.market_scan_id as string,
      keyword: r.keyword as string,
      normalizedKeyword: (r.normalized_keyword as string) ?? null,
      service: (r.service as string) ?? null,
      location: (r.location as string) ?? null,
      intent: (r.intent as never) ?? null,
      volume: (r.volume as number) ?? null,
      difficulty: r.difficulty != null ? Number(r.difficulty) : null,
      competition: r.competition != null ? Number(r.competition) : null,
      cpc: r.cpc != null ? Number(r.cpc) : null,
      source: r.source as never,
      confidence: r.confidence != null ? Number(r.confidence) : null,
      raw: (r.raw as Record<string, never>) ?? {},
      createdAt: r.created_at as string,
    })),
    (clRows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      tenantId: r.tenant_id as string,
      marketScanId: r.market_scan_id as string,
      clusterName: r.cluster_name as string,
      service: (r.service as string) ?? null,
      location: (r.location as string) ?? null,
      intent: (r.intent as never) ?? null,
      totalVolume: (r.total_volume as number) ?? null,
      keywordCount: (r.keyword_count as number) ?? null,
      averageDifficulty:
        r.average_difficulty != null ? Number(r.average_difficulty) : null,
      averageCompetition:
        r.average_competition != null ? Number(r.average_competition) : null,
      opportunityScore:
        r.opportunity_score != null ? Number(r.opportunity_score) : null,
      priority: (r.priority as never) ?? null,
      reasoning: Array.isArray(r.reasoning) ? (r.reasoning as string[]) : [],
      representativeKeywords: Array.isArray(r.representative_keywords)
        ? (r.representative_keywords as string[])
        : [],
      createdAt: r.created_at as string,
    })),
  );

  const localClusters = summary.topClusters
    .filter((c) => c.localityType !== "generic_reference")
    .slice(0, maxClusters);

  if (localClusters.length === 0) {
    throw new Error(
      "No local clusters available in the latest market scan. Re-run market scan with services + locations before competitor intelligence.",
    );
  }

  // 3. Create scan row.
  const startedAt = new Date().toISOString();
  const { data: scanRow, error: insertErr } = await supabaseAdmin
    .from("competitor_scans")
    .insert({
      tenant_id: tenantId,
      growth_goal_id: growthGoalId,
      market_scan_id: marketScan.id,
      status: "running",
      source: "dataforseo+firecrawl",
      scan_started_at: startedAt,
    })
    .select("*")
    .single();
  if (insertErr) throw insertErr;
  const scanId = scanRow.id as string;

  const scanLocations = Array.isArray(marketScan.locations)
    ? (marketScan.locations as string[])
    : [];
  const country = (marketScan.country as string) ?? "US";
  const language = (marketScan.language as string) ?? "en";

  // 4. Run SERP per cluster.
  const clusterRuns: ClusterRun[] = [];
  const allSerpRowsToInsert: Record<string, unknown>[] = [];
  let serpFailures = 0;
  let serpSuccesses = 0;

  for (const cluster of localClusters) {
    const keyword =
      cluster.representativeKeywords?.[0] ??
      [cluster.service, cluster.location].filter(Boolean).join(" ") ??
      cluster.clusterName;
    if (!keyword || keyword.trim().length === 0) continue;

    const locationName = pickSerpLocationName(
      cluster.location ?? null,
      scanLocations,
      country,
    );
    const clusterKey = `${cluster.service ?? ""}|${cluster.location ?? ""}|${cluster.clusterName}`;

    try {
      let result;
      let usedLocation = locationName;
      try {
        result = await fetchSerpForKeyword({
          keyword,
          locationName,
          languageCode: language,
        });
      } catch (cityErr) {
        // Fallback: DataForSEO often rejects city/state strings it doesn't
        // recognise. Retry once with country-only so we still capture organic
        // SERP coverage even if local-pack data isn't available.
        const fallbackLocation = countryFullName(country);
        if (fallbackLocation && fallbackLocation !== locationName) {
          result = await fetchSerpForKeyword({
            keyword,
            locationName: fallbackLocation,
            languageCode: language,
          });
          usedLocation = fallbackLocation;
        } else {
          throw cityErr;
        }
      }
      serpSuccesses++;
      clusterRuns.push({
        clusterKey,
        keyword,
        locationName: usedLocation,
        organic: result.organic,
        localPack: result.localPack,
      });

      for (const o of result.organic) {
        allSerpRowsToInsert.push({
          tenant_id: tenantId,
          competitor_scan_id: scanId,
          cluster_key: clusterKey,
          keyword,
          location: usedLocation,
          rank: o.rank,
          url: o.url,
          domain: o.domain,
          title: o.title,
          snippet: o.snippet,
          is_local_pack: false,
          raw: o.raw as never,
        });
      }
      for (const lp of result.localPack) {
        allSerpRowsToInsert.push({
          tenant_id: tenantId,
          competitor_scan_id: scanId,
          cluster_key: clusterKey,
          keyword,
          location: usedLocation,
          rank: lp.rank,
          url: lp.url,
          domain: lp.domain,
          title: lp.name,
          is_local_pack: true,
          local_pack_name: lp.name,
          local_pack_rating: lp.rating,
          local_pack_review_count: lp.reviewCount,
          raw: lp.raw as never,
        });
      }
    } catch (err) {
      serpFailures++;
      clusterRuns.push({
        clusterKey,
        keyword,
        locationName,
        organic: [],
        localPack: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }

  }

  // Persist SERP results in chunks.
  if (allSerpRowsToInsert.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < allSerpRowsToInsert.length; i += chunkSize) {
      const chunk = allSerpRowsToInsert.slice(i, i + chunkSize);
      const { error: insertSerpErr } = await supabaseAdmin
        .from("competitor_serp_results")
        .insert(chunk as never);
      if (insertSerpErr) throw insertSerpErr;
    }
  }

  // 5. Aggregate competitors.
  const selfDomains = await loadSelfDomains(tenantId);
  const brandName = await loadBrandName(tenantId);
  const primarySelfDomain = selfDomains[0] ?? null;
  const selfDomainIsTemp = primarySelfDomain
    ? detectTemporaryOrPlaceholderDomain(primarySelfDomain)
    : true;

  // Collect SERP rows in a generic shape for entity resolution (organic + local pack).
  const allSerpRowsForIdentity: SerpRowLike[] = [];
  for (const run of clusterRuns) {
    for (const o of run.organic) {
      allSerpRowsForIdentity.push({
        domain: o.domain,
        url: o.url,
        title: o.title,
        snippet: o.snippet,
        isLocalPack: false,
      });
    }
    for (const lp of run.localPack) {
      allSerpRowsForIdentity.push({
        domain: lp.domain,
        url: lp.url,
        title: lp.name,
        isLocalPack: true,
        localPackName: lp.name,
      });
    }
  }

  const selfIdentity: SelfIdentity = buildSelfIdentity({
    brandName,
    connectedDomain: primarySelfDomain,
    knownDomains: selfDomains,
    serpRows: allSerpRowsForIdentity,
  });

  const aggMap = new Map<string, AggregatedCompetitor>();
  for (const run of clusterRuns) {
    const seenInCluster = new Set<string>();
    for (const o of run.organic) {
      if (!o.domain) continue;
      const d = normalizeCompetitorDomain(o.domain);
      if (!d) continue;
      seenInCluster.add(d);
      const cur =
        aggMap.get(d) ??
        ({
          domain: d,
          serpAppearanceCount: 0,
          clusterKeys: new Set<string>(),
          bestRankSum: 0,
          bestRankCount: 0,
        } as AggregatedCompetitor);
      cur.serpAppearanceCount += 1;
      cur.clusterKeys.add(run.clusterKey);
      if (typeof o.rank === "number") {
        cur.bestRankSum += o.rank;
        cur.bestRankCount += 1;
      }
      if (!cur.displayName && o.title) cur.displayName = o.title;
      aggMap.set(d, cur);
    }
    // Local-pack enrichment
    for (const lp of run.localPack) {
      const d = lp.domain ? normalizeCompetitorDomain(lp.domain) : null;
      if (!d) continue;
      const cur = aggMap.get(d);
      if (!cur) continue;
      cur.gbpName = cur.gbpName ?? lp.name ?? null;
      if (cur.gbpRating == null && lp.rating != null) cur.gbpRating = lp.rating;
      if (cur.gbpReviewCount == null && lp.reviewCount != null)
        cur.gbpReviewCount = lp.reviewCount;
      if (!cur.gbpCategory && lp.category) cur.gbpCategory = lp.category;
    }
    void seenInCluster;
  }

  // Build candidate list. Only exclude self by domain when the connected
  // domain is NOT temporary and was confidently resolved as self. Temporary
  // domains rarely appear in SERP, and even if they did we'd treat them as
  // out-of-scope rather than a legitimate competitor.
  const excludeDomains = new Set<string>();
  if (primarySelfDomain && !selfDomainIsTemp) {
    for (const d of selfDomains) excludeDomains.add(d);
  }
  // Also exclude any SERP row that scored as the self entity by brand match,
  // so brand pages don't get listed as competitors.
  if (selfIdentity.identityMode === "domain_match" && primarySelfDomain) {
    excludeDomains.add(primarySelfDomain);
  }
  const candidates = Array.from(aggMap.values()).filter(
    (c) => !excludeDomains.has(c.domain),
  );
  candidates.sort((a, b) => {
    const ca = a.clusterKeys.size;
    const cb = b.clusterKeys.size;
    if (cb !== ca) return cb - ca;
    if (b.serpAppearanceCount !== a.serpAppearanceCount)
      return b.serpAppearanceCount - a.serpAppearanceCount;
    const ra = a.bestRankCount ? a.bestRankSum / a.bestRankCount : 999;
    const rb = b.bestRankCount ? b.bestRankSum / b.bestRankCount : 999;
    return ra - rb;
  });
  const topCompetitors = candidates.slice(0, maxCompetitors);

  // 6. Self row aggregate. Always present, even when not in SERP.
  // Use the resolved self domain (may be temp host or "self" placeholder).
  const selfRowDomain = selfIdentity.selfRowDomain;
  const matchedSelfAgg = primarySelfDomain ? aggMap.get(primarySelfDomain) : undefined;
  const selfAgg: AggregatedCompetitor = matchedSelfAgg ?? {
    domain: selfRowDomain,
    serpAppearanceCount: 0,
    clusterKeys: new Set<string>(),
    bestRankSum: 0,
    bestRankCount: 0,
    displayName: selfIdentity.displayName,
  };
  // Always pin the display name to the resolved identity.
  selfAgg.displayName = selfIdentity.displayName;

  // 7. Enrich + score each competitor.
  const firecrawlOk = isFirecrawlConfigured();
  const services = Array.isArray(marketScan.services)
    ? (marketScan.services as string[])
    : [];
  const locations = scanLocations;

  const totalSerpSlotsScanned = clusterRuns.reduce(
    (sum, r) => sum + Math.max(3, r.organic.length || 3),
    0,
  );
  const clustersScannedCount = clusterRuns.filter((r) => !r.error).length;

  const competitorRows: Record<string, unknown>[] = [];

  const enrichOne = async (
    agg: AggregatedCompetitor,
    isSelf: boolean,
  ): Promise<Record<string, unknown>> => {
    let pageDepth: ReturnType<typeof classifyMapUrls> | null = null;
    let trustSignals: TrustSignals = {
      phone: false,
      address: false,
      emergency: false,
      licensing: false,
      certifications: [],
      rawMatches: [],
    };
    let mapOk = false;
    let scrapeOk = false;
    let rawMap: Record<string, unknown> = {};
    let rawHomepage: Record<string, unknown> = {};
    const errors: string[] = [];

    // Skip Firecrawl for the synthetic "self" host or known temp domains.
    // Temp hosts like wordpress.com/lovable.app rarely return useful page
    // intelligence for THIS tenant; we shouldn't pollute the map with all
    // wordpress.com URLs or scrape the platform marketing homepage.
    const skipFirecrawl =
      agg.domain === "self" ||
      (isSelf && detectTemporaryOrPlaceholderDomain(agg.domain));
    if (firecrawlOk && !skipFirecrawl) {
      try {
        const m = await mapDomain(agg.domain, { limit: 200 });
        if (m.ok) {
          mapOk = true;
          pageDepth = classifyMapUrls(m.urls, services, locations);
          rawMap = { urlsCount: m.urls.length, sample: m.urls.slice(0, 20) };
        } else if (m.error) {
          errors.push(`map: ${m.error}`);
        }
      } catch (err) {
        errors.push(`map: ${err instanceof Error ? err.message : String(err)}`);
      }
      try {
        const s = await scrapeHomepage(agg.domain);
        if (s.ok) {
          scrapeOk = true;
          trustSignals = parseHomepageMarkdown(s.markdown, s.links);
          rawHomepage = {
            hasMarkdown: !!s.markdown,
            linksCount: s.links.length,
          };
        } else if (s.error) {
          errors.push(`scrape: ${s.error}`);
        }
      } catch (err) {
        errors.push(
          `scrape: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else if (skipFirecrawl) {
      errors.push("firecrawl_skipped_temporary_or_synthetic_domain");
    } else {
      errors.push("firecrawl_not_configured");
    }

    const reviewKnown = agg.gbpReviewCount != null && agg.gbpRating != null;
    const score = computeCompetitorScore({
      clustersAppearedIn: agg.clusterKeys.size,
      clustersScanned: Math.max(1, clustersScannedCount),
      serpAppearanceCount: agg.serpAppearanceCount,
      totalSerpSlotsScanned: Math.max(1, totalSerpSlotsScanned),
      reviewCount: agg.gbpReviewCount ?? null,
      reviewRating: agg.gbpRating ?? null,
      servicePagesCount: pageDepth?.servicePagesCount ?? null,
      locationPagesCount: pageDepth?.locationPagesCount ?? null,
      servicesCount: services.length,
      locationsCount: locations.length,
      trustSignals,
    });

    const confidence = computeScoreConfidence({
      localPackDataPresent: agg.serpAppearanceCount > 0 || isSelf,
      reviewDataPresent: reviewKnown,
      firecrawlMapSuccess: mapOk,
      homepageScrapeSuccess: scrapeOk,
      pageCountsAvailable: pageDepth != null,
    });
    const completeness = computeDataCompleteness({
      localPackDataPresent: agg.serpAppearanceCount > 0 || isSelf,
      reviewDataPresent: reviewKnown,
      firecrawlMapSuccess: mapOk,
      homepageScrapeSuccess: scrapeOk,
      pageCountsAvailable: pageDepth != null,
    });

    return {
      tenant_id: tenantId,
      competitor_scan_id: scanId,
      domain: agg.domain,
      display_name: agg.displayName ?? agg.gbpName ?? null,
      is_self: isSelf,
      serp_appearance_count: agg.serpAppearanceCount,
      clusters_appeared_in: Array.from(agg.clusterKeys) as never,
      gbp_name: agg.gbpName ?? null,
      gbp_rating: agg.gbpRating ?? null,
      gbp_review_count: agg.gbpReviewCount ?? null,
      gbp_category: agg.gbpCategory ?? null,
      service_pages_count: pageDepth?.servicePagesCount ?? null,
      location_pages_count: pageDepth?.locationPagesCount ?? null,
      service_pages_sample: (pageDepth?.servicePagesSample ?? []) as never,
      location_pages_sample: (pageDepth?.locationPagesSample ?? []) as never,
      trust_signals: trustSignals as never,
      competitor_score: score.total,
      score_breakdown: score.breakdown as never,
      score_confidence: confidence,
      data_completeness: completeness,
      error_message: errors.length ? errors.join("; ").slice(0, 500) : null,
      raw_homepage: rawHomepage as never,
      raw_map: rawMap as never,
    };
  };

  for (const c of topCompetitors) {
    competitorRows.push(await enrichOne(c, false));
  }
  if (selfAgg) {
    competitorRows.push(await enrichOne(selfAgg, true));
  }

  let insertedCompetitors: Competitor[] = [];
  let firecrawlFailures = 0;
  if (competitorRows.length > 0) {
    const { data: compRows, error: compErr } = await supabaseAdmin
      .from("competitors")
      .insert(competitorRows as never)
      .select("*");
    if (compErr) throw compErr;
    insertedCompetitors = (compRows ?? []).map((r) =>
      mapCompetitorRow(r as Record<string, unknown>),
    );
    firecrawlFailures = competitorRows.filter(
      (r) => typeof r.error_message === "string" && r.error_message,
    ).length;
  }

  // 8. Finalize scan.
  const partial =
    serpFailures > 0 || firecrawlFailures > 0 || !firecrawlOk;
  const status = insertedCompetitors.length > 0 ? (partial ? "partial" : "completed") : "failed";
  const completedAt = new Date().toISOString();

  // Build summary now so we can persist it.
  const finalScan: CompetitorScan = competitorScanSchema.parse({
    ...mapScanRow(scanRow),
    status,
    partial,
    clustersScanned: localClusters.length,
    serpResultsCollected: allSerpRowsToInsert.length,
    scanCompletedAt: completedAt,
    updatedAt: completedAt,
  });
  const matrixSummary = buildCompetitorMatrixSummary(
    finalScan,
    insertedCompetitors,
    [],
  );

  const avgConfidence =
    insertedCompetitors.length > 0
      ? insertedCompetitors.reduce(
          (s, c) => s + (c.scoreConfidence ?? 0),
          0,
        ) / insertedCompetitors.length
      : null;

  const { data: updatedRow, error: updErr } = await supabaseAdmin
    .from("competitor_scans")
    .update({
      status,
      partial,
      clusters_scanned: localClusters.length,
      serp_results_collected: allSerpRowsToInsert.length,
      scan_completed_at: completedAt,
      summary: matrixSummary as never,
      confidence: avgConfidence,
      error_message: serpSuccesses === 0 ? "All SERP calls failed." : null,
    })
    .eq("id", scanId)
    .select("*")
    .single();
  if (updErr) throw updErr;

  return {
    scan: mapScanRow(updatedRow as Record<string, unknown>),
    competitors: insertedCompetitors,
    summary: matrixSummary,
  };
}
