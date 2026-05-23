# LeadLayer — Current State Baseline

_Last inventory: 2026-05-23. Inspection only — no features added, no refactors._

North Star (new): **Client Goal → Masterplan → Execution Engine → Human QA → Safe Publishing → Tracking → Reporting → Monthly Growth Loop.**

This document describes what actually exists in the repo/database today, not what was once planned.

---

## 1. Executive summary

What works end-to-end today:

1. **Auth + tenant onboarding** (signup → tenant create → WPCOM site connect → first audit).
2. **WordPress.com site connection** via OAuth (read-only; no publish flow wired).
3. **Audit Engine** — crawls a small set of WPCOM pages, extracts SEO signals, persists `audits` + `audit_pages` + per-page `issues[]`.
4. **Business Profile v2** — analyzer job hydrates `business_profiles_v2` (identity, offer, ICP, location, conversion, proof, guardrails, strategy angles, confidence).
5. **Tone Profile** — analyzer + samples + evaluator + feedback loop.
6. **Page Intelligence** — per-page analyzer (page type, intent, commercial priority, target keyword/audience, CTA, local relevance, risk flags).
7. **Growth Context builder** — assembles tone + business + page intelligence + guardrails into a single context object for proposal generation.
8. **Proposal Engine V1** (`fix_proposals` / `fix_proposal_groups`) — older path, still callable.
9. **Proposal Engine V2** (`proposal_v2`) — the current focus. Action-aware generator with:
   - readiness gating (blocked / needs_context / ok),
   - per-action generator (meta, alt, schema, …),
   - evaluator producing scores + risk flags + publishable boolean,
   - schema proposals correctly blocked when verified proof is missing,
   - alt-text hard gate (cleanup + safe Dutch fallback pool + recomputed flags),
   - meta description weak-tail rewrite (NL).
10. **QA Compare view** — V1 vs V2 side-by-side per run, with "Correctly blocked" badge and `copyApprovalRate` excluding schema safety blocks.

What does NOT exist yet:

- No **Goal Intake** (no `growth_goals` table, no goal UI).
- No **Masterplan Engine** (`master_plans` / `monthly_plans` tables exist in DB schema but are **unused** by the app — no CRUD, no UI, no generator).
- No **Safe Publishing** flow (no `change_groups` / `changes` write path, no snapshot/diff/rollback UI; WPCOM OAuth exists but no write API call is wired).
- No **Tracking / Lead Inbox** (`leads`, `lead_events`, `raw_events`, `health_scores`, `scans`, `issues` tables exist but no ingest endpoint, no UI).
- No **GBP / Reviews / Local Visibility** module at all.
- No **Reporting dashboard** / monthly loop.
- No **Landing Page Factory**.
- No **rankings / GSC / SERP** integration.

**Net:** the app is currently a *Website Audit + AI Proposal Lab with a strong QA review layer.* It is not yet a growth OS. The strategic copy/QA core is in good shape; everything around it (goal, plan, publish, track, report) is missing.

---

## 2. Module-by-module status

| Module | Status | Quality | New-NorthStar fit | Recommended |
|---|---|---|---|---|
| Auth + tenants + memberships + RLS | Production-ready | High | Keep | Keep |
| Onboarding (welcome → site → business) | Production-ready | Medium | Partial — no goal step | Extend with Goal Intake step |
| WPCOM OAuth + probe | Production-ready (read) | Medium | Keep | Keep, extend to write later |
| Audit Engine (runner + extract) | Production-ready (WPCOM, ≤20 pages, sync) | Medium | Keep as one input | Keep |
| Business Profile V2 (analyzer + suggestions + feedback) | Production-ready | High | Strong fit | Keep, extend with capacity/lead value/sales process fields |
| Tone Profile (analyzer + samples + evaluator + feedback) | Production-ready | High | Keep | Keep |
| Page Intelligence | Production-ready | Medium-High | Keep | Keep |
| Growth Context builder | Production-ready | High | Keep — already the right abstraction | Extend to include goal + masterplan later |
| Proposal V1 (`fix_proposals`) | Working, legacy | Low-Medium | Park | Park, keep for QA compare only |
| Proposal V2 (orchestrator + generator + evaluator) | Working, actively iterated | Medium-High (after recent polish) | Keep — core execution unit | Keep, will plug into Masterplan items later |
| QA Compare view + metrics | Working | High (recent) | Keep | Keep |
| Brand Voice Profiles (`brand_voice_profiles` table) | Schema only, unused | — | Duplicate of Tone | Delete or merge with Tone Profile |
| Master Plans / Monthly Plans (DB) | Schema only, unused | — | Core of new NorthStar | Redesign — current schema is from old roadmap |
| Change Groups / Changes / wp_write_operations | Schema only, unused | — | Needed for S5 | Park until publishing sprint |
| Leads / Lead Events / Raw Events | Schema only, unused | — | Needed for tracking | Park until tracking sprint |
| Health Scores / Scans / Issues (separate from audit_pages.issues) | Schema only, unused | — | Possibly redundant with audits | Decide: reuse or drop |
| Subscription Plans | Seeded, not enforced | — | Later | Park |
| Secrets vault (per tenant) | Production-ready | High | Keep | Keep |
| GBP / Reviews / Tracking ingest / Reporting | Not built | — | Required | Build later sprints |

