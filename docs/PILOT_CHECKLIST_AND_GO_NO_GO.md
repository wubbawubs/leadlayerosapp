# Pilot Checklist + Go/No-Go Gate

**For operators and sales. Not a client-facing document.**
**Companion to:** [`docs/PILOT_RUNBOOK_AND_MONTHLY_DELIVERY_OS.md`](./PILOT_RUNBOOK_AND_MONTHLY_DELIVERY_OS.md)

Use this document to qualify pilots before accepting them, set up clients correctly, and run the monthly loop without missing steps. A missed item here is a future client complaint.

---

## 1. Pilot Go/No-Go Gate

Run this gate before agreeing to any pilot. Complete it in the sales qualification call. Do not skip items.

### Must be YES — blocking if not met

- [ ] Business has **one location or one service area** (no multi-branch, no franchise, no multi-city operations)
- [ ] Business uses **one primary language** for client-facing communication (Dutch or English — not mixed)
- [ ] Business has a **WordPress website** (self-hosted preferred; WordPress.com is not supported for draft creation in V1)
- [ ] **Average closed deal value ≥ €500** (lower values make ROI impossible to demonstrate within a 6-month pilot)
- [ ] Client can articulate a **clear monthly lead target or revenue goal** (we need this to configure the growth goal)
- [ ] Client **accepts operator-managed publishing** — we create drafts, the operator publishes, the client reviews after
- [ ] Client accepts that **lead tracking is manual or via form webhook** — no GA4 attribution, no call tracking, no CRM sync in V1
- [ ] Client agrees to a **minimum 6-month commitment** (monthly loop needs at least 2–3 cycles to show results)
- [ ] Client has a **named internal contact** who can confirm won revenue and approve published content
- [ ] **Operator is assigned** — a named LeadLayer operator is responsible for this client's monthly loop before the contract is signed

### Can be worked around — not blocking, but note the gap

| Item | Workaround |
|---|---|
| No form webhook / form plugin | Operator logs leads manually from client's call log or email; note in client file |
| WordPress.com site | No WP draft creation in V1; operator delivers page briefs as Google Docs or email; client copies/pastes manually |
| No GBP access or GBP not set up | Skip GBP intelligence slice; operator manually notes GBP status; GBP tasks are manual-task items in masterplan |
| Client cannot confirm won revenue immediately | Use modeled revenue (Level 1) in first report; note that Level 3 requires client confirmation within 5 business days of closing |
| Client wants to publish pages themselves | Acceptable — operator creates draft, sends WP edit link to client, client publishes, operator marks as published in LeadLayer |
| Client has an existing website agency | Acceptable if agency is not making conflicting content decisions; confirm no content freeze |

### Must be NO — disqualifying conditions

- [ ] **Multi-location or franchise** — current data model is single-tenant, single-location. Cannot isolate data per branch. STOP.
- [ ] **Multi-language targeting** — cannot run Dutch and English content in the same tenant. STOP.
- [ ] **Client expects guaranteed rankings or traffic numbers** — LeadLayer does not promise ranking position. STOP.
- [ ] **Client expects guaranteed lead volume** — we prove delivery and record leads; outcomes depend on the business. STOP.
- [ ] **Client requires fully automated publishing** — V1 requires operator to publish manually. STOP.
- [ ] **Client requires CRM integration** — no HubSpot, Pipedrive, or Salesforce sync in V1. STOP.
- [ ] **Client requires call tracking** — not connected in V1. STOP.
- [ ] **No named operator available** — do not start a pilot without an operator assigned. STOP.
- [ ] **E-commerce or non-service business** — not validated for this model yet. STOP.

**Decision rule:** Any MUST BE YES that is not met = no-go unless a workaround is explicitly agreed and written down. Any MUST BE NO that is true = hard disqualify, no exceptions.

---

## 2. Sales Qualification Checklist

Ask every question below before offering a pilot. Record answers. If a question cannot be answered, that is itself a signal.

### Business model questions

- [ ] What is your **monthly client or lead target**? (Number of leads you need per month to hit revenue goal)
- [ ] What is the **average value of a closed deal / customer**? (€ amount — not "it varies"; get a range)
- [ ] What is your **close rate** on inbound leads? (e.g. "We close about 1 in 5 calls")
- [ ] How many **inbound leads are you currently getting per month**? (Baseline — even rough is fine)
- [ ] What is your **monthly revenue goal** that growth work should contribute to?

