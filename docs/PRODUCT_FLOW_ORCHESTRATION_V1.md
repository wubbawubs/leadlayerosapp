# Product Flow Orchestration V1

The product flow turns a pile of modules into a guided OS journey. It is a
**pure derivation** of the Growth Intelligence Snapshot — no new tables, no
new automation, no execution writes. Its job is to make the answer to
"where is this client, what is automated, what needs review, what is
blocked" obvious.

## Layers

1. **Client-facing flow** — simple, friendly lifecycle status.
2. **Operator flow** — direct, surfaces partial / failed / missing detail.
3. **Software automation flow** — the pipeline checklist.

## Lifecycle stages (`ClientLifecycleStage`)

| Stage | Trigger |
|---|---|
| `onboarding` | No goal or no site |
| `collecting_intelligence` | Goal + site exist, core modules incomplete |
| `operator_review` | Intelligence exists but business/tone/gbp/competitor need review |
| `blueprint_ready` | Core intelligence reviewed; blueprint can be generated |
| `client_review` | Blueprint ready, awaiting client approval |
| `masterplan_ready` | Active masterplan exists |
| `execution_ready` | Masterplan has active items, no critical blockers |
| `in_execution` | Execution Task Engine produces artifacts (future) |
| `monthly_review` | Tracking + ranking baseline + monthly loop (future) |

Stage labels and client-visible copy live in `schemas.ts` so they can be
reused by any UI that needs them (dashboard card, flow page, future
client portal).

## Review gates (`ReviewGate`)

- `business_profile`
- `tone_profile`
- `gbp_profile`
- `intelligence_snapshot`
- `blueprint`
- `masterplan`
- `execution_artifacts` (future)
- `publishing_bundle` (future)

Each gate is `not_ready | ready_for_review | approved | blocked`.

## Automation checklist

Pipeline checklist: goal, site, audit, page intelligence, business profile,
tone profile, market scan, competitor scan, GBP, snapshot, blueprint,
masterplan, tracking, ranking, WordPress.

Each item is `not_started | running | complete | partial | failed | blocked`.

## Rules

- No fake completion. Missing modules show missing.
- Partial competitor scan is allowed but marked partial.
- Tracking/ranking missing does **not** block Blueprint — it blocks the
  monthly loop only.
- `execution_ready` requires masterplan + active items + core intelligence.
- Client-visible copy never exposes raw partial/error details.

## Files

- `src/lib/shared/productFlow/schemas.ts` — types, labels, copy.
- `src/lib/shared/productFlow/resolve.ts` — pure resolver.
- `src/lib/productFlow/productFlow.functions.ts` — `getProductFlowState` server fn.
- `src/routes/_authenticated/growth.flow.tsx` — `/growth/flow` operator page.
- `src/routes/_authenticated/app.tsx` — compact lifecycle card on `/app`.

## What's not in V1

- No new DB tables. Stage is derived, not stored.
- No execution task engine.
- No WordPress writes.
- No client portal (client copy is exposed in the operator view so we can
  validate before building the portal).
- No monthly loop / tracking ingestion.

## Next

1. WordPress Connection + Inventory V1.
2. Execution Task Engine + Artifacts V1 (will set `in_execution`).
3. Publishing Gate + WordPress Draft Publishing V1.
4. Tracking + Monthly Loop (will activate `monthly_review`).
