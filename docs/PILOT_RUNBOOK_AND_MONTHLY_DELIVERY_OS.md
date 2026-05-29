# Pilot Runbook + Monthly Delivery OS

**For operators and sales only. Not a client-facing document.**

LeadLayer is a managed local lead growth OS. This document defines how to run the first paid pilots: who to take on, how to set them up, how to run the monthly loop, what to promise, and what not to promise.

---

## 1. Pilot Positioning

LeadLayer is not an SEO tool. It is not a marketing agency. It is a managed operating system for local lead growth.

What that means in practice:

- We start with the client's **revenue goal**, not keywords.
- We build a **masterplan** from market data, competitor gaps, and site weaknesses.
- We execute **page briefs and WordPress drafts** against that plan.
- We track **real leads** — manually or via webhook — and record closed revenue.
- We produce a **monthly progress report** with delivery proof, lead data, and next actions.
- The **operator** drives every step. The client sees results, not the engine.

The value proposition to the client: **"We run the growth engine for you. You see what was delivered, how many leads came in, and what happens next month — every month."**

Do not position it as rankings, traffic, or SEO. Position it as lead growth and delivery accountability.

---

## 2. Ideal First Pilot Client

Take on a pilot client only if all of the following are true.

### Hard constraints

| Constraint | Requirement |
|---|---|
| Business locations | **Single location or single service area only.** No franchise, no multi-branch, no multi-city operations at this stage. |
| Language | **One primary language per tenant.** Dutch or English — not mixed. |
| WordPress setup | **Self-hosted WordPress preferred.** Must have Application Passwords enabled. WordPress.com is not supported in V1 for draft creation. |
| Business type | **Simple service-area business.** Examples: HVAC, plumber, electrician, roofer, pest control, cleaning service, auto repair, landscaping, accountant. |
| Lead value | **Minimum €500 per closed deal.** Lower deal values make ROI too hard to demonstrate within a pilot period. |
| Lead tracking | **Form webhook supported, OR operator willing to log leads manually.** If neither, the lead chain breaks and monthly reports cannot show proof. |
| Publishing | **Client accepts operator-managed publishing.** Operator publishes pages in WP admin, then marks as published in LeadLayer. No live auto-publishing. |
| Commitment | **Minimum 6-month agreement.** Two to three full monthly loops are needed to show real progress. |
| Contract value | **Minimum €1,000/month.** Below this, the operator overhead is not justified at current automation levels. |

### Soft preferences

- Business has an active GBP profile (stronger intelligence pipeline output)
- Client is not already spending heavily on paid ads (organic proof is cleaner)
- Client is comfortable with digital tools and can confirm won revenue
- Client does not have an existing SEO agency relationship that conflicts

### Disqualifiers at this stage

- Multi-location or franchise operations
- E-commerce or non-service businesses
- Businesses that require multi-language targeting (e.g. Dutch + English)
- Clients who need a full white-label client portal before they will trust the product
- Clients expecting guaranteed rankings or traffic numbers

---

## 3. What Is Included in Setup

Setup runs over four weeks before the first monthly loop begins.

### Week 1 — Foundation

**Operator tasks:**

1. Create the tenant in LeadLayer (invite yourself as operator)
2. Connect the client's WordPress site:
   - Go to **Sites → Add site**
   - Probe URL, confirm connection, run capability check
   - Confirm `canCreateDraft: true` before proceeding
3. Create a lead ingestion source:
   - Go to **Leads → Lead capture sources**
   - Create a webhook source named after the client's main contact form
   - Share the endpoint URL + public key with the client for their form plugin setup
   - If no supported form plugin: explain manual logging process to client
4. Define the growth goal:
   - Go to **Settings → Growth Goal**
   - Enter: required leads/month (or target revenue), close rate, average lead value, timeframe
   - This drives all downstream modeling and report targets

**Deliverable to client:** "Your growth tracking is live. We'll now run a full intelligence scan of your site, market, and competitors."

---

### Week 2 — Intelligence

**Operator tasks:**

1. Complete the business profile:
   - Go to **Settings → Business Profile**
   - Enter: primary service(s), service area(s), target audience, key offers, proof points (reviews, certifications, years in business)
   - Review all fields — this is what the AI uses to write page briefs and briefs
2. Complete the tone profile:
   - Go to **Settings → Tone Profile**
   - Paste 2–3 samples of the client's existing copy (website, emails, ads)
   - Run tone analysis
   - Review output and adjust if it sounds wrong