---

## 3. Working end-to-end flows

1. **Signup → tenant → site connect → audit → V2 proposals → QA review**
   - `signup.tsx` → `_authenticated.tsx` guard → `onboarding.welcome/site/business/done` → `sites.new` / `sites.index` → `sites.$siteId.audits` (`startAudit` server fn, sync `runAudit`) → `audits.$auditId` → `audits.$auditId_.proposals` (V2 generation) → `audits.$auditId_.compare` (V1 vs V2 review with run-aware copy approval rate).

2. **Business Profile bootstrap → analyzer job → suggestions → operator decide → feedback log**
   - `settings.business-profile.tsx` + `run-analyzer-job` public route (HMAC-protected) + `business_profile_suggestions` + `business_profile_feedback`.

3. **Tone Profile bootstrap → analyzer → samples → evaluator → feedback log**
   - `settings.tone-profile.tsx` + tone analyzer/evaluator + `tone_feedback_examples`.

## 4. Broken / incomplete flows

- **Onboarding "done" → app** — leaves user on `/app`, which is essentially empty (no real dashboard).
- **Master Plan & Monthly Plan** — DB tables exist; no server fns, no UI, no generator. Dead schema.
- **Change Groups / wp_write_operations** — schema exists, no write logic, no approval UI, no rollback. Dead schema.
- **Leads / raw_events** — no ingest endpoint, no inbox UI, no attribution logic.
- **`brand_voice_profiles`** — overlaps with `tone_profiles`; only one is actually used by code (tone_profiles).
- **`scans` / `issues` / `health_scores`** — referenced in old ERD; the live audit path writes to `audits` / `audit_pages.issues` instead. Schema drift.
- **No goal intake** anywhere. The whole product still starts from "audit a website", not "what is your growth goal".

## 5. Data model overview (live tables actually used by code)

Used today:
`profiles`, `tenants`, `memberships`, `onboarding_sessions`, `site_connections`, `tenant_secrets`, `secret_audit_log`, `audits`, `audit_pages`, `business_profiles_v2`, `business_profile_suggestions`, `business_profile_feedback`, `business_profile_analyzer_jobs`, `tone_profiles`, `tone_profile_samples`, `tone_feedback_examples`, `page_intelligence`, `fix_proposal_groups`, `fix_proposals`, `proposal_v2`, `proposal_comparisons`, `proposal_quality_checks`, `subscription_plans`, `project_docs`, `workflow_runs`.

Defined but unused by app code:
`brand_voice_profiles`, `business_profiles` (v1), `master_plans`, `monthly_plans`, `change_groups`, `changes`, `wp_write_operations`, `pages`, `page_snapshots`, `leads`, `lead_events`, `raw_events`, `scans`, `issues`, `health_scores`.

All used tables have RLS via `is_tenant_member` / `has_tenant_min_role`. No obvious holes.

## 6. UI routes (`src/routes/_authenticated`)

- `app.tsx` — empty shell.
- `onboarding.{welcome,site,business,done}.tsx` — onboarding wizard.
- `sites.index.tsx`, `sites.new.tsx`, `sites.$siteId.audits.tsx` — site mgmt + audit list.
- `audits.$auditId.tsx` — audit report.
- `audits.$auditId_.proposals.tsx` — V2 proposal generation/list.
- `audits.$auditId_.compare.tsx` — V1 vs V2 QA review.
- `settings.business-profile.tsx`, `settings.tone-profile.tsx` — context settings.

Public/api: `/api/public/run-analyzer-job` (HMAC), `/api/public/wpcom/callback` (OAuth).

No routes for: goal, masterplan, dashboard/reporting, leads, GBP, publishing, monthly plan, approvals center.

## 7. Engines / services (`src/lib/shared/*`)

`audits/` (runner+extract), `businessProfile/` (analyzer+repo+job+defaults), `tone/` (analyzer+corpus+evaluator+repo), `pageIntelligence/` (analyzer+repo), `growthContext/` (builder+repo+schemas), `proposals/` (V1 generator+context), `proposalsV2/` (orchestrator+generator+evaluator+repo+schemas), `qaCompare/` (repo), `llm/` (router — Lovable AI Gateway), `secrets/` (vault+crypto), `wpcom/` (oauth+wpcom client), `context/`, `db/repos/`, `locale/`, `jobs/`.

## 8. Integrations

- **Lovable AI Gateway** — used for all LLM calls (business analyzer, tone analyzer, page intelligence, proposal V2 generator/evaluator).
- **WordPress.com OAuth** — connect + probe + read; **no write** path.
- **Supabase Auth + DB + RLS** — full stack.
- No GBP, no GSC, no SERP/rank tool, no call tracking, no form ingest, no email/notif, no payments.

