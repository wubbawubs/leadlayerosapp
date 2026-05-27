# Lead Engine Blueprint Roadmap

> Version: 1.0
> Status: Draft — pending approval before Ticket 1a build starts
> Purpose: Define the full 7-ticket roadmap before any implementation, so every module has a clear output contract and dependency graph.

---

## 1. Product North Star

LeadLayer turns a local business growth goal into a measurable lead engine.

The full chain:

```
Goal → Blueprint → Masterplan → Execution → Publishing → Tracking → Monthly Growth Loop
```

The Blueprint is the **client-facing value layer**. It answers:
- What is your current lead engine worth?
- Where is the growth gap?
- What is the financial upside if we close it?
- What are we going to do, in what order, and how do we know it works?

It is not a proposal document. It is a **living, data-backed deliverable** that improves as intelligence modules feed it.

---

## 2. Core Principle: One Source of Truth, Two Views

| Layer | Audience | Purpose |
|---|---|---|
| **Lead Engine Blueprint** | Client / Business Owner | Understand current state, growth gap, financial impact, and the plan |
| **Masterplan** | Operator / Team Member | Know what to execute, when, and why |

**Critical rule:** The Blueprint must not duplicate or fork Masterplan logic. It reads from the same structured sources and explains them in business language.

- If Masterplan says: *"Priority: Emergency HVAC repair in Dallas (Phase 1, 30 days)"*
- Blueprint says: *"Your highest-intent service is emergency HVAC repair. Capturing this demand first delivers the fastest path to lead growth."*

Both draw from the same data (Masterplan items, Page Intelligence, Audit, Business Profile, Goal). The Blueprint adds scoring, financial modeling, and narrative framing.

### How to avoid duplicate truth

- Masterplan remains the **canonical action plan**.
- Blueprint sections that reference the plan must read from Masterplan items, not invent their own priorities.
- If a Blueprint section contradicts the Masterplan, the Masterplan wins and the Blueprint generator is wrong.
- Scoring functions are shared: Blueprint and Masterplan both call the same pure functions. The Blueprint adds narrative; the Masterplan adds execution steps.

---

## 3. Data Flow

```
Growth Goal
     ↓
Business Profile  ───────────────────┐
     ↓                                 │
Tone Profile                         │
     ↓                                 │
Audit Engine                         │
     ↓                                 │
Page Intelligence                    │
     ↓                                 │
Masterplan (phased, scored)          │
     ↓                                 │
Market Intelligence (Ticket 3) ────────┤
     ↓                                 │
Competitive Intelligence (Ticket 4) ─┤
     ↓                                 │
GBP Intelligence (Ticket 5) ───────────┤
     ↓                                 │
Ranking Baseline (Ticket 6) ─────────┘
     ↓
Scoring Framework (Ticket 1a)
     ↓
Lead Engine Blueprint (Ticket 1b)
     ↓
Blueprint View + Share URL (Ticket 1c)
     ↓
Execution Task Engine (Ticket 7)
```

Key: Intelligence modules feed **downward** into scoring and blueprint. Blueprint is the **presentation layer**, not a data source.

---

## 4. Seven-Ticket Roadmap

---

### Ticket 1: Lead Engine Blueprint V1

**Split into three sub-tickets because the scope is too large for one build cycle.**

#### 1a. Scoring Framework

| | |
|---|---|
| **Goal** | Build pure scoring functions that turn structured data into normalized scores. |
| **Why it exists** | Every later module needs scores. The Blueprint needs them to tell a story. The Masterplan needs them to justify priority. Without a shared scoring layer, every module invents its own numbers. |
| **Inputs** | Audit data, Page Intelligence, Masterplan items, Business Profile, Goal data, manual/placeholder market inputs. |
| **Outputs** | Normalized score objects (0-100 or 0-10) with reasoning arrays. |
| **Data model changes** | New types/functions only. No DB tables in 1a. |
| **UI changes** | None. |
| **Acceptance criteria** | - `calculateLeadEngineScore()` returns a 0-100 score with component breakdown. <br> - `calculateConversionReadinessScore()` evaluates how ready the current site/pages are to convert traffic into leads. <br> - `calculateDemandCoverageIndex()` measures how much of the addressable demand is currently captured (pages + GBP + channels). <br> - `calculateGrowthVelocityModel()` projects lead growth over 12 months based on execution cadence and current baseline. <br> - `calculateFinancialImpactScenarios()` computes low/mid/high revenue impact from closing the growth gap. <br> - Every score includes a `reasoning` array explaining positive and negative factors. <br> - Scores are deterministic: same inputs = same outputs. <br> - No external API calls in 1a. Placeholder/manual inputs are fine. |
| **Explicit non-goals** | - No UI. <br> - No database writes. <br> - No external APIs. <br> - No competitor data yet. |
| **Dependencies** | Requires Masterplan V2 (exists). Requires Audit + Page Intelligence (exist). |