3. Run the intelligence pipeline:
   - Go to **Growth → Intelligence**
   - Trigger the pipeline: site audit, page intelligence, market scan, competitive intelligence, GBP intelligence
   - Wait for all stages to complete (check for errors)
4. Review the snapshot output:
   - Check for: tracking gaps, site weaknesses, market gaps, competitor advantages, GBP completeness
   - Note the top 1–2 blockers that are dragging down the growth potential score

**What can go wrong:**
- Market scan may return sparse data for very niche or very local businesses — acceptable in V1
- GBP intelligence requires a valid GBP Place ID — confirm with client if missing
- Tone analysis may produce a generic result if samples are too short — add more copy

**Deliverable to client:** "We've completed your growth intelligence scan. Here's what we found: [top 3 findings]. This drives what we build first."

---

### Week 3 — Planning + First Execution

**Operator tasks:**

1. Generate the snapshot:
   - Go to **Growth → Intelligence → Generate Snapshot**
   - Review the output: growth potential score, blocking issues, opportunities
2. Generate the blueprint:
   - From the snapshot, go to **Growth → Blueprint**
   - Review the proposed focus areas
3. Generate the masterplan:
   - Go to **Growth → Masterplan → Generate Masterplan**
   - Review the masterplan items (service pages, location pages, tracking items, GBP tasks)
   - Reorder or adjust priorities if needed
4. Generate the first page brief:
   - Go to **Growth → Execution**
   - Find the highest-priority `service_page` or `location_page` item
   - Click **Generate page brief**
   - Review the generated brief: H1, intro, service sections, proof block, FAQ, CTA
   - Approve or regenerate if quality is insufficient
5. Create the WordPress draft:
   - With the artifact approved, click **Create WordPress draft**
   - Confirm the draft appears in WP admin (check the Edit in WP link)
   - Review the draft in WP — check formatting, images to add, links to wire

**What can go wrong:**
- Page brief generation uses a fallback template if the AI call fails — output is safe but generic; review carefully before approving
- WordPress draft creation fails if the connection token has expired — re-probe the connection first

**Deliverable to client:** "We've created your first page draft in WordPress. Here's the preview link: [link]. We'll publish this once you confirm it's ready."

---

### Week 4 — First Publish + Tracking Live

**Operator tasks:**

1. Publish the WordPress page:
   - In WP admin: review the draft, add images, internal links, fix formatting if needed
   - Set status to **Publish**
2. Mark as published in LeadLayer:
   - Go to **Growth → Execution**
   - On the draft card, enter the published URL and click **Mark as published**
   - The board moves the item to **Done**
3. Confirm lead tracking:
   - Test the form webhook: submit a test lead via the client's contact form
   - Confirm it appears in **Leads → Lead Inbox**
   - If no webhook: log a test lead manually (source: "manual")
4. Generate the first monthly report:
   - Go to **Reports → Generate report**
   - Set the period to cover setup month (even if sparse data)
   - Review the narrative, delivery summary, lead counts, risks, next actions
   - Edit narrative if needed
   - Mark as **Approved**
   - Generate the share link (button on the report)
   - Send the share link URL to the client
5. Generate the first monthly execution plan:
   - Go to **Reports → Monthly Plan → Generate plan**
   - Review the proposed actions for next month
   - Approve the plan
   - Share top 3 actions verbally with client in the onboarding call

**Deliverable to client:** "Here is your first monthly progress report: [share link]. One page is live. Lead tracking is active. Here's what we'll do next month."

---

## 4. Monthly Operating Loop

The monthly loop runs on a fixed rhythm: **report backward → plan forward → execute → measure**.

### Step 1 — Report Backward (first 3 days of month)

Go to **Reports → Generate report** for the previous month.

Check and record:
- **Leads logged:** total, by status, by source
- **Won leads:** how many, total closed amount (€)
- **Drafts created:** how many page briefs created in the period
- **Drafts published:** how many pages marked published (live)
- **Goal gap:** leads vs. required target
- **Risks:** anything the builder flagged (no leads, no delivery, lead gap growing)
- **Narrative:** read the template narrative — edit before sending if it sounds off

Actions:
- Set report status to **Approved**
- Generate the share link
- Send share link to client with a short summary message

**Time estimate:** 30–60 minutes including narrative review and editing.

---

### Step 2 — Plan Forward (days 3–5 of month)

Go to **Reports → Monthly Plan → Generate plan** (or **Growth → Monthly Plan**).

