# Market Intelligence — Data Model (Ticket 2)

Storage and typed contracts for market demand data that will feed the Lead
Engine Blueprint. No external APIs in this ticket — DataForSEO comes in
Ticket 3.

## Purpose

Give the Blueprint a real Market Intelligence layer instead of a placeholder
section, without inventing search volume. All numbers must come from an
explicit source (manual import, synthetic fixture, or future DataForSEO scan)
and that source label MUST be visible in the UI.

## Tables

### `market_scans`
One row per scan attempt (manual, fixture or future API run).
- status: `draft | pending | running | completed | failed | stale`
- source: `manual | dataforseo | import | synthetic_fixture`
- services / locations: jsonb arrays describing scan scope
- summary: cached `MarketDemandSummary` for fast Blueprint reads
- confidence: 0..1 derived from source + volume coverage

### `market_keywords`
One row per keyword inside a scan.
- intent: `emergency | service | commercial | informational | comparison | branded | unknown`
- volume / difficulty / competition / cpc optional (never invented)
- normalized_keyword: lowercase ASCII form for matching
- raw: full provider payload (Json)

### `market_demand_clusters`
Aggregated demand groups (service × location × intent).
- total_volume, average_difficulty, average_competition
- opportunity_score (0..100, V1 formula below)
- priority: `low | medium | high | critical`
- representative_keywords: up to 5 top keywords per cluster

All three tables: RLS enabled, members SELECT, operators/owners ALL.

## Intent model (`inferKeywordIntent`)

Heuristic, deterministic. Brand tokens win first, then:

- emergency: `emergency`, `urgent`, `same day`, `24 hour`, `no cooling`, `broken`, …
- comparison: `best`, `top`, `vs`, `compare`, `review(s)`
- informational: starts with `how`, `why`, `what`, `signs`, `guide`, …
- service: `repair`, `service`, `install`, `maintenance`, `tune up`
- commercial: `near me`, `contractor`, `company`, `price`, `quote`, `cost`
- fallback: `unknown`

## Opportunity score V1 (`calculateOpportunityScore`)

Output 0..100, deterministic, robust to missing data:

- Volume (0..60): `min(60, round(log10(volume+1) * 14))`, fallback 15 when missing
- Difficulty (0..25): `round(25 * (1 - difficulty/100))`, fallback 12
- Competition (0..10): `round(10 * (1 - competition))`, fallback 5
- Intent boost (additive): emergency +15, commercial +10, service +8,
  comparison +5, branded +2, informational +1, unknown +0

Priority bands: `≥80 critical | ≥65 high | ≥45 medium | else low`.

## Clustering (`clusterMarketKeywords`)

Pure grouping by `(service, location, intent)`. Each cluster computes:
- aggregate volume / averaged difficulty + competition
- average opportunity score across its keywords
- top 5 representative keywords (volume desc, then alpha)
- reasoning lines explaining the score

Ordering: opportunity desc, then name asc — deterministic across runs.

## Summary (`summarizeMarketScan`)

Returns `MarketDemandSummary` — the contract the Blueprint consumes:
- top 8 clusters
- top 5 services and top 5 locations by aggregate volume
- intent distribution counts
- confidence = `keywords_with_volume / total * source_factor`
  (source_factor: dataforseo 1.0, import 0.7, manual/fixture 0.4)
- warnings: empty scan, no-volume data, non-live source

## Server functions

Located in `src/lib/marketIntelligence/marketIntelligence.functions.ts`:

- `createMarketScan` — operator/owner. Inserts scan + keywords, builds
  clusters, writes cached summary onto the scan row.
- `listMarketScans` — recent scans for tenant.
- `getLatestMarketScan` — latest completed/stale scan with full
  keywords + clusters.
- `summarizeLatestMarketScan` — returns the cached `MarketDemandSummary`
  for the Blueprint.

All require auth + tenant membership. No external API calls.

## Relation to Blueprint

The Blueprint generator (Ticket 1b) already accepts `marketData`. When a
scan is available, `summarizeLatestMarketScan` feeds:
- Market Intelligence section (clusters, top services, top locations,
  representative keywords, opportunity scores)
- Demand Coverage Index (totals + cluster coverage)
- Lead Engine Score (market data lifts confidence)

When no scan exists, the section stays a placeholder labelled
"pending Ticket 3 — DataForSEO Market Scan". The Blueprint never invents
volume.

## How DataForSEO fills this in Ticket 3

Ticket 3 will add a server-side job that:
1. Reads scope from `growth_goals` (services, locations) or
   `CreateMarketScanInput`.
2. Creates a `market_scans` row with `source = 'dataforseo'`, `status = 'running'`.
3. Calls DataForSEO Keywords/SERP endpoints, stores results in
   `market_keywords` with `raw` payloads preserved.
4. Re-uses the same `clusterMarketKeywords` + `summarizeMarketScan`
   utilities — no separate scoring code path.
5. Marks the scan `completed` with timestamps and the cached summary.

## Source rules

| Source              | Allowed in UI as live? | Default confidence factor |
|---------------------|------------------------|---------------------------|
| `dataforseo`        | Yes                    | 1.0                       |
| `import`            | Yes, with source label | 0.7                       |
| `manual`            | Only with source label | 0.4                       |
| `synthetic_fixture` | Dev only, must label   | 0.4                       |

Synthetic Dallas HVAC fixture lives at
`src/lib/shared/marketIntelligence/fixtures.ts` — used to exercise the
Blueprint integration before DataForSEO is wired.

## Blueprint integration (Ticket 2b)

- `summarizeLatestMarketScan` is consumed by `/growth/blueprint` and fed
  into `generateLeadEngineBlueprint({ marketDemandSummary })`.
- The Market Intelligence section becomes rich (clusters, top
  services/locations, intent breakdown, representative keywords) when a
  scan exists; otherwise the placeholder remains.
- Source is always surfaced. `synthetic_fixture` and `manual` scans are
  badged amber and carry an explicit warning so they are never presented
  as verified market data. DataForSEO replacement is Ticket 3.
