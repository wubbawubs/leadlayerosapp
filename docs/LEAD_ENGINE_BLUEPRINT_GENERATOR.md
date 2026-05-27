# Lead Engine Blueprint Generator (Ticket 1b)

> Version: 1.0
> Status: Implemented (data layer only — UI lives in Ticket 1c)
> Files: `src/lib/shared/blueprint/schemas.ts`, `src/lib/shared/blueprint/generator.ts`

## Purpose

Assemble the **structured Lead Engine Blueprint object** from existing
internal data + scoring outputs. The generator is the "compiler" that turns
raw intelligence into a coherent client-facing narrative.

It does **not**:

- render UI
- write to a database
- call external APIs (DataForSEO, GBP, ranking, competitors)
- publish anything

Those belong to later tickets.

## Relation to Scoring Framework (Ticket 1a)

`generator.ts` consumes the five pure functions from `scoring.ts`:

| Score | Used for |
|---|---|
| `calculateLeadEngineScore` | Title, summary, engine score block |
| `calculateConversionReadinessScore` | Page diagnostics, growth gap |
| `calculateDemandCoverageIndex` | Demand coverage block, placeholder logic |
| `calculateGrowthVelocityModel` | 12-month projection score block |
| `calculateFinancialImpactScenarios` | Financial model (conservative / expected / aggressive) |

The generator adapts the input objects to the scoring-framework input shape
(`toScoringInputs`) so the rest of the app can pass real entities without
duplicating field names.

## Relation to UI (Ticket 1c)

The output object is the contract Ticket 1c will render. UI must:

- never invent fields not present in the schema,
- treat `placeholder: true` sections as explicitly pending,
- never render fake numbers when `dataAvailability` reports `missing` or `placeholder`.

## Inputs (`GenerateBlueprintInput`)

| Field | Required | Notes |
|---|---|---|
| `tenantId` | optional | Pass-through identifier. |
| `growthGoal` | required | Target, current count, close rate, lead value, services, locations. |
| `businessProfile` | optional | Vertical, offer, ICP, CTA, proof points, language. |
| `toneProfile` | optional | Not yet consumed by the generator; reserved for narrative tightening. |
| `masterPlan` | required | Plan-level confidence + id. |
| `masterplanItems` | required | Used for phased roadmap, services/locations covered, next actions. |
| `pageIntelligence` | required | Drives Page Diagnostics + Current Lead Engine. |
| `auditSummary` | optional | Drives site component of Lead Engine Score. |
| `marketData` | optional | If absent, Market Intelligence is a placeholder. |
| `competitorData` | optional | If absent, Competitive Position is a placeholder. |
| `gbpData` | optional | If absent, GBP is flagged as unknown in Current State + Map. |
| `rankingData` | optional | If absent, Reporting loop is flagged as pending. |
| `trackingData` | optional | Drives tracking warnings + measurement layer status. |
| `now` | optional | Deterministic timestamp for snapshots. Defaults to epoch. |

## Output (`LeadEngineBlueprint`)

| Field | Description |
|---|---|
| `title`, `summary` | Client-facing headline + one-line. |
| `language` | Resolved from business profile → goal → masterplan → `en`. |
| `status` | `draft` until Ticket 1c lifecycle hooks. |
| `generatedAt`, `schemaVersion` | Snapshot metadata. |
| `scores` | Five score blocks: value, label, reasoning[], missingInputs[], confidence. |
| `sections` | Ordered list of `BlueprintSection`s — see below. |
| `leadEngineMap` | Traffic → landing → conversion → trust → measurement nodes. |
| `financialModel` | Conservative / expected / aggressive scenarios + notes. |
| `assumptions` | Risks + caveats (no guarantees, scenario model only, etc.). |
| `clientQuestions` | Confirmations + access requests with reason + category. |
| `nextActions` | First-30-days masterplan items, no duplication of plan logic. |
| `dataAvailability` | `available` / `placeholder` / `missing` per intelligence layer. |
| `confidence` | Average of score confidences. |