Review the plan output:
- Priority actions from the masterplan
- Delivery actions (which pages to create next)
- Measurement actions (tracking items to check)
- GBP/reviews actions (manual tasks)

Confirm the plan covers the highest-priority items. Adjust by hand if the generator misses context.

Approve the plan.

Share the top 3 actions with the client in a short message or call.

**Time estimate:** 20–40 minutes.

---

### Step 3 — Execute (days 5–25 of month)

Work through the monthly execution plan items:

| Item type | How to execute |
|---|---|
| `service_page` or `location_page` | Generate page brief → review → approve → create WP draft → publish → mark as published |
| `conversion` (CTA, form, trust signals) | Manual task — do in WP admin, note in Lead Inbox or manually |
| `tracking` | Check form webhook, confirm leads are flowing, update ingestion source if needed |
| `gbp` | Manual — update GBP profile, add photos, respond to reviews |
| `review` | Manual — send review request link to recent customers |
| `reporting` | Handled in Step 1 each month |

**Pace:** Aim for 2–3 page drafts per month maximum in V1. Quality over quantity.

---

### Step 4 — Measure (ongoing + end of month)

- Check **Lead Inbox** weekly — review new leads, mark qualified/unqualified
- Mark won leads with closed amount when client confirms a deal closed
- If form webhook is live: leads auto-appear; mark their status manually
- If manual: log leads from client's call log, email, or WhatsApp updates
- End of month: the data is ready for Step 1 of the next loop

---

## 5. How Context Flows Through the System

Each layer feeds the next. Understanding this flow is essential for diagnosing problems.

```
Growth Goal
  └─ Sets: required leads/month, close rate, lead value, timeframe
  └─ Drives: all downstream gap calculations and priority logic

  ↓

Growth Intelligence Snapshot
  └─ Aggregates: site audit, page intel, market scan, competitors, GBP, tracking status
  └─ Produces: growth potential score, blocking issues, opportunity scores
  └─ Drives: blueprint and masterplan content

  ↓

Blueprint
  └─ Converts snapshot findings into focus areas: which pages, which gaps, which issues
  └─ Drives: masterplan item generation

  ↓

Masterplan
  └─ Breaks focus areas into executable items with type, priority, effort, impact
  └─ Drives: execution board, monthly execution plans

  ↓

Monthly Execution Plan
  └─ Selects the highest-priority masterplan items for the coming month
  └─ Assigns actions by category
  └─ Drives: what the operator executes this month

  ↓

Execution Artifacts (Page Briefs)
  └─ Operator generates a page brief for each service_page/location_page item
  └─ AI drafts H1, intro, service sections, proof, FAQ, CTA — operator approves
  └─ Drives: WordPress draft creation

  ↓

WordPress Drafts
  └─ Approved page brief → WP REST API → draft page in WP admin
  └─ Operator reviews in WP, publishes, then marks as published in LeadLayer
  └─ Drives: delivery proof count in monthly reports

  ↓

Lead Tracking
  └─ Leads arrive via form webhook or manual logging
  └─ Operator marks status: new → qualified → won (with closed amount)
  └─ Drives: lead counts, won revenue in monthly reports

  ↓

Monthly Report
  └─ Assembles: lead summary, goal gap, delivery summary (drafts created, drafts published), proven revenue, next actions, risks
  └─ Operator reviews, approves, generates share link, sends to client
  └─ Drives: client trust, retention, and the content of the next monthly plan

  ↓

Next Monthly Execution Plan
  └─ Generated from the report's gaps and risks + active masterplan
  └─ Loop restarts
```

**If something looks wrong in the report:** trace back up the chain. Missing leads → check webhook. Missing delivery → check execution board. Wrong goal progress → check growth goal settings.

---

## 6. Revenue Proof Model

LeadLayer operates across four levels of revenue proof. Current V1 supports Levels 1–3. Level 4 requires future attribution work.

### Level 1 — Modeled Revenue (always available)
*What it is:* Based on the growth goal inputs — close rate, lead value, target leads/month.
*Example:* "If you close 10% of 20 leads at €1,500 average, that's €3,000/month modeled."
*Limitation:* It's a model. No real data backs it until leads flow.
*Current support:* ✅ Available via growth goal math.

### Level 2 — Tracked Leads (available once webhook or manual logging is live)
*What it is:* Actual inbound leads counted and attributed to the period.
*Example:* "8 leads logged this month — 3 new, 4 qualified, 1 won."
*Limitation:* Attribution to specific pages or campaigns is not yet automated.
*Current support:* ✅ Available via lead inbox + webhook ingestion.