### Website + delivery questions

- [ ] What is your **website platform**? (WordPress self-hosted, WordPress.com, Wix, Squarespace, custom)
- [ ] Do you have **admin access** to your WordPress site? (Or who controls it?)
- [ ] Do you use a **form plugin**? Which one? (Gravity Forms, WPForms, Contact Form 7, Elementor Forms, other)
- [ ] Is the form plugin **configurable for webhooks**? (Can you add a custom webhook endpoint to the form?)
- [ ] Who **approves changes to the website**? (Client themselves, a developer, an agency?)
- [ ] Is there a **content freeze** or approval process that would slow down publishing?

### Location and language questions

- [ ] How many **physical locations or service areas** does the business serve?
- [ ] Is the business targeting customers in **one primary language** or multiple?
- [ ] What is the **primary service** the business wants to grow leads for?

### Google Business Profile questions

- [ ] Does the business have a **Google Business Profile**?
- [ ] Do you have **manager or owner access** to the GBP?
- [ ] What is the **GBP Place ID** or business name / address for lookup?

### Expectations questions (use exact phrasing)

- [ ] "We track leads and record won revenue when you confirm a deal closed. Are you comfortable confirming closed deals with us monthly?" (Must be YES)
- [ ] "We create page drafts for your site. An operator reviews them and publishes them — sometimes with your input. Does that work for you?" (Must be YES)
- [ ] "We cannot guarantee rankings or a specific number of leads. We can prove what was delivered and what closed. Are you okay with that?" (Must be YES)

### Red flags — if you see these, escalate before closing

| Red flag | What it usually means |
|---|---|
| "I need to see ROI in 30 days" | Unrealistic expectation; first results appear in months 2–3 |
| "I have another SEO agency doing the same thing" | Content conflict risk; clarify scope before signing |
| "We have 5 locations" | Multi-location — hard disqualifier in V1 |
| "We want to target both Dutch and English customers" | Bilingual — not supported in V1 |
| "I don't want to be involved at all" | No won revenue confirmation possible; Level 3 proof breaks |
| "Can you guarantee we get to page 1?" | Rankings guarantee — hard disqualifier |
| "We need this integrated with Salesforce" | CRM integration — not in V1 |
| "Our developer controls the website and is hard to reach" | Publishing will be blocked or slow |
| "We just want to try for one month" | Not enough time for the loop to show results |
| "Can you do this for €300/month?" | Below minimum — operator overhead exceeds revenue |

---

## 3. Access Checklist

Collect everything below before starting Week 1 of setup. Missing access at setup time delays the pilot by weeks and damages trust.

### WordPress access

- [ ] WordPress site URL (the `wp-admin` URL confirmed working)
- [ ] WordPress **Application Password** created for the LeadLayer user (Settings → Users → Application Passwords)
- [ ] WordPress **username** the Application Password is tied to
- [ ] Confirmed site is **self-hosted** (not WordPress.com)
- [ ] Confirmed plugin REST API is enabled (not blocked by security plugin)
- [ ] Confirmed no page builder breaks the WordPress REST API (some Divi/Elementor configs block it)

### Lead tracking access

- [ ] Form plugin confirmed and named
- [ ] Webhook capability confirmed (test with a dummy submission if possible)
- [ ] Agreed channel for manual lead logging if no webhook (e.g. client emails call list weekly)

### Google Business Profile

- [ ] GBP Place ID (or business name + postcode for lookup)
- [ ] GBP access level confirmed (manager or owner — viewer is not enough for future GMB actions)
- [ ] GBP categories noted (primary + secondary)
- [ ] Review count noted (for growth intelligence)

### Business content

- [ ] Full **service list** with descriptions (not just names)
- [ ] **Service area** or location: city/region, radius or specific areas served
- [ ] Primary **target audience** description (who is the ideal customer)
- [ ] **Proof claims**: reviews, certifications, years in business, case studies, guarantees
- [ ] At least 3 **tone samples**: website copy, email, ad — anything the client has written or approved
- [ ] Existing **testimonials or review text** (Google, Trustpilot, or screenshots)

### Goal and financial inputs

