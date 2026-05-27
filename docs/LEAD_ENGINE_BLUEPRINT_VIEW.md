# Lead Engine Blueprint — View (Ticket 1c)

> Version: 1.0
> Status: Implemented (internal preview, generated-on-load)
> Files: `src/routes/_authenticated/growth.blueprint.tsx`

## Purpose

Render the structured `LeadEngineBlueprint` produced by
`generateLeadEngineBlueprint()` as a client-facing strategic dashboard.
This is the first layer where the Blueprint becomes felt rather than
inferred from JSON.

## Route

- `/growth/blueprint` (under `_authenticated`)
- Added to the Growth nav group in `/app`.
- A "Lead Engine Blueprint" card on `/app` links here and gates on the
  upstream requirements (growth goal + masterplan).

## Data loading

V1 loads the minimum entities needed to call the generator:

- `getActiveGrowthGoal({ tenantId })` → `growthGoal`
- `getActiveMasterplan({ tenantId })` → `masterPlan`
- `listMasterplanItems({ tenantId, masterPlanId })` → `masterplanItems`

V1 deliberately omits:

- `businessProfile` (V2 schema is structured and complex; the generator
  handles undefined gracefully).
- `pageIntelligence` (per-audit, requires audit selection — pulled in a
  later iteration).
- `marketData`, `competitorData`, `gbpData`, `rankingData`, `trackingData`
  (none exist as repos yet — the generator renders these as placeholders).

`generateLeadEngineBlueprint(input)` is pure and runs in `useMemo` on the
client. No database storage in V1 — the Blueprint regenerates on each
load from upstream data. Storage / lifecycle (`review_ready`, `approved`)
is parked until upstream intelligence modules land.

## Sections rendered

| # | Section | Component |
|---|---|---|
| 1 | Hero | `Hero` — title, summary, status, generatedAt, confidence |
| 2 | Scoreboard | `Scoreboard` — 5 score cards with reasoning + missing inputs |
| 3 | Goal & Lead Math | `Section` (primary accent) |
| 4 | Current Lead Engine | `Section` |
| 5 | Growth Gap | `Section` (warning accent) |
| 6 | Market Intelligence | `PlaceholderSection` — "Pending market scan" |
| 7 | Competitive Position | `PlaceholderSection` — "Pending competitor scan" |
| 8 | Page Diagnostics | `PageDiagnostics` — empty-state when no page intelligence |
| 9 | Strategy | `Section` (primary accent) |
| 10 | 12-Month Roadmap | `Roadmap` — phase cards |
| 11 | Lead Engine Map | `LeadEngineMapBlock` — 5 layer columns with status dots |
| 12 | Tracking & Measurement | `TrackingPlan` — leading vs lagging |
| 13 | Financial Impact | `FinancialModelBlock` — 3 scenarios |
| 14 | Client Inputs | `ClientInputs` |
| 15 | Risks & Assumptions | `Section` |
| 16 | Next Actions | `NextActions` — links to masterplan items |
| 17 | Data availability | `DataAvailabilityBlock` — Available / Placeholder / Missing |

## Placeholder behavior

- Market Intelligence + Competitive Position render as dashed-border
  cards with a "Pending market scan" / "Pending competitor scan" badge
  and a "Will be filled by: Ticket 3 / Ticket 4" subtitle.
- Page Diagnostics renders an empty-state when no page intelligence is
  loaded — invites running an audit, does not look broken.
- Data availability block at the bottom mirrors
  `blueprint.dataAvailability` so the operator sees exactly which
  intelligence modules are still pending.

## Actions

Hero exposes:

- "View masterplan" → `/growth/masterplan`
- "View execution board" → `/growth/execution`

Per-action "Open in masterplan" links appear on `NextActions` items that
carry a `sourceMasterplanItemId`.

A "Regenerate Blueprint" button is not needed in V1 because the Blueprint
is regenerated on every page load. When storage lands, that button will
trigger a persisted regeneration.

## What is intentionally not included

- No DataForSEO / market scan call (Ticket 3).
- No competitor scan (Ticket 4).
- No GBP integration (Ticket 5).
- No ranking baseline (Ticket 6).
- No WordPress / publishing surface.
- No Blueprint storage table or status lifecycle (`review_ready`,
  `approved`). Status badge in the Hero renders the literal
  `blueprint.status` ("draft") for now.
- No PDF export or shareable public URL — those require storage and a
  signed-URL strategy and would expand the surface area beyond Ticket 1c.

## Regression check (Dallas)

With Dallas-shaped upstream data:

- Hero shows "Lead Engine Blueprint for Dallas Comfort Air".
- Market Intelligence + Competitive Position render as professional
  placeholders, not broken cards.
- Financial Impact scenarios show monthly + annual revenue (close rate
  0.3 and lead value 850 are present in the fixture).
- 12-Month Roadmap shows First 30 days / Days 31–60 / Days 61–90 phase
  cards with masterplan items listed.
- No fabricated search volumes, competitor names, or review counts
  appear anywhere.
- Lead Engine Map's GBP node renders as `unknown` (no GBP data).

## Future

- Persist generated Blueprints in a table (`lead_engine_blueprints`)
  with status lifecycle.
- Shareable URL (signed, read-only) for client review.
- PDF export of the rendered Blueprint.
- Wire page intelligence + audit summary into the generator input once
  the per-audit selection UX is decided.
- Replace placeholder sections with real intelligence as Tickets 3–6
  land.

## Ticket 2b — Market Intelligence rendering

The Market Intelligence section now switches between two states:

- **Placeholder** (no `marketDemandSummary`): existing dashed-border
  "Pending market scan" card.
- **Rich** (summary available): `MarketIntelligenceBlock` renders the
  source badge (Synthetic fixture / Manual entry / DataForSEO), a metrics
  grid, top demand clusters (with opportunity, intent, priority, volume,
  representative keywords), top services and top locations pivoted by
  total demand, and an intent-breakdown row. Synthetic/manual scans show
  an amber source badge and an explicit warning in the section.

The view consumes `summarizeLatestMarketScan({ tenantId, growthGoalId })`
and passes the result into the generator. No external API calls.
