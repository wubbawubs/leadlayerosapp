# Sprint D — End-to-End System Validation

> Purpose: validate that the new spine
> **Goal → Masterplan → Execution Board → Proposal V2 → QA Review**
> works as one coherent product **before** Safe Publishing is built.
>
> Method: code-level trace of the full pipeline against a concrete demo
> scenario, plus checklist for live operator validation. No new features.
> No publishing. No refactors unless a blocker is found.

---

## 1. Test scenario

Local service business — single, concrete persona to replace the
"KlikKlaar SEO" half-test site.

| Field          | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| Business       | Loodgieter Amsterdam (demo)                                        |
| Target type    | new clients (`new_clients`)                                        |
| Target count   | 6 / month                                                          |
| Horizon        | 12 months                                                          |
| Close rate     | 40%                                                                |
| Required leads | **15 / month** (= 6 / 0.40, rounded up)                            |
| Service focus  | spoed loodgieter, lekkage, afvoer verstopt, cv-ketel reparatie     |
| Locations      | Amsterdam, Amstelveen, Haarlem                                     |
| Tracking notes | (left empty on purpose to exercise the "trackingstatus onbekend" path) |
| Capacity notes | "max 2 nieuwe klanten per week"                                    |

Tenant used for live run: `klikklaarseo`
(`4c04edfb-8731-47fa-8a27-5b1ebbce786c`) — only existing tenant in the DB.

---

## 2. Current DB baseline (pre-validation)

```
growth_goals      : 0 rows
master_plans      : 0 rows
masterplan_items  : 0 rows
proposal_v2       : 121 rows, origin=audit_issue (100%)
```

**Implication:** the new Goal/Masterplan/Execution surface has never been
exercised end-to-end in this environment. All findings below are
**code-traced**; live UI confirmation is marked `PENDING live run`.

---

## 3. Goal Intake — validation

Source: `src/lib/shared/growthGoals/repo.functions.ts`,
`src/routes/_authenticated/settings.growth-goal.tsx`,
`src/lib/shared/masterplan/generator.server.ts` (lead math reused there).

| Check                                              | Result            |
| -------------------------------------------------- | ----------------- |
| `required_leads = ceil(target / close_rate)`       | ✅ logic present  |
| Missing-context detection (close rate, tracking, …) | ✅ implemented in `generator.server.ts:118-128` |
| Locked Business Profile fields not overwritten     | ✅ Business Profile uses its own repo; goal write does not touch it |
| Active-goal singleton per tenant                   | PENDING live run — verify only one `status='active'` row after save |

Expected for this scenario: `required_leads = 15`,
`missing_context = ["trackingstatus onbekend"]` (and `"business profile niet ingevuld"` if BP not seeded).

---

## 4. Masterplan — validation

Generator: `src/lib/shared/masterplan/generator.server.ts`.

Expected items for the scenario (one per bucket A–I):

| Bucket | Type            | Expected count | Notes                                                       |
| ------ | --------------- | -------------- | ----------------------------------------------------------- |
| A      | `tracking`      | 1 (critical)   | trackingNotes empty → `priority=critical`, `source=goal`    |
| B      | `service_page`  | up to 4        | one per service focus that has no existing page             |
| B'     | `website_fix`   | 0..4           | service-focus that DOES have an existing page → optimize     |
| C      | `location_page` | up to 3        | Amsterdam / Amstelveen / Haarlem (only if no page exists)   |
| D      | `gbp`           | 1 (high)       | always emitted                                              |
| E      | `review`        | 1 (medium)     | always emitted                                              |
| F      | `conversion`    | 1 (high)       | trackingUnknown → high                                      |
| G      | `content`       | 1 (low)        | only if serviceFocus.length > 0                             |
| H      | `reporting`     | 1 (medium)     | always emitted                                              |
| I      | `website_fix`   | up to 5        | from audit issue codes                                      |