- [ ] Monthly lead target (number)
- [ ] Average deal value (€)
- [ ] Close rate (%)
- [ ] Current monthly lead volume (baseline)
- [ ] Timeline / urgency (does the client have a seasonal peak coming?)

**Do not start setup until every item in this checklist is collected or a workaround is explicitly documented.**

---

## 4. Setup Checklist

Work through this checklist week by week. Tick each item only when it is verified — not when it is "probably done."

### Week 1 — Foundation

- [ ] Tenant created in LeadLayer
- [ ] Operator account added and confirmed as member with operator role
- [ ] **Site connection created** (Sites → Add site → probe URL → capabilities checked)
- [ ] `canCreateDraft: true` confirmed on the site connection
- [ ] **WordPress connection tested**: a test call confirmed (capability probe passes)
- [ ] **Lead ingestion source created** (Leads → Lead capture sources)
- [ ] Webhook snippet sent to client / installed in form plugin
- [ ] Test lead submitted via form → confirmed in Lead Inbox
  - *Fallback if no webhook:* agreed manual logging process documented*
- [ ] **Growth goal saved** (Settings → Growth Goal)
  - Required leads/month: _______
  - Close rate: _______
  - Lead value: €_______
  - Timeframe: _______ months
- [ ] Growth goal saved and modeled revenue visible on dashboard

**Week 1 gate:** Do not proceed to Week 2 unless site connection and growth goal are complete. Lead tracking workaround must be explicitly documented if webhook is not live.

---

### Week 2 — Intelligence

- [ ] **Business profile completed** (Settings → Business Profile)
  - Primary service(s) entered
  - Service area entered
  - Target audience entered
  - Proof claims entered (reviews, certs, guarantee)
  - Offers/pricing entered
- [ ] **Tone profile completed** (Settings → Tone Profile)
  - Minimum 3 tone samples pasted
  - Tone analysis run
  - Output reviewed by operator — does it sound right?
- [ ] **Intelligence pipeline run** (Growth → Intelligence)
  - Site audit stage: ✅ / ❌ / partial
  - Page intelligence: ✅ / ❌ / partial
  - Market scan (DataForSEO): ✅ / ❌ / partial
  - Competitive intelligence: ✅ / ❌ / partial
  - GBP intelligence: ✅ / ❌ / N/A (no GBP access)
- [ ] Pipeline errors reviewed and noted (sparse data is acceptable; errors are not)
- [ ] Top 2–3 blocking issues noted from pipeline output: _______________________

**Week 2 gate:** All pipeline stages must be complete (or N/A with documented reason) before proceeding to Snapshot generation.

---

### Week 3 — Planning + First Execution

- [ ] **Snapshot generated and reviewed** (Growth → Intelligence → Generate Snapshot)
  - Growth potential score noted: _______
  - Top blocking issues confirmed
- [ ] **Blueprint generated and reviewed** (Growth → Blueprint)
  - Focus areas reviewed and make sense for this client
- [ ] **Masterplan generated and reviewed** (Growth → Masterplan)
  - At least 5 items present
  - Highest-priority item is a `service_page` or `location_page`
  - Operator has reviewed and adjusted priorities if needed
- [ ] **First page brief generated** (Growth → Execution → item → Generate page brief)
  - H1 reviewed
  - Intro block reviewed
  - Service sections reviewed
  - Proof block reviewed
  - FAQ reviewed
  - CTA reviewed
  - No hallucinated facts or wrong claims
- [ ] **First page brief approved** by operator (status: Approved)
- [ ] **WordPress draft created** from approved artifact
  - `wp_post_id` visible on the execution board item
  - "Edit in WP" link opens correctly in WP admin
  - Draft appears in WP admin → Pages → Drafts
- [ ] Draft reviewed in WP admin (formatting, missing images noted, internal links noted)
- [ ] Placeholder notes left on the draft for publishing operator

**Week 3 gate:** Do not proceed to Week 4 without an approved page brief and a created WP draft.

---

### Week 4 — First Publish + Report

- [ ] Page reviewed and publishing-ready (images added, links wired if needed)
- [ ] **Page published in WordPress admin** (status: Published)
- [ ] **Draft marked as published in LeadLayer** (Execution Board → Mark as published → enter URL)
  - Published URL recorded: _______________________