#### 1b. Blueprint Generator

| | |
|---|---|
| **Goal** | Assemble the Blueprint document from structured sources + scores. |
| **Why it exists** | The generator is the "compiler" that turns raw intelligence into a coherent client-facing narrative. |
| **Inputs** | All outputs from 1a + Masterplan + Business Profile + Goal + Audit + Page Intelligence. Placeholder sections for future intelligence modules. |
| **Outputs** | A structured Blueprint object with typed sections. |
| **Data model changes** | New DB table: `blueprints` (project_id, version, status, sections JSON, scores JSON, created_at, updated_at). |
| **UI changes** | None yet. Generator is server-side. |
| **Acceptance criteria** | - Blueprint object contains all required sections (see below). <br> - Each section has `content`, `dataSource` (where the data came from), and `confidence` (0-1). <br> - Placeholder sections for Market/Competitive/GBP/Ranking explicitly mark themselves as placeholder with a `pendingDataFrom` field. <br> - Generator fails gracefully if optional data is missing — never blocks on intelligence modules that are not built yet. <br> - Blueprint is versioned. |
| **Explicit non-goals** | - No UI rendering yet. <br> - No sharing logic yet. <br> - No PDF export yet. |
| **Dependencies** | Ticket 1a complete. |

**Blueprint sections (required):**

1. **Goal & Lead Math** — Target leads, close rate, lead value, current monthly volume.
2. **Current Lead Engine** — What exists now: pages, GBP, channels, strengths, weaknesses.
3. **Growth Gap** — Quantified gap between current and goal, expressed in leads and revenue.
4. **Market Intelligence** — Demand landscape. *Placeholder until Ticket 3.*
5. **Competitive Position** — Where the business stands vs. competitors. *Placeholder until Ticket 4.*
6. **Page Diagnostics** — Key page issues and opportunities from Audit + Page Intelligence.
7. **Financial Impact Model** — Low / mid / high revenue scenarios if the gap is closed.
8. **Lead Engine Architecture** — The recommended structure: pages, locations, services, channels.
9. **12-Month Roadmap** — Phased plan drawn from Masterplan, translated to business milestones.
10. **Measurement Framework** — What we track, how, and what "good" looks like each month.
11. **Client Inputs Needed** — What the client still needs to provide or confirm.
12. **Risks & Assumptions** — What could delay or derail the plan.
13. **Next Actions** — Immediate next steps with owner and deadline.

#### 1c. Blueprint View + Shareable URL

| | |
|---|---|
| **Goal** | Build the client-facing UI to view, review, and optionally share the Blueprint. |
| **Why it exists** | The Blueprint only creates value when a client can read it, understand it, and act on it. |
| **Inputs** | Blueprint object from 1b. |
| **Outputs** | Rendered Blueprint page, share status. |
| **Data model changes** | Add `status` enum (`draft`, `review_ready`, `approved`) to `blueprints` table. Optional: `share_token` field. |
| **UI changes** | New route: `/growth/blueprint`. Sections rendered as cards/collapsible panels. No raw JSON. Clear typography and hierarchy. |
| **Acceptance criteria** | - `/growth/blueprint` renders the latest Blueprint for the current project. <br> - Each section is clearly titled with an explanation of what it means. <br> - Placeholder sections show "Market intelligence data pending" with a clear call to action. <br> - Blueprint status is visible and editable. <br> - Optional: shareable URL with token (`/share/blueprint/:token`). If too large for V1, defer to later. <br> - Mobile-responsive. |
| **Explicit non-goals** | - No public share without auth in V1 (unless trivial). <br> - No PDF export in V1. <br> - No inline editing of Blueprint text (edits happen upstream in Goal/Masterplan). <br> - No email delivery yet. |
| **Dependencies** | Ticket 1b complete. |

---

### Ticket 2: Market Intelligence Data Model