### Level 3 — Won Leads with Closed Revenue (available from V1)
*What it is:* Leads the operator marks as won with a closed amount entered.
*Example:* "2 leads marked won this month — €1,200 + €850 = €2,050 recorded closed revenue."
*Limitation:* Operator or client must confirm the win and enter the amount. No CRM or invoicing integration yet.
*Current support:* ✅ Available via `markLeadWon` + `closedAmount` in monthly reports.

### Level 4 — Full Attribution (future)
*What it is:* Connecting a specific closed lead back to the exact page, artifact, or campaign that drove it.
*Example:* "The €2,050 came from visitors to the AC service page we published in March."
*Limitation:* Requires page-level UTM tracking, GA4 integration, or session-to-lead linkage. Not built yet.
*Current support:* ❌ Not available in V1. Do not promise this to clients.

**In client conversations:** Lead with Level 3. Say: "We track real leads and record the ones you close with amounts. Over time, that builds a proof record of what the growth engine is returning."

---

## 7. Operator Responsibilities

The operator owns the full delivery loop. At current automation levels, LeadLayer cannot run without an assigned operator for each client.

### Monthly responsibilities

| Task | When | Tool |
|---|---|---|
| Review business profile for accuracy | Onboarding + when client context changes | Settings → Business Profile |
| Review tone profile output | Onboarding + quarterly | Settings → Tone Profile |
| Run intelligence pipeline | Onboarding + monthly if major site changes | Growth → Intelligence |
| Review snapshot and blueprint | Monthly or on request | Growth → Snapshot / Blueprint |
| Approve monthly execution plan | First week of each month | Growth → Monthly Plan |
| Generate page briefs | Per masterplan item, per month | Growth → Execution |
| Review and approve page briefs | Before WP draft creation | Growth → Execution |
| Create WordPress drafts | After brief approval | Growth → Execution → Create draft |
| Publish pages in WP admin | After draft creation | WordPress admin |
| Mark pages as published in LeadLayer | After WP publish | Growth → Execution → Mark as published |
| Review lead inbox weekly | Weekly | Growth → Leads |
| Mark won leads with closed amount | When client confirms a deal | Growth → Leads → Mark won |
| Generate monthly report | First 3 days of month | Reports → Generate report |
| Review and edit report narrative | Before approval | Reports |
| Approve and send report | After review | Reports → Approve → Share link |
| Log manual leads | If no webhook, or for phone leads | Growth → Leads → Log lead |
| Escalate issues to client | When tracking breaks, WP connection fails | Direct communication |

### One-time setup responsibilities

| Task | Tool |
|---|---|
| Create tenant | Admin / signup |
| Connect WordPress site | Sites → Add site |
| Create lead ingestion source | Leads → Lead capture sources |
| Define growth goal | Settings → Growth Goal |
| Complete business profile | Settings → Business Profile |
| Complete tone profile | Settings → Tone Profile |

---

## 8. Client Responsibilities

Clients in the pilot are active participants, not passive recipients. Set this expectation in the sales call.

| Responsibility | Details |
|---|---|
| Provide WordPress access | Application Passwords credentials, or allow operator publishing directly |
| Support form webhook setup | In their form plugin (Gravity Forms, WPForms, CF7) — operator sends the snippet, client pastes it |
| Confirm won revenue | When operator asks "did this lead close?", client must respond so the revenue record is accurate |
| Review monthly report | Operator sends share link; client is expected to read it and confirm or raise questions |
| Confirm proof claims | If the report references a closed deal, client confirms the amount is correct |
| Provide basic input when asked | Service names, new offers, seasonal focus — occasional 10-minute check-in |
| Do not self-publish drafts | Until operator has reviewed and marked as published in LeadLayer |

**Minimum engagement:** One 30-minute monthly review call per month. Without this, the revenue proof chain breaks because won revenue cannot be confirmed.

---

## 9. Sales Promises

### Allowed to promise

| Promise | Notes |
|---|---|
| Managed lead engine | We run the monthly growth loop |
| Monthly masterplan-driven execution | Pages and actions from a market-backed plan |
| WordPress page drafts | Operator-approved briefs published to client's WP site |
| Lead tracking | Via form webhook or manual logging — real counts, not models |
| Monthly progress report | With delivery summary, lead counts, goal gap, next actions |
| Revenue modeling | Based on growth goal inputs (close rate, lead value, target) |
| Recorded won revenue | When operator marks leads as won with closed amounts |
| Public shareable report link | Client can share the report with stakeholders |
| Monthly execution plan | Approved list of next-month actions by category |