- [ ] Published page visible at the URL above
- [ ] **At least one lead logged** (via webhook or manually)
  - Lead source: _______________________
  - Status: new
- [ ] **First monthly report generated** (Reports → Generate report)
  - Period: _______________________
  - Delivery summary reviewed (drafts created, drafts published)
  - Lead summary reviewed
  - Narrative read and edited if needed
  - Risks and next actions reviewed
- [ ] Report status set to **Approved**
- [ ] **Share link generated** for the report
- [ ] Share link sent to client with a short summary message
- [ ] **Next monthly execution plan generated** (Growth → Monthly Plan)
  - Plan reviewed and makes sense for next month
  - Plan approved by operator
- [ ] Top 3 next-month actions verbally confirmed with client

**Week 4 gate:** Pilot setup is complete when: site connected, tracking live, first page published, first report sent, next plan approved.

---

## 5. Weekly Operator Checklist

Run this every week for each active pilot client. Takes 15–30 minutes per client.

### Lead inbox

- [ ] Open **Growth → Leads**
- [ ] Review all leads with status `new` — classify as `qualified`, `unqualified`, or leave `new`
- [ ] For any lead confirmed closed by client this week: click **Mark won**, enter `closedAmount`, add notes
- [ ] For any lead confirmed lost: update status to `lost`
- [ ] Note if lead volume looks unusually low (possible webhook issue)

### WordPress delivery

- [ ] Check **Growth → Execution** board for any item stuck in a state longer than 7 days
- [ ] Check for any drafts with `created` status that have not been marked as published → follow up on publish
- [ ] Check WP connection health (if last probe was >7 days ago, re-probe from Sites page)

### Execution plan progress

- [ ] Open **Growth → Monthly Plan** → check which items from this month's plan are done vs. pending
- [ ] If behind: identify blocker (access, content, approval) and note it

### Blockers log

- [ ] Note any blockers that need client input: _______________________
- [ ] Send client message if any action requires their response this week

---

## 6. Monthly Operator Checklist

Run in the first 5 working days of each month. Covers reporting for the previous month and planning for the current month.

### Report backward (days 1–3)

- [ ] Open **Reports → Generate report** for the previous period
- [ ] Verify lead data is complete:
  - New leads counted correctly?
  - Qualified/won leads updated?
  - Won leads have `closedAmount` entered?
- [ ] Verify delivery data:
  - `draftsCreated` count matches what was actually created
  - `draftsPublished` count matches what was actually published (not just created)
- [ ] Verify goal progress:
  - Gap to monthly lead target is correct
  - `provenRevenue` reflects actual closed deals
- [ ] Read the narrative — does it accurately represent the month?
- [ ] Edit narrative where needed (template is a starting point, not final copy)
- [ ] Check risks and next actions — do they match the actual situation?
- [ ] Set report status to **Approved**
- [ ] Generate share link
- [ ] Send share link to client with a 2–3 sentence summary of the month
- [ ] Log the send date: _______________________

### Plan forward (days 3–5)

- [ ] Open **Growth → Monthly Plan → Generate plan** for the new period
- [ ] Review the plan output:
  - Are the right masterplan items prioritized?
  - Is the page volume realistic for this month (aim for 2–3 max in V1)?
  - Are GBP/review/tracking actions included where relevant?
- [ ] Adjust plan if needed (add or remove items)
- [ ] Approve the plan
- [ ] Confirm top 3 actions with client (call, message, or email)
- [ ] Log plan approval date: _______________________

### Monthly debrief note (optional but recommended)

Take 5 minutes to write a brief internal note:
- What went well this month?
- What was blocked or late?
- What does the client need to know that isn't in the report?
- Any scope creep or expectation issues to address?

---

## 7. Sales Promise Checklist

Review this before every sales call. Use the exact language below when describing what LeadLayer includes.

### Allowed — say these confidently

- [ ] **"We manage the monthly growth loop for you"** — we run intelligence, planning, execution, and reporting
- [ ] **"We build a masterplan from real market and competitor data"** — driven by the growth intelligence snapshot
- [ ] **"We create WordPress pages against that plan"** — page briefs reviewed and approved by our operator, then created as drafts in your WP site
- [ ] **"We track real leads"** — via form webhook or manual logging; counts are accurate and period-matched
- [ ] **"We deliver a monthly progress report"** — with delivery proof, lead counts, goal gap, risks, and next steps
- [ ] **"We record closed revenue"** — when you confirm a deal closed, we log the amount and it appears in the monthly report
- [ ] **"We give you a shareable report link"** — your client or stakeholders can view the report without logging in
- [ ] **"We generate next month's execution plan every month"** — based on what was delivered and where the gaps are

