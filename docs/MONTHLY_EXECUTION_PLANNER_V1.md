# Monthly Execution Planner V1

Forward-looking monthly plan: what LeadLayer executes next month to close the lead gap and justify the retainer.

## Distinction from Monthly Reports

| | Monthly Report | Monthly Execution Plan |
|---|---|---|
| Direction | Backward-looking | Forward-looking |
| Content | What happened | What to do next month |
| Primary audience | Client accountability | Operator planning |
| Generation | End of period | Beginning of next period |
| Basis | Actual lead data, delivery count | Snapshot, Masterplan items, lead gap |

## Architecture

### Data model: `monthly_execution_plans`

| Column | Notes |
|---|---|
| `period_start` / `period_end` | Next month's dates |
| `package_tier` | `starter \| growth \| pro` — controls action count |
| `status` | `draft → ready_for_review → approved → in_execution → completed → archived` |
| `lead_gap_summary` | required/month, actual (last 30d), gap, pace note |
| `selected_actions` | Array of `PlanAction` — the concrete deliverables |
| `expected_impact` | Projected lead uplift, pages to deliver, note |
| `required_inputs` | Aggregated operator inputs across all actions |
| `risks` | WP connection, tracking weakness, large gap, etc. |

### Plan Builder (`monthlyExecutionPlanBuilder.server.ts`)

Fully deterministic, no LLM. Loads:
- Active growth goal (lead math)
- Leads from last 30 days (current pace)
- Active Masterplan items (non-done)
- Execution artifacts and approval status
- WordPress drafts (already created)
- WordPress connection + capabilities
- Latest Monthly Report
- Latest Growth Intelligence Snapshot (tracking, GBP, WP readiness)

### Action selection rules

1. **No busywork.** Every action must close the lead gap or strengthen a blocker.
2. **Approved artifacts with no WP draft → highest priority** (`Create WordPress draft`).
3. **Planned page items with no brief → generate + approve** (`Generate + approve page brief`).
4. **Briefs in review → operator approval** (unblocks draft creation).
5. **Tracking weak → measurement action is prioritized.**
6. **GBP incomplete → local visibility action is prioritized.**
7. **WordPress not connected → conversion action requires connection first.**
8. Always includes ≥1 trust/proof action and ≥1 measurement action.
9. Always includes ≥1 reporting/review action.

### Package tier limits

| Tier | Actions |
|---|---|
| Starter | 2–3 |
| Growth | 4–5 |
| Pro | 6–8 |

### Action categories

| Category | Examples |
|---|---|
| `visibility_asset` | Create WP draft, generate/approve page brief |
| `conversion_improvement` | Audit CTA placement, connect WordPress |
| `trust_or_proof` | Add proof points, request Google reviews |
| `local_visibility` | GBP audit, GBP posts |
| `measurement` | Set up lead tracking, review lead quality |
| `reporting_or_review` | Generate Monthly Report, refresh Masterplan priorities |

### Action fields

Each action includes:
- `title`, `category`, `priority`, `deliveryType` (software/operator/hybrid/manual)
- `expectedLeadImpact` (low/medium/high)
- `rationale` — why this action was selected
- `successMetric` — how the operator knows it's done
- `requiredInputs` — what the operator needs to provide
- Links to `masterplanItemId`, `executionArtifactId`, `wordpressDraftId` when available

## V1 limitations

- **No auto-scheduling** — operator generates plans manually at start of month
- **No email sending** — plan is operator-facing only
- **No client portal** — client does not see the plan directly
- **No PDF export** — narrative for sharing must be copy-pasted
- **Deterministic only** — no LLM-generated action text in V1; all rationale is template-based

## How it connects to the full loop

```
Monthly Report (backward)
       ↓ "Generate next month's plan →" link
Monthly Execution Plan (forward)
       ↓ Operator approves
Execution Board — page brief generation, WP draft creation
       ↓ Leads flow in via webhook or manual
Lead Inbox + Goal Progress
       ↓ End of month
Monthly Report (next period)
```