| | |
|---|---|
| **Goal** | Design and build the database tables for market intelligence data. |
| **Why it exists** | Before connecting to DataForSEO or any external API, the storage contract must exist. This prevents ad-hoc schema changes later. |
| **Inputs** | Data model requirements from scoring framework and Blueprint sections. |
| **Outputs** | DB tables: `market_scans`, `market_keywords`, `market_demand_clusters`. |
| **Data model changes** | New tables with clear relations to `projects`. |
| **UI changes** | None. |
| **Acceptance criteria** | - Tables support: scan metadata, keyword data (volume, intent, difficulty, CPC, cluster), demand clusters (grouped keywords by service/location). <br> - Foreign keys to `projects`. <br> - Timestamps for change tracking. <br> - RLS policies appropriate for project-scoped data. <br> - Schema documented. |
| **Explicit non-goals** | - No API integration in this ticket. <br> - No scoring changes yet. <br> - No UI. |
| **Dependencies** | None. Can be built in parallel with Ticket 1 if needed, but logically comes after 1a because 1a defines what data the scoring framework expects from market intelligence. |

---

### Ticket 3: DataForSEO Market Scan V1

| | |
|---|---|
| **Goal** | Connect to DataForSEO (or equivalent) to pull real demand data. |
| **Why it exists** | The Demand Coverage Index and Market Intelligence sections are weak without real volume and intent data. |
| **Inputs** | Service + location keyword lists (from Business Profile / Goal). API credentials. |
| **Outputs** | Populated `market_scans`, `market_keywords`, `market_demand_clusters`. |
| **Data model changes** | None — uses Ticket 2 tables. |
| **UI changes** | Optional: admin/status view showing scan progress. Not client-facing. |
| **Acceptance criteria** | - Keywords fetched for all primary services × primary locations. <br> - Volume, intent, difficulty, CPC stored per keyword. <br> - Clustering logic groups keywords into demand clusters. <br> - Opportunity score calculated per cluster. <br> - Data feeds into `calculateDemandCoverageIndex()` and Blueprint Market Intelligence section. <br> - Graceful handling of API errors / rate limits. |
| **Explicit non-goals** | - No competitor data yet (Ticket 4). <br> - No rank tracking yet (Ticket 6). <br> - No automated recurring scans in V1 (manual or one-off). |
| **Dependencies** | Ticket 2 complete. |

---

### Ticket 4: Competitive Intelligence V1

| | |
|---|---|
| **Goal** | Scan and store competitor data. |
| **Why it exists** | Clients and operators need to know who dominates the search results and why. The Competitive Position section is empty without this. |
| **Inputs** | Target market (from Goal / Business Profile). Competitor URLs (manual or inferred). |
| **Outputs** | Populated `competitors`, `competitor_pages` tables. |
| **Data model changes** | New tables: `competitors`, `competitor_pages`. Fields: review count/rating, service pages, location pages, GBP presence, estimated authority score. |
| **UI changes** | Optional: admin view. Not client-facing yet. |
| **Acceptance criteria** | - Competitor list stored per project. <br> - Competitor pages categorized (service, location, blog, etc.). <br> - Review count and rating captured where available. <br> - GBP presence flag. <br> - Competitor score feeds into `calculateLeadEngineScore()` and Blueprint Competitive Position section. |
| **Explicit non-goals** | - No deep content analysis yet (word counts, semantic gaps). <br> - No automated competitor discovery in V1 (manual list or simple SERP scan). |
| **Dependencies** | Ticket 3 preferred (shares keyword targets), but can be built in parallel. |

---

### Ticket 5: GBP Intelligence V1

| | |
|---|---|
| **Goal** | Connect to Google Business Profile or capture manual GBP status. |
| **Why it exists** | GBP is often the dominant local lead source. Its completeness, review velocity, and post activity directly affect the Lead Engine Score. |
| **Inputs** | GBP account (if connected) or manual input. |
| **Outputs** | GBP score, trust gap, review plan recommendations, Blueprint update. |
| **Data model changes** | New table: `gbp_intelligence`. Fields: categories, services, reviews (count, rating, velocity), photos, posts, profile completeness score. |
| **UI changes** | Admin view for GBP status. Client-facing indicator in Blueprint. |
| **Acceptance criteria** | - If connected: auto-sync categories, services, reviews, photos, posts. <br> - If not connected: store manual status + missing context + generate connection task. <br> - GBP score calculated. <br> - Trust gap identified (e.g., review velocity below competitor average). <br> - Review plan generated. <br> - Feeds Blueprint and Masterplan (GBP tasks). |
| **Explicit non-goals** | - No GBP post scheduling yet. <br> - No automated review solicitation yet. |
| **Dependencies** | Ticket 4 preferred for competitor review comparison. |