### Not allowed to promise

| Promise | Why |
|---|---|
| Guaranteed lead numbers | Leads depend on market, site quality, and conversion — not something we control |
| Guaranteed rankings or traffic | We do not build for rankings; page quality drives leads, not rank position |
| Fully automated publishing | V1 requires operator to publish in WP admin and mark published in LeadLayer |
| Fully automated lead attribution | We cannot trace a specific lead back to a specific page yet |
| Multi-location support | Not supported in V1. Single location only |
| Client portal with login | No client-facing authenticated portal in V1 — share link is read-only |
| PDF or email reports | Not yet built — share link only |
| Automated monthly loop without operator | Operator must manually run each step |
| Revenue guarantee or ROI guarantee | We prove what was delivered and recorded — outcomes depend on business performance |
| Same-month results | The first real results appear in months 2–3 of the pilot |

---

## 10. Demo Flow

### Screens to show (in this order)

1. **Settings → Growth Goal**
   Show: target leads/month, close rate, lead value, modeled revenue outcome. This anchors the entire demo in business math, not technology.

2. **Growth → Blueprint**
   Show: the focus areas derived from real market and competitor data. Explain: "This is what the system identified as your highest-leverage growth opportunities."

3. **Growth → Masterplan**
   Show: the itemized plan with types (service page, location page, tracking, GBP), priorities, and expected impact. Keep the demo on 5–8 items.

4. **Growth → Execution** (board view)
   Show: one item in `in_qa` with a page brief visible. Walk through: H1, intro, service sections, proof block, FAQ, CTA. Approve the brief live if possible.
   Show: the WordPress draft card with "Edit in WP" link. Do not click through to WP admin in the demo — it reveals too many raw internals.

5. **Growth → Leads**
   Show: the stats strip (total, qualified, won), one or two example leads in the table, the "Mark won" button. Walk through: "When a client confirms a closed deal, you enter the amount here."

6. **Reports → [example approved report]**
   Show: the operator view of a monthly report — period, stats grid, delivery summary, narrative, risks, next actions. Then show the share link.

7. **Open the public share link** (`/r/[token]`) in a new tab
   Show: the clean, client-facing read-only report. Highlight: leads vs goal, pages published, recorded revenue (if any), next actions. This is what the client sees.

8. **Growth → Monthly Plan** (if available)
   Show: the next month's execution plan — action categories, item list, approval status. Say: "This is the plan we execute together next month."

### What to not show in a demo

| Screen | Why |
|---|---|
| Intelligence pipeline internals | Partial data, sparse GBP output, or error states in runs are confusing |
| Raw snapshot JSON or debug output | Not client-relevant |
| Sites → Inventory | Too technical; only relevant to operators |
| Error states in the execution board | Never demo a board with red/failed items |
| An empty lead inbox | Breaks the story — pre-log 2–3 test leads before the demo |
| A report with 0 leads and 0 delivery | Pre-generate a seeded report or use real data only |
| Tone profile internals | Too in-the-weeds for a sales demo |

---

## 11. Current Limitations

These limitations are real. Do not hide them from operators or from clients who ask directly.

| Limitation | Impact | When will it change |
|---|---|---|
| **Single location only** | Cannot serve multi-branch or franchise clients | After Branches V1 (post-pilot sprint) |
| **One language per tenant** | Cannot mix Dutch and English in the same client | After locale/bilingual hardening sprint |
| **Self-hosted WordPress preferred** | WordPress.com draft creation not supported | When WordPress.com REST v1.1 write support is added |
| **No branch data model** | All artifacts, drafts, and leads are tenant-scoped, not location-scoped | After Branches V1 |
| **No ranking baseline** | We do not track or promise ranking positions | Ranking data requires separate integration (e.g. SearchConsole, DataForSEO rankings) |
| **No full lead attribution** | Cannot link a specific lead to the specific page that drove it | After attribution engine V1 (post-pilot) |
| **No automated monthly loop** | Operator must run each step manually | After scheduled report generation and automated plan triggers |
| **No automatic publishing** | Operator must publish in WP admin and mark as published in LeadLayer | After publish gate + WP status webhook |
| **No GA4/GSC integration** | Traffic and ranking data not connected | Future sprint |
| **No CRM sync** | Leads are logged manually or via webhook; no HubSpot/Pipedrive sync | Future sprint |
| **No email or PDF reports** | Share link only; no email delivery or downloadable PDF | Future sprint |
| **No authenticated client portal** | Clients cannot log in; share link is read-only and anonymous | Future sprint |
| **No rate limiting on lead webhook** | High-volume form spam could create fake leads | Future sprint (V1 known gap) |
| **Manual won revenue entry** | Operator must log closed deals; no CRM pull | Until CRM integration or sales pipeline sync |