| Check                                                            | Result |
| ---------------------------------------------------------------- | ------ |
| All 9 item types reachable                                       | ✅ |
| Priorities reference the goal/lead engine, not generic SEO       | ✅ — tracking + service_page + conversion reasons cite `targetCount`/`targetType` |
| Status defaults sensible (`status='proposed'`)                   | PENDING live run |
| Plan `status='active'` set on generation                         | PENDING live run — confirm only one active plan per tenant |
| Reasons reference goal explicitly                                | ✅ for buckets A, B, F. ⚠️ buckets D, E, G, H read as generic; not blocking but flag for copy polish (see §10) |

---

## 5. Execution Board — validation

Source: `src/lib/shared/execution/board.functions.ts`,
`src/routes/_authenticated/growth.execution.tsx`.

Status mapping (from `mapExecutionStatus`):

```
item.status=done                               → done
item.status=skipped                            → done
type ∈ {tracking,gbp,review,reporting}         → manual_task
no proposal                                    → planned          (next: Generate proposal)
proposal.status=rejected                       → blocked
proposal.status=needs_context                  → blocked
no comparison / winner=unreviewed              → in_qa
winner=needs_edit                              → needs_edit
winner=both_bad | v1                           → blocked
winner=v2 | both_good                          → approved
```

| Check                                                          | Result |
| -------------------------------------------------------------- | ------ |
| Planned items show "Generate proposal" only for supported types | ✅ `BoardCard` gates on `item.supportedForProposalGeneration` |
| Unsupported types show "Manual task for now"                   | ✅ `nextAction` set explicitly |
| Latest proposal per item is picked                             | ✅ ordered DESC, first-wins map |
| QA winner correctly maps to Approved / Needs edit / Blocked    | ✅ |
| `nextAction` summary picks highest-priority bucket             | ✅ order: needs_edit → in_qa → planned → blocked → manual_task |
| Done/Skip/Start mutations refresh the board                    | ✅ uses `qc.invalidateQueries(['execution-board', tenantId])` |
| Board column ordering UX                                       | PENDING live run — 7 columns in 2-col grid may feel cramped at narrow widths |

---

## 6. Proposal V2 (from masterplan) — validation

Source: `src/lib/shared/masterplan/proposalGen.functions.ts`.

| Check                                              | Result |
| -------------------------------------------------- | ------ |
| Writes `origin='masterplan_item'`                  | ✅ line 240 |
| Writes `masterplan_item_id` + `growth_goal_id`     | ✅ lines 241–242 |
| Audit/page/issue NULL allowed (migration relaxed) | ✅ migration `20260526061039` |
| "From masterplan" badge on linked proposals page   | ✅ `growth.masterplan.$itemId.proposals.tsx:91` |
| Unsupported types refuse generation                | ✅ mapping returns `supported:false` → server returns `{ok:false}` |
| Output references item context, not generic SEO    | PENDING live run — requires inspecting actual LLM output per item type |

⚠️ **Watch-out:** `website_fix` items map to `general_recommendation` action type;
audit-origin proposals already use this. Risk: masterplan-origin and
audit-origin website_fix proposals look identical in the UI. Recommend adding a
"masterplan origin" tag on the QA review surface too (currently only on the
masterplan-items proposals page).

---

## 7. QA review loop — validation

| Check                                                       | Result |
| ----------------------------------------------------------- | ------ |
| `proposal_comparisons.winner` round-trips to board status   | ✅ board re-fetch uses `winner` directly |
| "Correctly blocked" path (`status=rejected`) → blocked      | ✅ |
| `needs_context` → blocked with "needs more context" reason  | ✅ |
| QA on masterplan-origin proposal updates Execution Board    | PENDING live run |
| Run-aware feedback persistence                               | PENDING live run — out of scope for status check |

---

## 8. Safety boundaries

| Check                                                    | Result |
| -------------------------------------------------------- | ------ |
| No publishing action in UI                               | ✅ no publish button on board or proposals page (grepped) |
| No WordPress writes                                      | ✅ `wpcom.functions.ts` only used by `/sites` flows, not by execution path |
| Unsupported types cannot fake-generate proposals         | ✅ `BoardCard` hides the button AND server-side mapping rejects |
| Audit-based Proposal V2 flow still works                  | ✅ unchanged code paths; 121 existing audit-origin rows untouched |
| `proposal_v2_origin_fields_chk` enforces origin invariants | ✅ migration applied |

