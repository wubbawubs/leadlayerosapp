# Ticket 3 — DataForSEO Market Scan V1

Real search-demand data flowing from DataForSEO → `market_keywords` →
`market_demand_clusters` → `marketDemandSummary` → Blueprint Generator → Blueprint View.

## Architecture

```
DataForSEO API
  → src/lib/marketIntelligence/dataForSeo.server.ts (HTTP client)
  → src/lib/shared/marketIntelligence/seeds.ts (pure seed generation)
  → runDataForSeoMarketScan (server function)
      → market_scans (status: running → completed | failed)
      → market_keywords (one row per generated seed)
      → market_demand_clusters (via clusterMarketKeywords)
      → market_scans.summary (MarketDemandSummary cached on row)
  → summarizeLatestMarketScan (used by /growth/blueprint)
  → generateLeadEngineBlueprint
  → Blueprint View
```

No DataForSEO response ever reaches the React tree directly. The Blueprint
only sees the normalised `MarketDemandSummary`.

## Environment

Required secrets (configured via Lovable Cloud Secrets):
- `DATAFORSEO_LOGIN`
- `DATAFORSEO_PASSWORD`

Both are read inside `dataForSeo.server.ts` via `process.env` so they are never
bundled into the client. Missing credentials → the scan fails fast with a
clear error and the scan row is marked `failed`.

## Seed generation

`generateMarketKeywordSeeds({ services, locations, country, language, maxKeywords })`
is pure and deterministic. For each service it produces, in priority order:

1. `{service} {city}` per location
2. `{service} near me` (location-less)
3. `{service} {city} {state}` (state derived from "City, ST" or the country hint)
4. `{service} company {city}` / `{service} contractor {city}`
5. `emergency {service} {city}` / `same day {service} {city}` (only for
   services flagged as emergency: contains "emergency", "repair", "urgent",
   "no heat/cool", "burst", "leak")

Rules:
- Duplicates are dropped (case-insensitive).
- Total seeds capped at `maxKeywords` (default **100**, hard max 500).
- `skipped` count is returned and stored on `market_scans.summary.seedStats`.
- Never emits a bare keyword like `"hvac"` unless `locations` is empty.

## DataForSEO call

Endpoint: `POST /v3/keywords_data/google_ads/search_volume/live`.
Auth: HTTP Basic. We send a single task with all deduplicated seeds for a
single `location_name` + `language_code`.

Response normalisation:
- `search_volume` → `volume` (rounded, clamped to ≥ 0, otherwise `null`)
- `competition_index` → `competition` (mapped to 0..1)
- `competition` string ("LOW"/"MEDIUM"/"HIGH") → 0.2 / 0.5 / 0.85 fallback
- `cpc` → `cpc`
- `difficulty` → always `null` (this endpoint doesn't return KD; never invented)
- Keywords missing from the response are kept with `volume = null` —
  we never invent metrics.

## Scan lifecycle

1. `runDataForSeoMarketScan` enforces tenant membership + operator role.
2. Services / locations come from input or from the active growth goal.
   If both are still empty → throws `needs_context: …`.
3. A `market_scans` row is inserted with `status='running'`, `source='dataforseo'`.
4. Seeds are generated, deduplicated and capped.
5. DataForSEO is called once.
6. Keywords are inserted with intent inferred by `inferKeywordIntent`.
7. `clusterMarketKeywords` produces demand clusters; they are inserted.
8. A `MarketDemandSummary` is computed (plus `seedStats`) and written back
   to `market_scans.summary`, `status='completed'`, `scan_completed_at=now()`.
9. On any failure: `status='failed'`, `error_message` truncated to 500 chars.

Each run creates a **new scan** — older scans are never overwritten. The
Blueprint always consumes the latest `completed` (or `stale`) scan for the
tenant + active growth goal.

## Blueprint integration

`/growth/blueprint` already calls `summarizeLatestMarketScan` (Ticket 2b).
The `MarketIntelligenceBlock`:
- Renders a **Run market scan** button when a tenant is loaded.
- Calls `runDataForSeoMarketScan` via `useMutation`, then invalidates the
  `["market-summary", …]` query so the section refreshes.
- Shows the failure reason inline if the scan errored.
- Shows the existing **Source: DataForSEO** badge (green) when the scan
  source is live; warning badge is reserved for `synthetic_fixture` / `manual`.
- Falls back to the existing "no scan yet" placeholder when no completed
  scan exists, with the scan button visible inside it.

## Rate-limit / safety

- 1 HTTP call per scan (one DataForSEO task with all seeds).
- Hard cap of 100 keywords per scan by default (configurable up to 500).
- Deterministic seed ordering means trimming is reproducible.
- No retries — failed scans are surfaced to the operator with a clear message.

## Non-goals (V1)

- No SERP / competitor scraping
- No keyword rank tracking
- No Google Business Profile data
- No scheduled / recurring scans
- No publishing or write-back to WordPress
- No invented metrics for missing keywords

## Regression — Dallas HVAC

Active growth goal with:
- Services: AC repair, Emergency HVAC repair, HVAC maintenance,
  Air conditioning installation
- Locations: Dallas, TX • Plano, TX • Irving, TX

Expected after clicking **Run market scan**:
- `market_scans` row with `source='dataforseo'`, `status='completed'`.
- ~30–60 `market_keywords` rows depending on the emergency heuristic.
- One `market_demand_clusters` row per (service × location × intent) bucket.
- Blueprint Market Intelligence section shows the **DataForSEO** badge
  (no synthetic warning) and renders top clusters / services / locations.
- Placeholder branch remains untouched for tenants without a scan.

## Ticket 3b — Locality polish

`summarizeMarketScan` now classifies clusters as `local`, `generic_reference`,
or `mixed` (using scan locations as the city-token source). The
`MarketDemandSummary` exposes:

- `topClusters` — local + mixed clusters only (drives roadmap/priority).
- `genericReferenceClusters` — `near me` / national clusters, shown as reference.
- `localityBreakdown` — `localDemandVolume`, `genericReferenceDemandVolume`,
  `totalScannedDemandVolume`, keyword counts, and `volumeCoveragePercent`.

The Blueprint scoring uses `localDemandVolume` (not total scanned volume) so
generic "near me" demand can no longer inflate the Demand Coverage Index.
The Blueprint View renders two cluster sections — "Top local opportunity
clusters" and "Generic demand reference" — plus a volume-coverage metric and
an explicit low-coverage warning when <60% of keywords return volume.
