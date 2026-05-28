# GBP Intelligence V1

> Status: implemented (manual-first)
> Files: `src/lib/shared/gbpIntelligence/*`, `src/lib/gbpIntelligence/*`, `src/routes/_authenticated/growth.gbp.tsx`

## Purpose

Capture Google Business Profile signals for a tenant and feed them into the
Lead Engine Blueprint so local trust + visibility stop being a blind spot.
V1 is manual-first: operators review the live profile and record what they
see. No Google API integration yet.

## Data model

`gbp_profiles` (one active row per tenant + growth goal):

- status: `not_connected` | `manual_review` | `reviewed` | `connected` | `unavailable`
- source: `manual` | `operator_review` | `google_api` | `import`
- identity: business_name, profile_url, primary_category, secondary_categories
- reviews: rating, review_count (both nullable — empty = unknown, never inflated)
- services + service_area
- contact: address, phone, website_url
- activity: photos_status, posts_status, nap_consistency
- derived scores: completeness_score, trust_score, local_visibility_score
- gaps + recommendations (JSON, derived by `summarizeGbpProfile`)

RLS: tenant members can read; operators+ can write.

## Scoring (conservative)

- Completeness: structural fields present (name, category, services, area, contact, photos, posts).
- Trust: review count tiers, rating tiers, NAP consistency, photos, status. **Capped at 85 in V1** — no API verification means we never claim a perfect trust score.
- Local visibility: categories, services, service area, review density, posts, photos.
- Unknown fields never inflate scores. They surface as gaps.

## Blueprint integration

`summarizeGbpProfileFn` returns a `GbpSummary` that the Blueprint generator
consumes (in addition to legacy `gbpData`). The summary now drives:

- Current Lead Engine — shows status, source, scores, and key identity bits when reviewed.
- Growth Gap — specific gaps (reviews unknown, category missing, photos weak, NAP unconfirmed, etc.) instead of a generic "GBP not connected" line. If no major gaps, GBP is treated as a current strength.
- Lead Engine Map — GBP node status is `missing` / `planned` / `active` based on summary status + scores. The Reviews+Ratings trust builder cites real rating/review count when known.
- Client Inputs — generic "can we get access?" only appears when no profile exists. When reviewed, only specific missing fields are asked.
- Risks & Assumptions — adds an explicit "GBP data is operator-reviewed" assumption for manual sources.
- Data availability — `missing` / `placeholder` / `partial` / `available` based on status.

## UI

`/growth/gbp` is a manual review form: status, source, identity, reviews,
services, contact, activity (photos/posts/NAP), notes. Shows current
completeness/trust/local visibility tiles + gaps + recommendations. Save or
"Save & mark reviewed".

Linked from the Blueprint top nav.

## What V1 intentionally does NOT do

- No Google Business Profile OAuth or Places API calls.
- No automatic review pulling, photo counts, post detection.
- No multi-location aggregation.
- No competitor GBP comparison beyond what already lives in Competitive Intelligence.
- No ranking baseline (separate ticket).
- No execution task auto-generation from GBP gaps yet.

## Future Google API path

When we wire the real Places / Business Profile API:

- Set `source: "google_api"`; remove the V1 trust-score cap of 85.
- Replace manual photo/posts/NAP fields with API-derived signals.
- Add review velocity tracking via `review_velocity` JSON.
- Backfill historical scores and add change deltas.