## 9. Proposal + QA flow status

- V2 readiness gating works (correctly blocks schema proposals without verified proof).
- V2 generator: action-aware, banned-phrase retry, deterministic compaction, weak-tail rewrite for meta NL, alt-text cleanup + hard-gate fallback pool, stale alt-flag stripping (recent fix).
- Evaluator produces weighted scores and `publishable` boolean.
- QA Compare view groups by run, separates "correctly blocked" from rejected, computes `copyApprovalRate` excluding safety blocks.
- Open quality issues observed in chat: some flags still appear noisy after fallback; about-meta CTA still occasionally weak; metric polish ongoing.
- No human-approval-to-publish step exists. Approve/reject is QA bookkeeping only; nothing flows out of the app.

## 10. Known bugs / risk list

1. **Strategy drift in DB** — `master_plans`, `monthly_plans`, `change_groups`, `leads`, `raw_events`, `scans`, `issues`, `health_scores` exist as dead schema; they will mislead future contributors and likely need redesign under the new NorthStar.
2. **Duplicate concepts** — `business_profiles` (v1) and `brand_voice_profiles` overlap with `business_profiles_v2` and `tone_profiles`. Risk of "which table is real?".
3. **Empty `/app`** — onboarding terminates into a blank shell; new users see nothing meaningful.
4. **Audit is sync + WPCOM-only**, capped at ~20 pages. Not a problem now, will be later.
5. **No publishing path despite WP OAuth** — easy to mistake the connect step for a publishing capability. It is not.
6. **QA review is local to comparisons** — there is no global "decisions" surface or export.
7. **No goal/lead-math anywhere** — the product cannot answer "are we on track?" because it does not yet know what "on track" means.
8. **No tracking ingest** — `leads`/`raw_events` tables suggest tracking exists; it does not.
9. **No tests** for the proposal V2 generator's NL polish layer (weak-tail, alt hard gate). Regressions are caught by eyeballing QA runs.
10. **Onboarding business step** is light; does not capture capacity, deal value, close rate, service priorities, areas — all needed for Goal/Masterplan.

## 11. North-Star fit verdict per module

Keep & extend (already aligned):
Auth/tenants, WPCOM connect, Audit Engine, Business Profile V2, Tone Profile, Page Intelligence, Growth Context, Proposal V2, QA Compare, Secrets, LLM router.

Park (built but not connected; revisit when its sprint arrives):
`change_groups`/`changes`/`wp_write_operations` (S5 publishing), `leads`/`lead_events`/`raw_events` (tracking), `pages`/`page_snapshots`, `subscription_plans`.

Redesign before reuse (schema predates new NorthStar):
`master_plans`, `monthly_plans`, `scans`/`issues`/`health_scores`.

Delete or merge (dead duplicates):
`brand_voice_profiles`, `business_profiles` (v1), Proposal V1 path (keep only the table for historical QA compare, stop generating new V1 proposals).

Missing entirely (must build):
Goal Intake, Masterplan Engine, GBP/Local Visibility, Reviews Engine, Tracking ingest + Lead Inbox, Reporting dashboard + monthly loop, Safe Publishing, Landing Page Factory, Approval Center.

---

## 12. Recommended next 3 software steps

**Step 1 — Goal Intake V1 + lead math (small, foundational).**
- New `growth_goals` table (tenant_id, target_leads_per_month, timeframe_months, services[], areas[], avg_deal_value, close_rate, capacity, notes, status).
- New onboarding step + `/settings/goal` page.
- Derive `required_leads_per_month = target_clients / close_rate`.
- Make Goal the new entry point of onboarding (before site connect or in parallel).
- No generator yet, just the source of truth.

**Step 2 — Masterplan V1 (the actual pivot).**
- Drop or redesign `master_plans` / `monthly_plans` to match new model.
- Deterministic generator that takes Goal + Business Profile v2 + Page Intelligence inventory + audit summary and outputs:
  asset map (service pages needed/missing), location plan, GBP plan stub, tracking plan stub, conversion plan stub, monthly roadmap.
- `/masterplan` dashboard route (read-only first).
- Wire Proposal V2 items as children of Masterplan action items (link, do not couple generation yet).

**Step 3 — Cleanup + dashboard shell.**
- Replace empty `/app` with a real home: Goal status, Masterplan progress, last audit, open QA decisions.
- Delete/park unused tables behind a single migration: drop `brand_voice_profiles`, mark `business_profiles` v1 deprecated, leave publishing/tracking schemas for their dedicated sprints.
- Add minimal tests around Proposal V2 NL polish (weak tail, alt hard gate, schema block reasoning) so future iterations don't regress the recent gains.

Do **not** start Safe Publishing (S5) before Masterplan exists. Publishing without a plan is the exact failure mode the new NorthStar is trying to prevent.

---

_End of baseline. Use this as the source of truth for Tech Roadmap v4._
