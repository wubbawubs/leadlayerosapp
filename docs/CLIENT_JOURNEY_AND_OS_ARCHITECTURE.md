# Client Journey & OS Architecture

> Version: 1.0
> Status: Canonical product architecture source
> Supersedes ad-hoc next-ticket selection. All future sprints reference this doc and `WORDPRESS_INTEGRATION_ARCHITECTURE.md`.

This is the strategic reset doc. It defines how LeadLayer behaves as an
operating system — who does what, what runs automatically, where humans
gate, and how the layers connect. It is **not** a feature spec. No code
changes here.

---

## A. Product North Star

LeadLayer turns a business growth goal into a managed lead engine:

```
Goal → Intelligence → Blueprint → Masterplan → Execution → Delivery → Tracking → Monthly Loop
```

The product is a Local Lead Growth OS, not an SEO tool, not a proposal
generator, not a dashboard. Every module exists to answer one question
each month:

> Did the work we did this month bring the client closer to their growth goal?

If a module cannot be traced back to that loop, it is decoration.

---

## B. Actors

Three actors. Roles are strict on purpose.

### Client

**Does:**
- Add their website
- Confirm growth goal
- Answer simple business questions
- Provide or connect GBP info
- Approve high-level direction
- See progress and monthly results

**Does NOT:**
- Operate scanners or run buttons
- Interpret raw audit output
- Choose execution priorities
- Approve technical artifacts
- Touch publishing

### Operator (us)

**Does:**
- Review AI/intelligence outputs
- Fix wrong assumptions
- Approve Business Profile, Tone Profile, Blueprint, Masterplan, artifacts, publishing bundles
- Decide what is safe to publish
- Handle claims / proof / sensitive copy
- Call client when needed

**Does NOT:**
- Run raw scrapers manually for every client
- Hand-write strategy from scratch
- Generate copy unaided

### Software

**Does:**
- Crawl site, audit, run page intelligence
- Draft Business Profile and Tone Profile
- Run market and competitor scans
- Structure GBP intelligence (manual or API)
- Build the Growth Intelligence Snapshot
- Generate Blueprint and Masterplan drafts
- Generate execution artifacts (next sprint)
- Prepare WordPress publishing bundles
- Monitor tracking and refresh monthly priorities

**Does NOT:**
- Publish live without operator approval
- Invent data it does not have
- Make claims without proof
- Decide strategy alone

---

## C. Client Journey

| # | Stage | Client sees |
|---|---|---|
| 1 | Signup / sale | Welcome, plan, expectations |
| 2 | Website added | "We are analyzing your website" |
| 3 | Goal confirmed | Goal summary, lead math |
| 4 | Business assumptions confirmed | Short form: offer, locations, conversion path |
| 5 | Intelligence generated (auto) | Progress state, nothing raw |
| 6 | Operator review (hidden) | "Your Blueprint is being prepared" |
| 7 | Blueprint delivered | Cleaned client Blueprint with diagnosis, opportunity, plan, asks |
| 8 | Client approval / confirmation | Confirms direction, supplies missing inputs |
| 9 | Execution begins | High-level status, what's being built |
| 10 | Monthly reporting loop | Goal progress, bottleneck, next month's plan |

The client never sees: raw warnings, confidence scores, partial scan
diagnostics, competitor candidate lists, internal flags. That belongs to
the operator view.

---

## D. Operator Journey

1. **Intake queue** — new clients whose automated intelligence is ready for review
2. **Intelligence review** — Business Profile, Tone Profile, Market, Competitors, GBP, Page Diagnostics
3. **Blueprint review** — operator Blueprint with confidence, partials, warnings; approve or refine
4. **Masterplan approval** — operator confirms priorities and order
5. **Execution artifact review** — review generated artifacts against tone, claims, SEO, conversion
6. **Publishing approval** — approve publishing bundle → WordPress draft
7. **Monthly review** — re-read Snapshot, refresh Masterplan, sign off on client report

---

## E. Automation Flow

Orchestrated by **Intelligence Pipeline Orchestrator V1**
(`intelligence_runs`, `/growth/flow`). See
`docs/INTELLIGENCE_PIPELINE_ORCHESTRATOR_V1.md`.



### Runs automatically on "website added"
- Site crawl
- Audit
- Page Intelligence
- Business Profile draft
- Tone Profile draft
- Market scan
- Competitor scan (after market scan)
- GBP review request (or manual profile capture)
- Growth Intelligence Snapshot
- Blueprint draft
- Masterplan draft

