# LeadLayer — Roadmap V4

> Last updated: 2026-05-25
> Replaces all earlier roadmaps. Aligned with the new North Star:
> **Client Goal → Masterplan → Execution Engine → Human QA → Safe Publishing → Tracking → Reporting → Monthly Growth Loop.**

## North Star

LeadLayer is a **Lead Growth OS**, not an SEO tool.
The audit is a sensor. The proposal engine is a hand. The masterplan is the brain.
The product only matters if it can answer:

> "Did the work we did this month bring the client closer to their growth goal?"

## Completed modules

| Module | Status | Notes |
|---|---|---|
| Auth + Onboarding | ✅ | tenant create, WP probe, membership |
| Audit Engine (WPCOM) | ✅ | objective facts only |
| Business Profile V2 | ✅ | offer / location / conversion / proof |
| Tone Profile | ✅ | corpus + evaluator |
| Page Intelligence | ✅ | page type, intent, target keyword |
| Growth Context Builder | ✅ | composes context for downstream engines |
| Proposal V2 | ✅ | meta, alt, schema; hard gates + evaluator |
| QA Review | ✅ | compare view, correctly-blocked tracking |
| **Goal Intake V1** | ✅ | `growth_goals` + lead math + BP sync |
| **Masterplan V1** | ✅ | `master_plans` + `masterplan_items` + 30/60/90 |

## Missing modules

- ⬜ **Masterplan → Proposal V2 link** (proposals do not know which masterplan item they serve)
- ⬜ **Audit Issue → Masterplan priority mapping** (interpretation layer)
- ⬜ **Execution Board** (single operator cockpit across detect → done)
- ⬜ **Safe Publishing** (approved actions only; rollback; change groups)
- ⬜ **Tracking / Lead Inbox** (manual first, integrations later)
- ⬜ **GBP / Reviews / Local Visibility**
- ⬜ **Reporting / Monthly Growth Loop**

## Sprint order

1. **Roadmap + Dashboard Alignment V1** ← *this sprint*
2. Masterplan → Proposal V2 Link V1
3. Audit Issue → Masterplan Priority Mapping
4. Execution Board V1
5. Safe Publishing
6. Tracking / Lead Inbox V1
7. GBP / Reviews / Local Visibility
8. Reporting / Monthly Growth Loop

Sprint 1 ships docs + nav + dashboard alignment only. No new tables, no
proposal-masterplan coupling, no publishing.

## Modular Architecture Contract

The product scales only if modules stay clean. Each module owns its own
schema, its own server functions, and a clear input/output contract.
Cross-module writes happen via explicit sync server functions, never via
ad-hoc mutation.

1. **Audit Engine remains objective.**
   It detects facts and stores raw evidence. It does not decide business
   strategy or rewrite severity based on goal context.

2. **Masterplan Engine owns strategic priorities.**
   It converts the growth goal into required assets and actions.

3. **Page Intelligence interprets page role.**
   Page type, intent, commercial priority, desired action.

4. **Growth Context Builder composes context.**
   Reads Goal, Business Profile, Tone Profile, Page Intelligence, Audit
   Issue and Masterplan Item. No data ownership, no side effects.

5. **Proposal Engine creates suggested actions.**
   A proposal may link to `audit_issue_id`, `page_id`, `masterplan_item_id`,
   `growth_goal_id`. It does NOT mutate masterplan, audit, or publishing
   tables directly.

6. **QA Review owns human evaluation.**
   Stores review feedback per proposal/run.

7. **Execution Board** coordinates status across masterplan items,
   proposals, approvals, publishing and tracking.

8. **Publishing** runs only on approved execution actions. Never on raw
   audit issues or unreviewed proposals. Snapshot + rollback required.

9. **Tracking** measures outcomes and links results back to goals, pages,
   actions and masterplan items where possible.

## Schema status (post-Goal/Masterplan)

| Table | Status | Notes |
|---|---|---|
| `tenants`, `memberships` | live | core |
| `site_connections`, `audits`, `audit_pages` | live | audit module |
| `business_profiles_v2`, `tone_profiles` | live | intelligence |
| `page_intelligence` | live | page module |
| `proposals_v2`, `proposal_runs`, QA tables | live | proposal module |
| `growth_goals` | **newly active** | Goal Intake V1 |
| `master_plans`, `masterplan_items` | **newly active** | Masterplan V1 |
| `leads`, `raw_events` | legacy / parked | will be redesigned for Tracking module |
| `change_groups` | legacy / parked | will be redesigned for Publishing module |
| `proposals` (V1) | legacy | superseded by `proposals_v2` |

Do not delete legacy tables yet — keep until the replacement module lands,
then migrate or drop in a dedicated cleanup sprint.

## Out of scope for this sprint

- Connecting proposals to masterplan items (next sprint)
- Any publishing code
- Tracking / reporting
- Removing audit/proposal/QA functionality
