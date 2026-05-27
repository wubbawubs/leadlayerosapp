# Blueprint Polish — Two Phases

You gave me two big tickets. Both are needed, but they touch overlapping files (generator, competitor summary, scoring, UI). To avoid one massive PR that's hard to verify, I'll ship them as two sequential phases with a typecheck and a Dallas review between them.

## Phase A — Ticket 4c: Blueprint Integrity & Goal Math Polish

Smallest, highest-trust fix first. No new external calls.

### A1. Goal math
- Audit `growthGoalSchema` for `targetType` (`clients_per_month` vs `total_clients`) and `timeframeMonths`.
- Rewrite `requiredLeadsPerMonth` in the generator:
  - monthly target → `target / closeRate`
  - total target → `(target / timeframeMonths) / closeRate`
  - ambiguous → keep current value but emit `goalAmbiguous` warning + show "Goal period is ambiguous" in Goal & Lead Math section.
- Goal headline reads "Target X clients/month within Y months" when monthly.

### A2. Financial scenarios
- `calculateFinancialImpactScenarios` driven by `requiredLeadsPerMonth` (gap), `closeRate`, `avgLeadValue`.
- Scenarios = % of monthly lead gap (conservative 25%, expected 60%, aggressive 100%), not cold-start defaults.
- If `currentLeadsPerMonth` unknown → say baseline unknown but still model target potential.

### A3. Service/location coverage
- In growth-gap section, match priority services/locations from goal + business profile against masterplan items (`service_page`, `location_page`, `content`, `conversion`, `website_fix`) using normalized substring match.
- Output "4/4 services addressed, 5/5 locations addressed across plan/backlog" instead of `0`.

### A4. Page diagnostics empty state
- Replace bare "No page intelligence available yet." with actionable copy + note that the score defaults lower until audit runs. No fake data.

### A5. Competitive snapshot framing
- Add subtitle: "Snapshot across selected local demand clusters, not a complete ranking baseline."
- Partial: "Partial snapshot — some clusters or competitor pages could not be analyzed."

### A6. Scoreboard reasoning consistency
- Lead Engine Score reasoning enumerates module status (market ✓, competitors partial, page intel missing, GBP missing, tracking missing) so "weak foundation" is explained, not asserted.

### A7. Docs
- Update `LEAD_ENGINE_BLUEPRINT_VIEW.md`, `LEAD_ENGINE_BLUEPRINT_GENERATOR.md`, `COMPETITIVE_INTELLIGENCE_V1.md`.

**Stop point**: typecheck, you reload `/growth/blueprint`, confirm Dallas numbers are correct before Phase B.

---

## Phase B — Competitive Enrichment V2

Only after Phase A is verified.

### B1. Local-pack ↔ organic matching
- New `src/lib/shared/competitiveIntelligence/localPackMatcher.ts` with `matchLocalPackToCompetitor()` scoring on name similarity, domain, phone, address/city, snippet overlap.
- Persist `gbpMatchConfidence` + matched signals in `score_breakdown`. Never invent reviews.

### B2. SERP parser local-pack capture
- `dataForSeoSerp.server.ts`: capture all local-pack items per cluster (not just first), store name/rating/reviews/address/category/website in `competitor_serp_results`, keep raw item.

### B3. Page-depth classifier — fuzzy patterns
- Extend `pageDepthClassifier.ts` with HVAC service synonyms (`ac-repair`, `cooling`, `hvac-services`, `furnace`, `emergency-*`, etc.) and location patterns (`service-area(s)`, `areas-we-serve`, `locations`, city slugs).
- Add `firecrawlMapLimited` warning when map returns < N urls; reduce confidence.

### B4. Self-row enrichment
- Pull `audit_pages` + `page_intelligence` + masterplan items before falling back to business profile.
- Split into `existingServicePagesCount` / `plannedServicePagesCount` (same for locations). Score rewards existing > planned.

### B5. Confidence recalibration
- Rewrite `computeScoreConfidence` with explicit dimension scoring (reviews, depth, trust, SERP, type, local-pack match).
- Hard caps: reviews+depth both unknown → ≤50; Firecrawl failed → ≤60; SERP-only → ≤45.

### B6. UI
- CompetitiveBlock: show reason for unknowns ("No local-pack match", "Crawl limited"), 1–2 service/location page samples, distinguish Existing vs Planned for self row, keep Unknown ≠ 0.

### B7. Summary/gaps
- `buildCompetitorMatrixSummary`: skip "review volume" as top gap if most competitors lack review data; add warning "Review comparison limited because local-pack matches were incomplete."

### B8. Docs
- Update `COMPETITIVE_INTELLIGENCE_V1.md` with matcher, page-depth fuzzy patterns, confidence rules, self-row existing/planned split.

---

## What's explicitly out

GBP API, ranking baseline, execution engine, Yelp/BBB scraping, Safe Publishing, WordPress writes. We finish the competitive loop first, then you decide.

## Files touched (approx)

```text
Phase A
  src/lib/shared/growthGoals/schemas.ts            (maybe add targetType)
  src/lib/shared/blueprint/generator.ts            (goal math, financial, growth-gap, page diag, score reasoning)
  src/lib/shared/blueprint/scoring.ts              (if reasoning lives here)
  src/routes/_authenticated/growth.blueprint.tsx   (snapshot wording, page diag CTA)
  docs/*.md

Phase B
  src/lib/shared/competitiveIntelligence/localPackMatcher.ts  (new)
  src/lib/shared/competitiveIntelligence/pageDepthClassifier.ts
  src/lib/shared/competitiveIntelligence/scoring.ts
  src/lib/shared/competitiveIntelligence/summarize.ts
  src/lib/shared/competitiveIntelligence/schemas.ts (existing/planned fields)
  src/lib/competitiveIntelligence/dataForSeoSerp.server.ts
  src/lib/competitiveIntelligence/runCompetitorScan.server.ts
  src/routes/_authenticated/growth.blueprint.tsx
  docs/COMPETITIVE_INTELLIGENCE_V1.md
```

## Verification per phase

- Typecheck green.
- Reload `/growth/blueprint` for Dallas.
- Phase A: required leads/month = 20, financial scenarios target-aligned, services/locations show N/N, page diag has CTA, snapshot wording present.
- Phase B (after rerunning competitor scan): reviews populated where local-pack matched, page depth >0 or explicitly "limited", confidence drops on unknowns, self-row shows existing/planned split.

Ready to start Phase A on approval. I'll pause for your review before Phase B.