### Requires human review (gates)
- Business Profile approval
- Tone Profile approval
- GBP assumptions
- Blueprint approval
- Masterplan approval
- Execution artifacts
- Publishing bundle

Cost-bounded scans (e.g. competitor SERP, paid APIs) may require operator
trigger above a per-tenant budget threshold. Defined in section M.

---

## F. System Layers

1. **Intelligence Layer** — audit, page intelligence, BP, tone, market, competitive, GBP, ranking (later)
2. **Blueprint Layer** — client-facing strategy synthesis
3. **Masterplan Layer** — operator-facing execution roadmap
4. **Execution Layer** — task engine + artifact generation (next sprint)
5. **WordPress / Delivery Layer** — see `WORDPRESS_INTEGRATION_ARCHITECTURE.md`
6. **Tracking / Monthly Loop** — outcomes, bottleneck detection, plan refresh

Every layer reads from the same Growth Intelligence Snapshot. No layer
re-fetches raw data. No layer mutates another layer's truth.

---

## G. Growth Intelligence Snapshot (spec)

The missing brainstem. Central normalized object consumed by Blueprint,
Masterplan, Execution, Publishing, Monthly Loop.

**Fields:**
- `goal` — growth goal, target type, timeframe, close rate, lead value
- `businessProfile` — offer, locations, conversion path, proof, claims
- `toneProfile` — voice, allowed claims, forbidden claims
- `audit` — objective site facts
- `pageIntelligence` — per-page role, intent, target keyword, diagnostics
- `marketIntelligence` — demand clusters, volumes, intent mix
- `competitiveIntelligence` — competitor matrix, gaps, local-pack matches
- `gbpIntelligence` — profile status, completeness, trust, local visibility
- `trackingState` — leads, calls, forms, conversions (when available)
- `rankingState` — placeholder, populated later
- `missingContext` — explicit list of what we do not yet know
- `confidence` — per-dimension confidence
- `nextBestAction` — derived priority

**Sources:** existing modules in `src/lib/shared/` — no new data
producers, only a normalizer.

**Refresh triggers:** new audit, BP/tone change, market or competitor
re-scan, GBP review save, operator-forced refresh, monthly loop tick.

Build target: **Sprint after this one.** Not in scope here.

---

## H. Two Blueprint Modes

Same underlying data, different presentation.

**Operator Blueprint** shows: confidence, partial scans, missing data,
warnings, scan status, noisy competitor candidates, raw-ish evidence.

**Client Blueprint** shows: clear diagnosis, key opportunities, plan,
assumptions, next steps, "what we need from you". No internal chaos.

Today's `growth.blueprint.tsx` is operator-mode. Client-mode is a future
render of the same Snapshot.

---

## I. WordPress Direction (summary)

WordPress is a **core delivery layer**, not a bolted-on afterthought.

V1 stance:
- Deep connection + inventory + page mapping + draft creation
- No live auto-publishing
- Approved execution artifacts become WordPress drafts or publishing bundles
- Operator approves every write

Full design lives in `WORDPRESS_INTEGRATION_ARCHITECTURE.md`.

---

## J. Navigation Proposal

```
Growth
  Goal
  Intelligence        (market, competitive, GBP, page diagnostics)
  Blueprint
  Masterplan
  Execution

Website
  Sites
  Audits
  WordPress Connection

Settings
  Business Profile
  Tone Profile
```

GBP moves under Growth → Intelligence. Execution Board V1 becomes the
shell for the future Execution Engine. Implementation deferred to the
Navigation Cleanup sprint.

---

## K. Legacy / Cleanup

Audit of current modules (sources: `src/routes/_authenticated/*` and
`src/lib/shared/*`).

### Keep
- Growth Goal — `growth_goals`, `settings.growth-goal.tsx`, `src/lib/shared/growthGoals/`
- Blueprint — `growth.blueprint.tsx`, `src/lib/shared/blueprint/`
- Masterplan — `growth.masterplan.tsx`, `src/lib/shared/masterplan/`
- Market Intelligence — `src/lib/marketIntelligence/`, `src/lib/shared/marketIntelligence/`
- Competitive Intelligence — `src/lib/competitiveIntelligence/`, `src/lib/shared/competitiveIntelligence/`
- GBP Intelligence — `growth.gbp.tsx`, `src/lib/gbpIntelligence/`, `src/lib/shared/gbpIntelligence/`
- Page Intelligence — `src/lib/shared/pageIntelligence/`
- Sites + Audits — `sites.*.tsx`, `audits.*.tsx`, `src/lib/shared/audits/`
- Business Profile — `settings.business-profile.tsx`, `src/lib/shared/businessProfile/`
- Tone Profile — `settings.tone-profile.tsx`, `src/lib/shared/tone/`
- WPCOM OAuth helper — `src/lib/shared/wpcom/` (reused by WP integration)

