# Lead Inbox + Goal Progress V1

Sprint scope: manual lead logging, goal progress dashboard card, and snapshot tracking slice wired to real lead data.

## What was built

### `/growth/leads` — Lead Inbox page
- Log leads manually: name, phone, email, source, service, location, status, estimated value, notes.
- Stats summary strip: total, last 7 days, last 30 days, qualified, won.
- Lead table with date, name, source, service, status badge, closed amount, "Mark won" button.
- "Mark as won" modal: requires `closedAmount` (numeric, required), optional `wonNotes`. Sets `status = won`, `closed_at = now()`.
- Form inputs use `INPUT_CLS` constant (no raw Tailwind class="input").
- Invalidates `growth-intelligence-snapshot` query on lead log so the tracking slice updates immediately.

**Server functions used** (from `src/lib/shared/leads/repo.functions.ts`):
- `logLeadManually` — inserts a lead row + audit event
- `listLeads` — reads inbox (latest 100, operator/owner only); now includes `closedAmount`, `closedAt`, `wonNotes`
- `getLeadStats` — aggregates total / last 7d / last 30d / by-status counts
- `markLeadWon` — transitions lead to `won`, records `closed_amount`, `closed_at`, `won_notes`; logs `marked_won` event

### Revenue chain (Delivery Proof + Revenue Chain V1)

New DB columns on `leads`:
| Column | Type | Notes |
|---|---|---|
| `closed_amount` | numeric nullable | Operator-recorded closed deal value; required on `markLeadWon` |
| `close_probability` | numeric nullable | 0–1 estimate for pipeline revenue projection |
| `closed_at` | timestamptz nullable | Set automatically by `markLeadWon` |
| `won_notes` | text nullable | Optional operator notes at close |

Monthly reports now sum `closed_amount` for won leads in the period → `provenRevenue`. Pipeline revenue (`pipelineRevenue`) is calculated from `close_probability × closed_amount` for qualified leads not yet won/lost.

### Dashboard `/app` — Goal Progress card
- Shown only when an active growth goal exists.
- Displays: required leads/month (= `goal.requiredLeads / goal.timeframeMonths`), actual leads last 30 days, gap (highlighted amber if behind), total logged.
- CTA links to `/growth/leads`.
- Reads `getLeadStats` in parallel with other dashboard queries.

### Growth Intelligence Snapshot — tracking slice
- `buildTrackingSlice` now receives real `leadCounts { last30Days, total }`.
- `status: "partial"` if any manual leads exist; `"missing"` if none.
- `currentLeadBaseline` = actual leads in the last 30 days (falls back to `goal.currentCount` if no leads).
- `confidence: 0.4` when partial (was 0 / 0.2 before).
- Automated call tracking, form tracking, analytics, attribution remain `false` — not connected.

## Intentionally out of scope
- GA4 / GSC integration
- Call tracking / form webhook ingestion
- CRM integration
- WordPress draft creation or publishing
- Client portal / monthly report generation
- UI redesign