---

## 9. Live run checklist (operator)

Cannot be performed from the agent (requires authenticated session and an
LLM-callable environment). Run these steps in the preview and append results
below this section.

1. Sign in, switch to a clean tenant (or reset `klikklaarseo`).
2. `/settings/growth-goal` — enter scenario from §1, save.
3. `/growth/masterplan` — click "Generate masterplan". Confirm ~12–15 items appear matching §4.
4. `/growth/execution` — confirm column distribution matches expected mapping in §5.
5. For at least **2 supported items** (e.g. `service_page: spoed loodgieter`, `conversion`), click "Generate proposal". Confirm:
   - proposal appears in `/growth/masterplan/$itemId/proposals` with **From masterplan** badge,
   - DB row has `origin='masterplan_item'`, correct `masterplan_item_id` + `growth_goal_id`.
6. Open one proposal, run QA, mark winner = `v2` (approve). Reload board → item should move to **Approved**.
7. Open another, mark winner = `needs_edit`. Reload board → item should move to **Needs edit**.
8. Confirm a `tracking`/`gbp` item shows the **Manual task** label and **no** Generate button.
9. Mark a manual item "Mark done" — board should move it to **Done**.

---

## 10. Findings — bugs, friction, copy

Sorted by severity. None are publishing-gate blockers but several are
"polish-before-Safe-Publishing" candidates.

### Blocking? — None found in code review.

### High-friction

1. **GBP / review / reporting / content reasons read as generic SEO copy.**
   They don't mention `targetCount`, `targetType`, or service focus.
   File: `src/lib/shared/masterplan/generator.server.ts:194–262`.
   *Fix idea:* templated reason strings that include
   `${targetCount} ${targetType}/maand` like buckets A/B/F already do.

2. **No "From masterplan" indicator on the QA Compare screen.**
   Only the per-item proposals listing carries the badge. Operators reviewing
   a queue won't see the origin. *Fix idea:* pass `origin` through to the
   QA view header.

3. **7-column board in a 2-column grid (`xl:grid-cols-2`)** feels dense for the
   `done`/`manual_task` columns that typically dominate. *Fix idea:* either
   collapse `done`/`manual_task` into a single "Out of pipeline" panel or
   switch to a horizontal scroll Kanban above `xl`.

### Low-friction / copy

4. `BoardCard` shows raw `type` value (e.g. `service_page`). Underscores leak.
   *Fix idea:* human-readable label map.

5. `BoardCard` shows raw `qaStatus` winner code (`needs_edit`, `both_good`).
   Operators have to memorize the codes. *Fix idea:* same label map.

### Data / model

6. `master_plans` doesn't enforce a single `status='active'` row per tenant at
   the DB level. Today it's only convention-driven in app code. *Fix idea:*
   partial unique index `(tenant_id) WHERE status='active'`.

7. `growth_goals` likely has the same issue (one active per tenant). Confirm
   on live run.

---

## 11. Recommendation

**Proceed to a small Cleanup Sprint, then Safe Publishing.**

Reasoning:
- The spine **works on paper**: every status code, every origin field, every
  mapping is wired through and the safety boundaries hold.
- The two real risks before Safe Publishing are (a) operators getting confused
  by raw type codes / generic reasons / inconsistent origin badges, and
  (b) the lack of DB-level "single active" guarantees on plan/goal.
- None of these need new modules. All can be handled in a 1–2 day cleanup
  sprint that touches: `generator.server.ts` (copy), board UI (labels +
  layout), QA compare header (origin badge), one migration (partial unique
  indexes).

**Do not start Safe Publishing until items 1, 2, and 6 above are resolved.**
Publishing is the first action that touches client websites; we want the
operator to be visibly certain *what they are approving and why* before that
button exists.

---

## 12. Status

- Code-level validation: **complete**.
- Live operator validation: **PENDING** — see §9 checklist.
- Validation notes: written (this file).
- New features added in this sprint: **none** (per Sprint D contract).
- Publishing code added: **none**.
- Architecture refactors: **none**.