### Fold (into future modules)
- `src/lib/shared/proposalsV2/` → folds into **Execution Artifacts** (renamed, same engine, artifact-typed)
- `src/lib/shared/qaCompare/` and `audits.$auditId_.compare.tsx` → folds into **Artifact Review**
- `growth.execution.tsx` + `src/lib/shared/execution/` → becomes shell for **Execution Engine**
- `growth.masterplan_.$itemId.proposals.tsx` → folds into Execution Engine routing

### Legacy / parked (per ROADMAP_V4)
- V1 `src/lib/shared/proposals/` — superseded by proposalsV2, removed when Execution Artifacts ships
- `leads`, `raw_events` tables — redesigned by Tracking module
- `change_groups` table — redesigned by Publishing module

No deletion in this sprint. Classification only.

---

## L. State Machine

Lifecycle per client / per growth cycle:

```
onboarding
  → collecting_intelligence
  → operator_review
  → client_review
  → approved
  → in_execution
  → publishing_ready
  → draft_published
  → live
  → monthly_review  (loops back to collecting_intelligence)
```

Per-module statuses (audit, BP, blueprint, masterplan, artifact) keep
their own local state and roll up into the cycle state.

---

## M. Open Decisions

These are unresolved and need a call before the relevant sprint:

**Client gates**
- Does the client approve the Blueprint, or only the Masterplan? Per tier?
- Does the client see partials, or only the final approved Blueprint?
- What inputs are mandatory before first plan?
- What happens if the client never provides GBP access?

**Automation cost**
- Per-tenant monthly ceiling for paid scans (DataForSEO, Firecrawl)
- Which scans auto-rerun monthly vs operator-triggered
- When new intelligence contradicts an approved Masterplan — auto-flag or auto-replan?

**WordPress**
- Existing-page edits: WP draft revision vs LeadLayer-only update bundle in V1
- Publishing safety model — diff preview required before draft publish?
- Client approval gate for publish, per tier

**Tracking**
- Manual lead inbox first vs analytics integration first
- Source of truth for monthly metric: client-reported, GBP API, GA/GSC, or hybrid

**Monthly loop**
- Cadence: monthly fixed vs goal-driven
- Trigger for upsell or human intervention

---

## Next sprints (in order)

1. **WordPress Integration Architecture** ✅ — see [`WORDPRESS_INTEGRATION_ARCHITECTURE.md`](./WORDPRESS_INTEGRATION_ARCHITECTURE.md)
2. **Growth Intelligence Snapshot builder** ✅ V1 — see [`GROWTH_INTELLIGENCE_SNAPSHOT.md`](./GROWTH_INTELLIGENCE_SNAPSHOT.md)
3. **Navigation cleanup** ✅
4. **Product Flow Orchestration V1** ✅ — see [`PRODUCT_FLOW_ORCHESTRATION_V1.md`](./PRODUCT_FLOW_ORCHESTRATION_V1.md)
5. **WordPress Connection + Inventory V1** (next)
6. **Execution Task Engine + Artifacts** (now targeting WP draft bundles, not generic blobs)
7. **WordPress Draft Publishing**
8. **Publishing Gate / QA**
9. **Tracking + Monthly Loop**

## Navigation alignment (Nav Cleanup Sprint)

The app navigation now mirrors the OS flow end-to-end:

```
Growth:   Goal → Intelligence → Blueprint → Masterplan → Execution
Website:  Sites  (Audits + WordPress: future)
Settings: Business profile · Tone profile
```

GBP, Page Intelligence, Market and Competitive intelligence are no longer
top-level modules — they live under the Intelligence Snapshot, which is the
central status hub. Execution remains visible but is labeled as a preview
until the Execution Task Engine ships. Legacy proposal/QA flows are kept
but will fold into Execution Artifacts and Artifact Review in later sprints.