### Forbidden — never say these

- [ ] **"We'll guarantee you X leads per month"** — we prove delivery and record leads; volume depends on the business and market
- [ ] **"We'll get you to page 1 on Google"** — we do not promise or track ranking positions in V1
- [ ] **"We'll guarantee your revenue will increase"** — we prove the chain of work; ROI depends on the business
- [ ] **"The publishing is fully automated"** — operator publishes in WP admin and marks it in the platform
- [ ] **"We'll automatically know which leads came from which page"** — attribution is not connected in V1
- [ ] **"We support multiple locations"** — single location only in V1
- [ ] **"We support both Dutch and English content"** — one language per tenant in V1
- [ ] **"We integrate with your CRM"** — no CRM sync in V1
- [ ] **"We track calls"** — no call tracking in V1
- [ ] **"We'll send the report by email automatically"** — share link only; no email delivery in V1
- [ ] **"You'll see results in 30 days"** — first real results appear in months 2–3 of the pilot

### If a client asks about something that's not in V1

Use this exact phrasing: "That's on our roadmap. For this pilot, we'll [describe the V1 workaround]. We'll revisit [the feature] when it's available."

Do not promise a delivery date for unreleased features.

---

## 8. Pilot Success Criteria

Use these to evaluate pilot health at 30, 60, and 90 days. If criteria are not met, identify the root cause before continuing.

### 30-day checkpoint — Setup complete

| Criterion | Pass | Fail |
|---|---|---|
| Tenant created, operator assigned | Both confirmed | Missing either |
| WordPress site connected and draft-capable | `canCreateDraft: true` in capabilities | Connection failed or capability missing |
| Lead tracking active | At least 1 lead in inbox (webhook or manual) | Zero leads in inbox |
| Growth goal configured | Required leads/month and lead value set | Growth goal missing or incomplete |
| First page brief generated and approved | Artifact status: Approved | No artifact or status: Draft/Rejected |
| First WordPress draft created | Draft record in execution board | No draft created |
| First page published | `published_at` not null on at least 1 draft | Zero published pages |
| First monthly report delivered | Report approved and share link sent | Report not generated |
| Next monthly plan approved | Plan status: Approved | No plan generated |

**30-day pass:** ≥ 7 of 9 criteria met, with lead tracking and first delivery both passing.
**30-day fail action:** Identify which step is blocked and resolve before month 2 execution begins.

---

### 60-day checkpoint — Loop repeating

| Criterion | Pass | Fail |
|---|---|---|
| Second monthly report delivered | Report approved and sent | Report missing or late (>7 days into month) |
| At least 2 pages published total | `published_at` not null on ≥2 drafts | Fewer than 2 published pages |
| Leads tracked consistently | Leads in inbox for both periods | Gap in one period (zero leads in a full month) |
| At least one won lead with closed amount | `markLeadWon` used ≥1 time | No won leads recorded |
| Second monthly plan approved | Plan status: Approved for month 2 | No plan for month 2 |
| Client responsive to monthly check-in | Client acknowledged report and next steps | No response from client to report |

**60-day pass:** All 6 criteria met.
**60-day fail action:** If client is unresponsive — escalate. If operator loop is breaking — review operator workload and identify bottleneck.

---

### 90-day checkpoint — Value demonstrated

| Criterion | Pass | Fail |
|---|---|---|
| Third monthly report delivered with ≥1 won lead | `provenRevenue > 0` in at least one report | No won revenue recorded across 3 months |
| At least 3 pages published total | ≥3 `published_at` records | Fewer than 3 pages live |
| Lead trend visible | Month-over-month lead count is stable or growing | Lead count dropped to zero in any month without explanation |
| Operator ran full loop without developer | All 3 months completed without code changes or platform interventions | Required developer help to complete loop |
| Client confirms value | Client verbally or in writing confirms they see the point of continuing | Client wants to cancel or questions the value |
| Pilot renewal decision made | Contract renewed, expanded, or formally closed with documented learnings | No decision made; pilot continuing in ambiguity |

