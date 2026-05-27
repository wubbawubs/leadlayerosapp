# Competitive Intelligence V1

## Purpose
Answer two questions inside the Lead Engine Blueprint:
1. Who is capturing the client's local demand today?
2. Where is the client measurably behind those competitors?

This is the "Competitive Position" layer of the Blueprint. It is built strictly
on top of Market Intelligence V1 (local clusters) — without local cluster
coverage, no competitor scan runs.

## Architecture

```text
Market scan (local clusters)
    │
    ▼
DataForSEO SERP (advanced / live)        ← src/lib/competitiveIntelligence/dataForSeoSerp.server.ts
    │
    ▼
Competitor aggregation (top domains)
    │
    ▼
Firecrawl map + scrape per competitor    ← src/lib/competitiveIntelligence/firecrawl.server.ts
    │
    ▼
Page-depth classifier + trust extractor  ← src/lib/shared/competitiveIntelligence/{pageDepthClassifier,trustExtractor}.ts
    │
    ▼
Scoring (0..100, 5 pillars)              ← src/lib/shared/competitiveIntelligence/scoring.ts
    │
    ▼
Persistence (competitor_scans + competitors + competitor_serp_results)
    │
    ▼
Matrix summary                           ← src/lib/shared/competitiveIntelligence/summarize.ts
    │
    ▼
Blueprint generator → competitive_position section
    │
    ▼
CompetitiveBlock UI (growth.blueprint.tsx)
```

## DB tables

- `competitor_scans` — one row per scan run. Status: `pending | running | partial | completed | failed`. Stores `error_message`, `clusters_scanned`, `serp_results_collected`, `competitor_count`.
- `competitor_serp_results` — raw SERP rows per cluster + position + result_type (organic / local_pack).
- `competitors` — one row per (scan, domain). Includes `is_self`, score pillars, `competitor_score`, `score_confidence`, `reviews_unknown`, `service_pages_count`, `location_pages_count`, JSON `trust_signals`.

All tables: RLS scoped to tenant via `tenant_users`, `GRANT`s for `authenticated` + `service_role`, `updated_at` triggers, tenant + scan_id indexes.

## Discovery logic

1. Read most recent **completed** market scan for the tenant.
2. Pull top N local clusters (`localityType = "local"` only — generic clusters are excluded; market scan already separates these).
3. For each cluster, call DataForSEO SERP with the primary keyword + location code.
4. Aggregate unique domains from organic + local pack results.
5. Take the top K (≤ 5) competitor domains by total SERP appearances.
6. Add the client's own domain as a `is_self = true` row so it is comparable across the same dimensions.

## Local cluster dependency

If there is no completed market scan, the Run button is disabled with a clear
message ("Run market scan first"). We never invent competitors from generic
demand — that would re-introduce the exact bias Ticket 3b fixed.

## DataForSEO usage

- Endpoint: `serp/google/organic/live/advanced`.
- Auth: shared Basic Auth helper (`dataForSeoAuth.server.ts`).
- Per cluster: one request. Failure of a single cluster does not abort the scan
  (status becomes `partial`).
- We capture organic + local-pack items only. Ads, knowledge panels, and
  shopping results are ignored.

## Firecrawl usage

- `map` to list a competitor's URLs (capped).
- `scrape` per representative page (home + a small sample) for markdown content.
- Per-domain failure is tolerated — that competitor's pillars degrade to
  "unknown" and `score_confidence` drops, but the scan continues.

## Scoring model (0..100)

| Pillar              | Max | Source                                  |
|---------------------|-----|-----------------------------------------|
| Local pack presence | 30  | DataForSEO local pack appearances        |
| Reviews             | 25  | Firecrawl-extracted GBP review hints     |
| Page depth          | 25  | Service + location pages classifier      |
| Trust signals       | 10  | Phone, address, emergency, certs (NATE, EPA) |
| SERP presence       | 10  | Organic appearances across clusters      |

`score_confidence` is reduced when pillars are `unknown`. Unknown reviews never
inflate the score — they are explicitly flagged with `reviews_unknown = true`
and rendered as "Unknown" in the UI.

## Self row logic

The client's own domain is scanned with the same Firecrawl + scoring pipeline
and stored with `is_self = true`. The UI pins it at the top of the matrix so
gaps are directly comparable. Without this, "Where you're behind" would be
meaningless.

## Partial failure behavior

- Single cluster SERP fail → continue, mark `partial`.
- Single competitor Firecrawl fail → that row's pillars become `unknown`,
  `score_confidence` drops, scan continues.
- All clusters fail → status `failed`, `error_message` populated.
- The UI surfaces partial/failed status with non-cryptic messages.

## Blueprint integration

`summarizeLatestCompetitorScan` returns a `CompetitorMatrixSummary` consumed by
`generateLeadEngineBlueprint`. The generator builds a rich
`competitive_position` section (metrics, self + competitor items, evidence,
top gaps). The route renders it via `CompetitiveBlock`.

The Lead Engine Score and Financial Impact remain driven by goal + masterplan
+ market signals — competitor data informs the qualitative narrative and the
"Where you're behind" callouts. We deliberately do not let one scrape swing
the headline score.

## Non-goals (V1)

- No recurring rank tracking.
- No GBP API integration (review counts are best-effort from scrape).
- No Yelp / BBB / Trustpilot scraping.
- No backlink data.
- No scheduled scans (manual trigger only).
- No publishing / WordPress writes.
- No execution task creation from gaps (that is the Execution Task Engine ticket).