---

### Ticket 6: Ranking Baseline V1

| | |
|---|---|
| **Goal** | Establish baseline ranking data for target keywords. |
| **Why it exists** | Without a baseline, you cannot prove growth. The monthly loop depends on knowing where we started. |
| **Inputs** | Target keywords (from Ticket 3 + Goal). |
| **Outputs** | `ranking_snapshots` table with baseline data. |
| **Data model changes** | New table: `ranking_snapshots`. Fields: keyword, organic rank, local pack rank, ranking URL, competitor positions, snapshot date. |
| **UI changes** | Optional: admin trend view. |
| **Acceptance criteria** | - Baseline snapshot stored for all primary keywords. <br> - Organic rank and local pack rank captured. <br> - Competitor positions captured. <br> - Snapshot date recorded. <br> - Monthly loop can compare new snapshot to baseline. |
| **Explicit non-goals** | - No daily rank tracking in V1 (weekly or monthly is fine). <br> - No automated rank reports emailed yet. |
| **Dependencies** | Ticket 3 complete (needs keyword list). |

---

### Ticket 7: Execution Task Engine + Artifacts

| | |
|---|---|
| **Goal** | Build the operational layer that turns Masterplan items into tasks, artifacts, page briefs, drafts, QA reviews, and publishing. |
| **Why it exists** | The Masterplan is a plan. Execution makes it real. This is the "how" to the Masterplan's "what." |
| **Inputs** | Masterplan items, Blueprint scores, Page Intelligence, Tone Profile. |
| **Outputs** | Execution tasks, page briefs, page drafts, QA reviews, approval workflow, publishing queue. |
| **Data model changes** | Tables: `execution_tasks`, `artifacts`, `page_briefs`, `page_drafts`, `qa_reviews`, `publishing_queue`. |
| **UI changes** | Full Execution Board UI with kanban/status views. Task detail views. Artifact editors. QA review UI. |
| **Acceptance criteria** | - Masterplan items auto-generate execution tasks with owners and deadlines. <br> - Page briefs generated from Masterplan page opportunities + Tone Profile. <br> - Page drafts generated from briefs (AI-assisted). <br> - QA review evaluates drafts against tone, claim safety, CTA fit. <br> - Approval workflow before publishing. <br> - Publishing queue with status tracking. <br> - Masterplan items update status as execution progresses. |
| **Explicit non-goals** | - No automated WordPress publishing in V1 (manual export or copy-paste is fine). <br> - No automated GBP posting yet. <br> - No email/SMS campaign execution yet. |
| **Dependencies** | Masterplan V2 + Blueprint V1. Strongly preferred to have intelligence modules (Tickets 3-6) for data-driven task priority. |

---

## 5. Ticket 1a Details: Scoring Framework

### Functions to build

All pure functions. No side effects. No DB writes. No API calls.

| Function | Description | Output |
|---|---|---|
| `calculateLeadEngineScore(inputs)` | Overall engine health and competitiveness | 0-100 score with breakdown |
| `calculateConversionReadinessScore(inputs)` | How ready the site is to convert traffic | 0-100 score with page-level details |
| `calculateDemandCoverageIndex(inputs)` | What % of addressable demand is captured | 0-100 index with uncovered clusters |
| `calculateGrowthVelocityModel(inputs)` | Projected lead growth over 12 months | Monthly projection array |
| `calculateFinancialImpactScenarios(inputs)` | Revenue impact at low/mid/high closure | Three scenarios with lead math |

### V1 input contract

```typescript
interface ScoringInputs {
  audit: AuditSummary;
  pageIntelligence: PageIntelligenceSummary;
  masterplan: MasterplanSummary; // phases, priorities, confidence
  businessProfile: BusinessProfileSummary;
  goal: GoalSummary;
  marketData?: MarketDataPlaceholder; // optional, manual/placeholder
}
```

### Rules

- Scores must explain themselves. Every score object includes a `reasoning: string[]` array.
- Reasoning includes **both** affirmative signals ("Strong service focus: 4 core services identified") and negative factors ("Missing vertical context: -0.08").
- Scores are versioned. If scoring logic changes, the version increments.
- Scores are deterministic. No randomness.
- If optional inputs are missing, the function degrades gracefully — never throws. Missing data is noted in reasoning.

---

## 6. Ticket 1b Details: Blueprint Generator

### Generator rules

