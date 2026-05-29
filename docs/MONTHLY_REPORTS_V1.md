# Monthly Reports V1

Operator-generated monthly progress report: what was delivered, how many leads came in vs. the goal, and what happens next. Closes the client accountability loop.

## What was built

### Database (`monthly_reports`)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | FK → tenants |
| `growth_goal_id` | uuid | FK → growth_goals (nullable) |
| `period_start` | date | YYYY-MM-DD |
| `period_end` | date | YYYY-MM-DD |
| `status` | text | draft → ready_for_review → approved → sent → archived |
| `lead_summary` | jsonb | total, qualified, won, lost, new, unqualified, sources |
| `execution_summary` | jsonb | artifactsGenerated, artifactsApproved, itemsDone, itemsInProgress |
| `wordpress_summary` | jsonb | draftsCreated, drafts[]{title, targetSlug, wpEditLink, status} |
| `goal_progress_summary` | jsonb | requiredLeadsPerMonth, actualLeads, gap, onTrack, paceNote |
| `next_actions` | jsonb | label, reason, href, priority |
| `risks` | jsonb | key, label, severity, description |
| `narrative` | text | Template-based plain-English draft |
| `share_token` | text nullable unique | 32-char hex public share token |
| `share_token_created_at` | timestamptz nullable | When the token was last generated |

RLS: members can SELECT; operator/owner can INSERT/UPDATE/DELETE.

### Report Builder (`src/lib/shared/monthlyReports/monthlyReportBuilder.server.ts`)

`buildMonthlyReport({ tenantId, periodStart, periodEnd })` queries:
- Active growth goal (for `requiredLeadsPerMonth`)
- `leads` table filtered by `created_at BETWEEN periodStart AND periodEnd`
- `execution_artifacts` created or updated in the period
- `wordpress_drafts` created in the period
- `masterplan_items` updated in the period

**No LLM.** Narrative is template-based and clearly marked as a draft for operator editing. Next actions and risks are derived deterministically from the data.

### Share columns (`monthly_reports`)

| Column | Type | Notes |
|---|---|---|
| `share_token` | text nullable unique | 32-char hex token for public access |
| `share_token_created_at` | timestamptz nullable | When the token was last generated |

RLS: authenticated policies unchanged. Public route fetches by token via `supabaseAdmin` (service role) — no broad public table access.

### Server Functions (`src/lib/shared/monthlyReports/monthlyReports.functions.ts`)

| Function | Description |
|---|---|
| `generateMonthlyReport` | Builds + inserts a report row. Operator/owner only. |
| `getLatestMonthlyReport` | Fetches most recent report by `period_start DESC`. Members can read. |
| `listMonthlyReports` | Lists up to 24 reports newest-first. Members can read. |
| `updateMonthlyReportStatus` | Status transitions: draft → ready_for_review → approved → sent → archived. Operator/owner only. |
| `generateMonthlyReportShareLink` | Generates a 32-char hex token, stores it in `share_token`. Returns `/r/:token` path. Operator/owner only. Re-generating always overwrites the previous token. |
| `revokeMonthlyReportShareLink` | Clears `share_token` and `share_token_created_at`. Token-holders immediately lose access. Operator/owner only. |
| `getReportByShareToken` | No-auth lookup by token via service role. Never returns `tenant_id`. Used by the public route. |

### UI Route (`/growth/reports`)

Operator-facing page:
- Period date pickers (default: current month)
- "Generate report" button
- Report list sidebar (period label + status badge)
- Report detail: stats grid, delivery section, lead breakdown, next actions, risks, narrative
- Status transition buttons (Mark ready / Mark approved / etc.)
- Share link section (visible for `ready_for_review`, `approved`, `sent` reports):
  - "Generate share link" → creates token, shows copyable URL
  - Copy button → writes `window.location.origin + /r/:token` to clipboard
  - "Revoke link" → clears token; existing link-holders immediately lose access

### Public Report Route (`/r/:shareToken`)

No auth required. Accessible at `/r/<32-char-hex-token>`.

- Fetches report by `share_token` via service role (`supabaseAdmin`) — no public RLS bypass
- Shows: period, goal progress, lead breakdown, delivery (WP drafts), narrative, next actions, risks
- Never exposes `tenant_id`, internal UUIDs, or debug data
- Invalid / revoked token → "Report not found" page
- Read-only — no editing, no login prompt, no client portal

### Dashboard card (`/app`)

Compact "Monthly report" card showing:
- Current report status badge
- Lead gap (amber if behind)
- Leads logged count
- WP drafts count
- CTA → `/growth/reports`

### Schemas (`src/lib/shared/monthlyReports/schemas.ts`)

Domain types: `MonthlyReport`, `LeadSummary`, `GoalProgressSummary`, `ExecutionSummary`, `WordpressSummary`, `ReportNextAction`, `ReportRisk`, `MonthlyReportStatus`.

## Revenue + Delivery proof (Delivery Proof + Revenue Chain V1)

### GoalProgressSummary additions
| Field | Type | Notes |
|---|---|---|
| `wonLeadCount` | number | Leads marked won in the period |
| `provenRevenue` | number | Sum of `closed_amount` for won leads in the period |
| `pipelineRevenue` | number nullable | Estimated revenue from qualified leads (`close_probability × closed_amount`) |

### WordpressSummary additions
| Field | Type | Notes |
|---|---|---|
| `draftsPublished` | number | Drafts with `published_at` in the report period |
| `drafts[].publishedAt` | string nullable | When the draft was marked published |
| `drafts[].publishedUrl` | string nullable | Live URL of published page |

### Narrative
- Includes "Recorded Revenue" section if `provenRevenue > 0`.
- Distinguishes "pages published live" from "drafts awaiting publish."
- Next actions updated: "Publish pending WordPress drafts" replaces generic draft review.

### Public share page (`/r/:shareToken`)
- Shows "Pages published" (or "Pages in draft" if none published yet).
- Shows "Recorded closed revenue" block if `provenRevenue > 0` with won lead count.

## V1 intentional limits

- **Operator-generated, not scheduled** — the operator clicks "Generate" when ready
- **No email or PDF** — narrative is editable text for copy-paste into client comms
- **Manual lead data only** — GA4/call tracking/form attribution not connected
- **No client portal** — share link is public read-only; no client login
- **No monthly lock** — periods can overlap; no enforcement of one-report-per-month
- **Share link is permanent until revoked** — no expiry; revoke manually to cut access
- **No custom domain** — share URL is the operator's own app domain

## Share link security model

- Token is a 32-char random hex value (128-bit entropy via `crypto.randomBytes`)
- Public route validates token length and hex format before querying
- Lookup uses `supabaseAdmin` (service role); authenticated RLS policies are unchanged
- `tenant_id` is never returned to the public page
- Operator regenerates or revokes via the `/growth/reports` UI

## Future

- Automated monthly generation trigger (cron or webhook)
- PDF export via headless browser
- Full client portal with login (replaces share link)
- Automatic lead attribution (GA4, form webhooks, call tracking)
- Monthly report email to client with share link embedded
- ProductFlow `monthly_review` lifecycle stage unlocked when report exists for current period
