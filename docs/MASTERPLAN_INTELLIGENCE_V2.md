# Masterplan Intelligence V2 (Sprint E)

Backend-only sprint that makes masterplan items strategic execution, not generic tasks. Frontend wiring is deferred to the planned redesign.

## What changed

### 1. Input Quality Analyzer — `src/lib/shared/masterplan/inputQuality.ts`
- `analyzeGoalInputQuality({ goal, bp })` returns `{ warnings, serviceQuality, locationQuality, closeRateQuality, trackingQuality, readiness, specificServices, specificLocations, broadServices, broadLocations, riskFlags }`.
- Helpers `isGenericService(s)` and `isBroadLocation(l)` used by the generator to filter per-value.
- Existing per-item `evaluateInputQuality(...)` kept for proposal generation backwards compat.

Broad terms detected:
- Services: `leadgen`, `seo`, `marketing`, `growth`, `service(s)`, `content`, `social`, `web`, `lokale vindbaarheid`, `diensten`, …
- Locations: `usa`, `united states`, `nederland`, `belgium`, `eu`, `global`, `online`, …

Close-rate quality:
- missing or `<=0` → `missing` + high warning
- `>0.7` → `high` + medium warning ("confirm with real sales data")

### 2. Generator — `src/lib/shared/masterplan/generator.server.ts`
Per-value branching instead of "loop and emit":
- **Specific service** → `Build or improve {service} page for {primaryLocation}` (or just `service`) with metadata: `readiness=ready`, `linkedService`, `linkedLocation`, `goalContribution`, `successMetric`, `evidence`.
- **Generic-only service_focus** → one item: `Define high-value service offers before building service pages` with `readiness=needs_context`, `missingContext=['specific_services']`, playbook.
- **Specific location** → location_page item with `readiness=ready` + evidence.
- **Broad-only locations** → one item: `Define specific target cities or service areas` with `readiness=needs_context`, `missingContext=['specific_locations']`, playbook.
- **Tracking / GBP / Reviews / Reporting** → `readiness=manual_task` with `playbookSteps[]` instead of "Manual task for now".

`GenerationResult` now also exposes `qualityWarnings` and `inputQuality` (full report). Confidence calc penalizes generic/broad inputs.

### 3. Item metadata contract — `ItemMetadata`
Stored in existing `masterplan_items.metadata` jsonb (no schema migration):
```
readiness: 'ready' | 'needs_context' | 'manual_task' | 'blocked'
needsContext?: boolean
missingContext?: string[]
successMetric?: string
playbookSteps?: string[]
linkedService?: string
linkedLocation?: string
goalContribution?: string
evidence?: { source, reason }[]
```

### 4. Proposal generation guard — `proposalGen.functions.ts`
Before LLM call, checks `item.metadata.readiness`:
- `needs_context` → returns `{ ok:false, reason:'needs_context', missingContext, playbookSteps }`.
- `manual_task` → returns `{ ok:false, reason:'manual_task', playbookSteps }`.

Existing goal-level `evaluateInputQuality` guard remains as a backstop for items created before V2.

## What did NOT change
- No Safe Publishing.
- No WordPress writes.
- No tracking integrations.
- No Execution Board rebuild.
- No DB schema changes (everything fits in existing `metadata` jsonb + `missing_context`).
- No UI changes — frontend is rebuilt later during redesign.

## Acceptance — manual regression
- **Weak input** (`service_focus=["Leadgen"]`, `locations=["USA"]`): no `Build service page: Leadgen`, no `Build location page: USA`, instead two `needs_context` items. Proposal gen on those returns `needs_context`.
- **Strong US HVAC** (`["AC repair", "Emergency HVAC repair"]` × `["Dallas, TX", "Plano, TX"]`): service_page and location_page items per value, all `readiness=ready`.
- **NL local** (`["Spoed loodgieter"]` × `["Amsterdam", "Diemen"]`): same, no broad warnings.
- Tracking / GBP / reviews / reporting always include `playbookSteps`.