**90-day pass:** ≥ 5 of 6 criteria met.
**90-day fail action:** Document specific failure points and assess whether the problem is client fit, product gaps, or operator execution.

---

## 9. Operator Workload Tracker

Use this to measure actual time per client per month. After the first full cycle, total the actuals and compare to targets. Adjust client load if operator is over capacity.

### Per-client time estimates (V1 baseline)

| Activity | Estimated time | Actual time |
|---|---|---|
| **Setup — one-time** | | |
| Tenant + site + goal setup | 45 min | _______ |
| Business profile + tone profile | 60 min | _______ |
| Intelligence pipeline run + review | 45 min | _______ |
| Snapshot + blueprint + masterplan review | 30 min | _______ |
| First artifact + WP draft creation | 45 min | _______ |
| First publish + mark as published | 20 min | _______ |
| First report + plan | 45 min | _______ |
| **Total setup** | **~5.5 hours** | _______ |
| | | |
| **Monthly recurring** | | |
| Weekly lead inbox review (×4/month) | 15 min × 4 = 60 min | _______ |
| Monthly report generation + narrative edit | 45 min | _______ |
| Monthly plan review + approval | 20 min | _______ |
| Artifact generation + approval (per page) | 30 min each | _______ |
| WordPress draft creation + WP review | 20 min each | _______ |
| Publishing + mark as published | 15 min each | _______ |
| Client communication (report send + follow-up) | 20 min | _______ |
| **Total monthly (2 pages delivered)** | **~3.5–4 hours** | _______ |

### Operator capacity estimate

At current automation levels:
- **1 operator can manage approximately 5–6 pilot clients per month** at 2 page deliveries per client
- Above 6 clients, loop quality degrades — steps get skipped, reports arrive late
- Do not assign more than 4 clients to a new operator in their first month

### Capacity warning signs

- Reports are more than 3 days late consistently
- Lead inbox has leads older than 7 days in `new` status
- Drafts are sitting `created` for more than 14 days without being published
- Operator is skipping the narrative edit before approving reports

---

## 10. Final Go/No-Go Decision

Fill in this form for every pilot candidate before signing. One form per client. File it.

---

**Client name:** _______________________

**Business type:** _______________________

**Primary service:** _______________________

**Location / service area:** _______________________

**Website:** _______________________

**WordPress type:** ☐ Self-hosted ☐ WordPress.com ☐ Other: _______

**Primary language:** ☐ Dutch ☐ English ☐ Other: _______ (if Other → disqualify)

**Average deal value:** € _______________________

**Monthly lead target:** _______________________

**Contract term:** _______ months (minimum 6)

**Monthly fee:** € _______________________

**Assigned operator:** _______________________

---

### Go/No-Go Checklist Summary

Mark each item:

| Item | ✅ Yes | ⚠️ Workaround | ❌ No (disqualifier) |
|---|---|---|---|
| Single location or service area | | | |
| One primary language | | | |
| Self-hosted WordPress (draft creation) | | | |
| Lead value ≥ €500 per deal | | | |
| Growth goal articulable | | | |
| Client accepts operator publishing | | | |
| Lead tracking possible (webhook or manual) | | | |
| GBP data available (or N/A noted) | | | |
| 6-month minimum agreed | | | |
| Named client contact for won revenue | | | |
| No guaranteed rankings/revenue expectation | | | |
| Operator assigned | | | |

---

### Decision

☐ **GO** — all hard requirements met, workarounds documented, operator assigned

☐ **CONDITIONAL GO** — proceed if the following conditions are met before Week 1 starts:

> _______________________
> _______________________
> _______________________

☐ **NO-GO** — reason(s):

> _______________________
> _______________________

---

### Risk notes

Any known risks to flag for the operator before starting:

> _______________________
> _______________________
> _______________________

---

**Start date:** _______________________

**First report due:** _______________________

**30-day checkpoint date:** _______________________

**90-day review date:** _______________________

**Decision made by:** _______________________

**Date signed off:** _______________________

---

*Last updated: 2026-05-29*
*Companion doc: [`docs/PILOT_RUNBOOK_AND_MONTHLY_DELIVERY_OS.md`](./PILOT_RUNBOOK_AND_MONTHLY_DELIVERY_OS.md)*