---

## 12. Next Technical Priorities

Ranked in order of pilot impact. These are not committed sprints — they are recommendations.

| Priority | Why it matters for pilots |
|---|---|
| **1. Locale / Bilingual hardening** | Blocks taking English clients without manual brief editing. Pass `business_profiles.language` to all Claude calls. |
| **2. QA checklist enforcement** | Approvals are currently status flags with no audit trail. Add `approved_by`, `approved_at`. Prevents low-quality output reaching clients. |
| **3. Delivery attribution: lead → page/artifact** | Closes Level 4 of the revenue proof model. Needed to answer "which page drove this lead?" |
| **4. Lead webhook dedup + rate limiting** | Prevents spam/duplicate leads from poisoning monthly reports. Low effort, high protection. |
| **5. Publish status health check** | Dashboard warning if WP connection hasn't been verified in >7 days. Prevents silent delivery failures. |
| **6. Branches V1** | Required before any multi-location or franchise client. Schema: `location_id FK` on artifacts, drafts, leads. |
| **7. Authenticated client portal** | Replaces share link. Needed when client wants to log in and see history, not just a single report URL. |
| **8. PDF / email report** | Nice to have for formal monthly client calls. Not blocking. |
| **9. Automated monthly loop scheduler** | Reduces operator overhead from ~3 hours/client/month to <1 hour. Needed at scale. |

---

## 13. Pilot Success Criteria

A pilot is successful — and ready for renewal or expansion — when all of the following are true after 90 days:

| Criterion | How to verify |
|---|---|
| First monthly report delivered | Report is approved and share link was sent to client |
| At least 2 page drafts created | Execution board shows ≥2 items with WordPress draft records |
| At least 1 page marked as published | At least 1 `wordpress_drafts.published_at` is not null |
| Leads logged | Lead inbox shows ≥1 real lead from webhook or manual logging |
| At least 1 won lead with closed amount | `markLeadWon` was used at least once with a non-zero `closedAmount` |
| Monthly report shows proven revenue | At least one monthly report shows `provenRevenue > 0` |
| Monthly execution plan approved | At least 2 consecutive monthly plans approved by operator |
| Client confirms next steps | Client read the monthly report and confirmed they understand the next month plan |
| Operator ran loop without developer | Entire setup and at least one full monthly loop completed with zero code changes |

**If the pilot fails:** identify which criterion broke and which system layer was responsible. Most failures will fall into one of: tracking not live (lead chain broken), publishing blocked (WP connection issues), or operator bandwidth (too many clients, not enough time per loop).

---

## 14. Open Questions

These questions need business decisions before they can be resolved in product or process.

| Question | Options | Who decides |
|---|---|---|
| **Can pilots be English-language?** | Yes with operator-written briefs; No until locale hardening; Yes with template fallback | Product/Operator |
| **What is the minimum monthly fee?** | €1,000/month? €1,500/month? Tiered by page output? | Sales/Founder |
| **Who confirms won revenue?** | Operator asks client monthly? Client self-reports via form? Automated CRM pull (future)? | Operations |
| **Can a client have two sites?** | One site per tenant in V1; second site would be a second tenant | Product |
| **How do we handle a WP.com client?** | Decline, or accept with manual brief delivery (no WP draft creation)? | Sales/Operator |
| **What happens if operator can't publish?** | Client publishes themselves from the WP edit link + mark as published? | Operations |
| **Should pilots be disclosed as AI-assisted?** | Full disclosure? "Technology-powered"? No disclosure? | Legal/Founder |
| **Is the public report share link safe to send to third parties?** | Currently yes — no auth, no login, 128-bit token; but no expiry. Add expiry date? | Product/Security |
| **Who owns the client relationship if operator leaves?** | Re-assign to new operator? Tenant transfer? | Operations/Legal |
| **At what client count does the operator need tooling support?** | Currently estimated 5–6 clients per operator per month at current automation levels | Operations |
| **Should monthly report narrative be editable in the UI before sending?** | Currently: read-only, operator copies to external tool. Add inline edit? | Product |

---

*This document is a living operational reference. Update it after each pilot cycle to reflect what worked, what broke, and what changed.*

*Last updated: 2026-05-29*
