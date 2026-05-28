# Growth Intelligence Snapshot V1

> Status: V1 implementation
> See also: `CLIENT_JOURNEY_AND_OS_ARCHITECTURE.md`, `WORDPRESS_INTEGRATION_ARCHITECTURE.md`, `PRODUCT_FLOW_ORCHESTRATION_V1.md`
>
> The Snapshot is the **read model**. The derived **Product Flow** (lifecycle
> stage, review gates, automation checklist, blockers, client/operator copy)
> lives in `src/lib/shared/productFlow/` and is documented in
> `PRODUCT_FLOW_ORCHESTRATION_V1.md`.

## Purpose

One normalized truth object — the **brainstem** — that reads every
existing intelligence module and exposes a single shape consumed by
Blueprint, Masterplan, Execution (future), WordPress delivery (future),
and the Monthly Loop.

No new data producers. The Snapshot only **normalizes** existing sources.

## Schema overview

`GrowthIntelligenceSnapshot` (see
`src/lib/shared/growthIntelligence/schemas.ts`) contains:

- `status` — overall (missing / collecting / partial / ready / review_required),
  readinessScore 0–100, aggregate confidence 0–1, primary next best action.
- Per-module slices, each with `status`, `confidence`, `missing`:
  `goal`, `business`, `tone`, `website`, `pages`, `market`, `competitors`,
  `gbp`, `tracking`, `ranking`, `masterplan`.
- `dataAvailability` — flat module matrix for UI cards.
- `missingContext` — typed list of critical gaps with severity + next action.
- `warnings` — operator-facing strings (e.g. temporary domain).
- `nextActions` — primary + secondary actions in priority order.

Every slice uses the same `ModuleStatus` vocabulary:
`missing | placeholder | partial | available | reviewed | connected`.

## Source modules

| Slice         | Source                                                  |
| ------------- | ------------------------------------------------------- |
| goal          | `growth_goals` (active)                                 |
| business      | `business_profiles_v2`                                  |
| tone          | `tone_profiles`                                         |
| website       | `site_connections` + latest `audits` row                |
| pages         | `page_intelligence` for latest audit                    |
| market        | latest `market_scans` (+ keywords, clusters, summary)   |
| competitors   | latest `competitor_scans` (+ persisted summary)         |
| gbp           | latest `gbp_profiles` row → `summarizeGbpProfile`       |
| masterplan    | active `master_plans` + `masterplan_items`              |
| tracking      | placeholder; honors `growth_goals.tracking_notes` only  |
| ranking       | placeholder (started in a later sprint)                 |

## Readiness logic

Pure function in `src/lib/shared/growthIntelligence/readiness.ts`.

Per-module base score by status: missing 0, placeholder 30, partial 60,
available 80, reviewed 95, connected 90. Confidence lifts the high end
of available/reviewed/connected. Weighted by:

```
goal 10, business 12, tone 8, website 12, pages 12,
market 12, competitors 10, gbp 8, masterplan 8, tracking 8
```

Overall status is derived from readiness + presence of goal / business /
masterplan. Tracking and ranking can stay missing without blocking
Blueprint, but they cap the monthly-loop readiness.

## Next-best-action logic

Pure function in
`src/lib/shared/growthIntelligence/nextBestAction.ts`. Returns primary +
up to 4 secondary actions, in this priority order:

1. Create growth goal
2. Complete business profile
3. Review tone profile
4. Connect site → Run audit → Run page intelligence
5. Run market scan → Run competitor scan
6. Review GBP profile
7. Generate masterplan
8. Set up tracking
9. Create execution tasks
10. Review Blueprint (fallback)

## Consumers

- **Blueprint** (now): the dedicated `/growth/intelligence` route renders
  the snapshot directly. Blueprint route currently still composes inputs
  from per-module fetchers (no breaking change in V1); the next iteration
  will swap that for a single snapshot read.
- **Dashboard** (`/app`): exposes the primary next best action + a link to
  the Intelligence overview.
- **Intelligence Pipeline Orchestrator V1**: the snapshot is the
  `growth_snapshot` stage inside `intelligence_runs`. See
  `docs/INTELLIGENCE_PIPELINE_ORCHESTRATOR_V1.md`.
- **Masterplan, Execution, WordPress, Monthly Loop**: future consumers.

## Non-goals (V1)

- No new data producers, no scrapers, no APIs.
- No mutation of any module's state.
- No Execution Task Engine or WordPress writes.
- No ranking baseline.
- No major UI refactor of existing module pages.
- The Blueprint generator is not refactored to consume the snapshot yet;
  that swap happens after the Snapshot is validated against real tenants.

## Server API

```ts
getGrowthIntelligenceSnapshot({
  data: { tenantId, growthGoalId?, siteId? },
}) // → { snapshotJson: string }
```

The snapshot is returned as a JSON string to keep TanStack's
serializable-typing checker happy across nested unions. Parse on the
client into `GrowthIntelligenceSnapshot`.

## Files

```
src/lib/shared/growthIntelligence/
  schemas.ts
  readiness.ts
  nextBestAction.ts

src/lib/growthIntelligence/
  buildGrowthIntelligenceSnapshot.server.ts
  growthIntelligence.functions.ts

src/routes/_authenticated/
  growth.intelligence.tsx
```

## Navigation (cleanup sprint)

The app navigation now groups around the OS flow:

- **Growth**: Goal · Intelligence · Blueprint · Masterplan · Execution
- **Website**: Sites (Audits + WordPress to follow)
- **Settings**: Business profile · Tone profile

GBP is no longer a top-level item — it lives inside Intelligence (and is
still linked from Blueprint). Blueprint, Masterplan and Execution headers
now position themselves explicitly against the Snapshot:

- Blueprint: "Client-facing growth strategy generated from the Growth
  Intelligence Snapshot."
- Masterplan: "Operator-facing roadmap generated from the Blueprint and
  Growth Intelligence Snapshot."
- Execution: "Execution preview — full Execution Task Engine comes next."
