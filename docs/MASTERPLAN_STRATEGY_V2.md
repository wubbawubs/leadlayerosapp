# Masterplan Strategy V2

Sprint E2 upgrade of the Masterplan generator. The plan is the heart of the
OS — Execution Tasks (next sprint) will be derived from these items, so the
masterplan must prioritize like an operator, not like a checklist.

## What changed

### 1. Phase logic
Every item carries `metadata.phase`:
- `first_30_days` — tracking, GBP foundation, primary CTA, highest-intent
  existing pages, urgent context gaps.
- `days_31_60` — missing high-intent service pages, first 1–2 location
  pages, review flow.
- `days_61_90` — supporting content, additional locations, monthly reporting.
- `backlog` — extra locations, lower-intent services, overflow.

Phase limits: 6 / 6 / 5. Overflow is demoted to backlog.

### 2. Lead intent scoring (`phasing.ts`)
Service items get `{ leadIntent, urgency, value, category, reason }`.
- Emergency → highest intent, 30-day fast track.
- Repair → high intent (cooling year-round, heating seasonal).
- Installation → high value but slower cycle → 60 days.
- Maintenance → recurring, lower urgency → 90 days.

### 3. Existing vs missing page
If Page Intelligence finds an existing service page for a high-intent
service, an **optimization** item beats a **new build** item for a
lower-intent service. Optimization on an existing high-intent page lands
in the first 30 days; new builds wait until foundation is set.

### 4. Manual playbooks (`playbooks.ts`)
Tracking, GBP, Reviews, Reporting and Conversion items carry English
`playbookSteps` arrays. The Execution Task Engine will hydrate these into
concrete tasks.

### 5. Confidence recalibration
Starts at 0.95, penalized by missing signals (target, close rate, services,
locations, tracking, business profile, vertical, proof, GBP, page intel).
Each penalty is stored in `generatedFrom.confidenceReasons` so the UI can
explain why confidence is not 100.

### 6. Locale-aware copy
All plan content (titles, descriptions, reasons, summary, strategy,
constraints) is now in English. UI labels stay Dutch.

## Files
- `src/lib/shared/masterplan/phasing.ts` — new
- `src/lib/shared/masterplan/playbooks.ts` — new
- `src/lib/shared/masterplan/generator.server.ts` — rewritten V2
- `src/lib/shared/masterplan/schemas.ts` — `MasterplanPhase`, `itemPhase`,
  `roadmapBucket` now phase-aware
- `src/routes/_authenticated/growth.masterplan.tsx` — 4-column phased
  roadmap, phase badge, priority reason, playbook details, confidence
  reasons

## Acceptance — Dallas Comfort Air
- Confidence < 100 (vertical/proof/GBP penalties applied)
- First 30 days: tracking, GBP, conversion, AC repair / Emergency HVAC
- Furnace repair / installation pushed to 60+ days
- Max ~6 items per phase, rest in backlog
- Manual items carry playbooks
- Plan copy is English

## Not in scope
- Execution Task Engine
- Safe Publishing
- WordPress writes