- Each section has a `dataSource` field naming where the content came from.
- Each section has a `confidence` field (0-1) indicating how much real data backs it.
- Placeholder sections must explicitly state what data is pending and which ticket will provide it.
- The generator does not invent narrative. It translates structured data into business language.

### Section data sources

| Section | Primary Source | Fallback |
|---|---|---|
| Goal & Lead Math | `goal` table | Manual input prompt |
| Current Lead Engine | `audit` + `page_intelligence` | "Audit pending" |
| Growth Gap | `calculateFinancialImpactScenarios` | "Scoring pending" |
| Market Intelligence | `market_scans` (Ticket 3) | Placeholder with explicit note |
| Competitive Position | `competitors` (Ticket 4) | Placeholder with explicit note |
| Page Diagnostics | `audit` + `page_intelligence` | "Scan pending" |
| Financial Impact Model | `calculateFinancialImpactScenarios` | "Lead math incomplete" |
| Lead Engine Architecture | `masterplan` (architecture section) | "Masterplan pending" |
| 12-Month Roadmap | `masterplan` (phased items) | "Masterplan pending" |
| Measurement Framework | `goal` + `masterplan` | "Goal not fully defined" |
| Client Inputs Needed | Missing fields across all sources | Dynamic list |
| Risks & Assumptions | `masterplan` confidence reasons + scoring reasoning | Generic risks |
| Next Actions | `masterplan` Phase 1 items + manual playbooks | "Masterplan pending" |

---

## 7. Ticket 1c Details: Blueprint View + Shareable URL

### UI principles

- **No raw JSON.** Every piece of data has a human-readable label and explanation.
- **Status-aware.** The Blueprint has a lifecycle: `draft` → `review_ready` → `approved`. UI reflects this.
- **Placeholder transparency.** If a section is a placeholder, it says so clearly — no fake data, no fake charts.
- **Mobile-first.** Local business owners check this on their phones.
- **Brand separation.** The software's UI language (Dutch/English labels, navigation) is separate from the Blueprint's brand language (client-facing narrative, which for US clients is English).

### Route structure

| Route | Purpose |
|---|---|
| `/growth/blueprint` | Full Blueprint view for authenticated users |
| `/share/blueprint/:token` | Public read-only view (V1.1 or later if scope is too large) |

---

## 8. Warnings

### Data integrity

- **No fake market volume.** If we don't have DataForSEO data yet, the section says "Market intelligence pending. Scan scheduled." It does not show a made-up number.
- **No fake competitor data.** Same rule. Placeholder > fabrication.
- **No fake GBP/review data.** If GBP is not connected, the section explains what is missing and how to connect it.

### Architecture

- **Blueprint must not become a second independent plan.** If the Blueprint and Masterplan diverge, the system is broken. The Blueprint always derives from the Masterplan and other sources.
- **Do not build intelligence modules before their data model exists.** Ticket 2 comes before Ticket 3.
- **Do not build execution before the intelligence foundation exists.** Ticket 7 comes after Blueprint and at least some intelligence modules are in place.

### Language

- **UI language vs. brand language.** The app's UI (buttons, nav, labels) may be Dutch. The Blueprint narrative (client-facing) is English for US clients. This is intentional and must remain consistent.

---

## 9. Current Next Step

After this roadmap document is reviewed and approved:

1. Build **Ticket 1a — Scoring Framework**.
2. Verify scoring outputs against Dallas Comfort Air test data.
3. Only then proceed to **Ticket 1b — Blueprint Generator**.

This ensures we build scoring against a fixed output contract, and the Blueprint generator has deterministic, tested scores to assemble.

---

## 10. Glossary

| Term | Definition |
|---|---|
| **Lead Engine** | The complete system that attracts, converts, and tracks leads for a local business. |
| **Lead Engine Score** | A composite 0-100 score of how well the business is set up to generate leads online. |
| **Demand Coverage Index** | What percentage of the total addressable search demand is currently captured by the business's pages, GBP, and channels. |
| **Conversion Readiness** | How prepared the existing site and pages are to turn visitors into leads. |
| **Growth Velocity Model** | A 12-month projection of lead growth based on execution cadence and current baseline. |
| **Blueprint** | The client-facing deliverable that explains current state, growth gap, and the plan. |
| **Masterplan** | The operator-facing phased action plan with priorities, owners, and deadlines. |
| **Intelligence Module** | A data collection layer (Market, Competitive, GBP, Ranking) that feeds the Blueprint and Masterplan. |

---

*End of roadmap. Approved for implementation: _________*