## Sections

Order is fixed. All sections always present.

1. **Goal & Lead Math** — target, timeframe, close rate, required leads/month, current leads/month, warnings for high or missing close rate.
2. **Current Lead Engine** — pages, GBP status, tracking status, known unknowns.
3. **Growth Gap** — tracking, conversion, proof, GBP, service/location, reporting loop.
4. **Market Intelligence** — placeholder when `marketData` missing. Intended demand listed as `service — location` pairs. Never fake volumes.
5. **Competitive Position** — placeholder when `competitorData` missing. Lists what will be compared once Ticket 4 runs.
6. **Page Diagnostics** — top pages ranked by gaps. CTA / trust / thin flags + recommendation.
7. **Strategy** — fixed three-step rationale (measurement → expansion → trust/depth/reporting).
8. **12-Month Roadmap** — phases drawn from masterplan items; later phases stay strategic.
9. **Lead Engine Map** — flattened map nodes with `layer` meta.
10. **Tracking & Measurement Framework** — leading + lagging indicators with kind meta.
11. **Client Inputs Needed** — dynamic list of confirmations.
12. **Risks & Assumptions** — no guarantees, scenario-only revenue, proof gaps, pending intel modules.
13. **Next Actions** — top 8 first-30-days items.

## Placeholder Rules

- A placeholder section has `placeholder: true` and `pendingDataFrom` naming the ticket that will fill it.
- Placeholders **must** include a warning explaining what is intentionally not shown.
- Placeholders **must not** include fabricated numbers (volumes, competitor counts, review counts, rankings).

## Safety Rules

- Pure function. No DB, no network, no randomness.
- Missing data degrades the output — it never throws.
- Financial scenarios only fill `estimatedMonthlyRevenue` / `estimatedAnnualRevenue` when both `closeRate` and `leadValue` are present. Otherwise those fields are `null` and `financialModel.available` is `false`.
- No phrase in the output should imply guaranteed leads, rankings, or revenue. The Risks & Assumptions section makes this explicit.

## Dallas Regression Fixture

`DALLAS_FIXTURE_INPUT` is exported from `generator.ts` as a dev reference.
With this input, `generateLeadEngineBlueprint` returns a blueprint where:

- `title` is `"Lead Engine Blueprint for Dallas Comfort Air"`.
- `sections` containing `market_intelligence` and `competitive_position` have `placeholder: true`.
- `financialModel.available` is `true` (close rate 0.3 + lead value 850 are present).
- `sections.find(s => s.type === "roadmap")` contains items in the `first_30_days`, `days_31_60`, and `days_61_90` buckets.
- No fabricated search volumes or competitor names appear anywhere in the object.
- `dataAvailability.gbpData === "missing"` and `dataAvailability.trackingData === "placeholder"`.

## Next

Ticket 1c — Blueprint View + internal/shareable preview. Render the object;
do not re-derive its contents.

## Ticket 2b — Market Intelligence integration

The generator now accepts `marketDemandSummary: MarketDemandSummary` (from
`summarizeMarketScan()`). When present and `available`:

- `sectionMarketIntelligence` renders rich items: top clusters (with intent,
  opportunity score, priority, representative keywords), top services, top
  locations, and intent breakdown. Metrics include keyword count, total
  demand, top service/location, source label, and confidence.
- `toScoringInputs` maps the summary into the scoring framework's
  `marketData` (totalAddressableVolume + clusterCount). `clustersCovered`
  stays 0 until Ticket 6 (Ranking Baseline) provides real coverage.
- `dataAvailability.marketData` flips to `available`.
- `buildAssumptions` swaps the "Market data pending" assumption for either
  "Market data available" or, for `manual` / `synthetic_fixture` sources,
  "Market data is manual/synthetic" with a warning to replace via DataForSEO.

When `marketDemandSummary` is absent, behavior is unchanged: the section
renders the existing placeholder ("Pending market scan").

Safety rule: synthetic/manual data is always labelled — the generator and
View never present it as verified market data.
