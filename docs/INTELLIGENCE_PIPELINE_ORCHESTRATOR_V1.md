# Intelligence Pipeline Orchestrator V1

## Purpose

Replace the "click each module button in the right order" operator
workflow with a single, dependency-aware run that walks every existing
intelligence module in order and records honest per-stage state on one
row in `intelligence_runs`.

V1 wraps existing modules. It does NOT build new intelligence, execution,
publishing, ranking ingestion, or tracking integrations.

## Pipeline stages (in order)

1. `site_audit` — reuses recent audit, else triggers `runAudit`
2. `page_intelligence` — `analyzePageIntelligenceForAudit`
3. `business_profile_draft` — reuses or triggers analyzer job
4. `tone_profile_draft` — reuses or triggers `analyzeToneProfileForTenant`
5. `gbp_intelligence` — detection only (no live GBP API)
6. `market_scan` — detection only; needs services + locations on goal
7. `competitor_scan` — detection only; needs completed market scan
8. `tracking_baseline` — **placeholder** (V1.1)
9. `ranking_baseline_placeholder` — **placeholder** (V1.1)
10. `growth_snapshot` — `buildGrowthIntelligenceSnapshot`
11. `blueprint_draft` — derived from snapshot
12. `masterplan_draft` — detection of active masterplan
13. `operator_review_ready` — gate aggregating BP / tone / GBP / blueprint / masterplan

## Dependency rules

- `page_intelligence` requires `site_audit`.
- `competitor_scan` requires `market_scan` completed.
- `blueprint_draft` requires `growth_snapshot` completed.
- `operator_review_ready` reads gates from the five upstream draft stages.

## Failure policy

Fail-soft by default. The run continues past any non-foundational failure.

Foundational failures (`site_audit`, `growth_snapshot`) hard-stop the run
and set status `failed`. Everything else is recorded per-stage as:

- `complete` — artifact exists and is fresh.
- `partial` — artifact exists but needs operator review/approval.
- `skipped_needs_context` — missing inputs (services, locations, GBP, …).
- `blocked_dependency` — upstream stage did not complete.
- `failed` — stage threw; pipeline continues.

The final run status is derived: `running` while any stage runs, `failed`
on foundational failure, otherwise `partial` if anything is non-complete,
else `completed`.

## Stale / invalidation policy

`markDownstreamStagesStale({ tenantId, sourceModule })` flips downstream
stages on the latest run to `stale` when an upstream module changes
(see `STALE_DEPENDENCY_MAP`). V1 only marks — it does NOT auto-re-run.
Operator clicks "Continue / advance" to refresh stale stages.

## What V1 does NOT do

- No new intelligence sources or external APIs.
- No execution task engine, no WordPress writes, no publishing.
- No tracking integration or ranking ingestion (placeholder stages).
- No automatic stage re-runs on stale; operator triggers `advance`.
- No background worker; `advance` runs synchronously inside the server fn.

## How the UI uses it

- `/growth/flow` — `IntelligencePipelinePanel` renders latest run with
  Start / Continue / Refresh actions, progress bar, and per-stage rows
  showing status, message, error, next action, output refs, and timings.
  Start is disabled when goal or connected site is missing.
- `/growth/intelligence` — `IntelligencePipelineSummary` shows a compact
  card with run status + current stage and a link to `/growth/flow`. The
  full pipeline table is intentionally NOT duplicated here.

Both UIs call the existing server fns:
- `startIntelligenceRunFn`
- `advanceIntelligenceRunFn`
- `getLatestIntelligenceRunFn`

## Dallas regression checklist

For the Dallas HVAC test tenant:

- [ ] `/growth/flow` loads.
- [ ] Start button enabled once growth goal + connected site exist.
- [ ] Start → creates a row in `intelligence_runs` and advances.
- [ ] Continue / advance updates stage statuses honestly.
- [ ] `tracking_baseline` shows placeholder / partial.
- [ ] `ranking_baseline_placeholder` shows `skipped_needs_context`.
- [ ] `growth_snapshot`, `blueprint_draft`, `masterplan_draft` appear
      downstream of intelligence stages.
- [ ] `/growth/intelligence` shows the latest run summary.
- [ ] No execution / publishing UI appears in this sprint.
