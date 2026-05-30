# WordPress Delivery V2 — Page Template System

**Design doc. Not client-facing.**
**Companion to:** [`docs/WORDPRESS_DRAFT_CREATION_V1.md`](./WORDPRESS_DRAFT_CREATION_V1.md)

---

## 1. Why V2 Is Needed Before Pilot

V1 creates a page. V2 creates a page worth showing a client.

The V1 output — intro paragraph, h2 service sections, a bullet list, a FAQ, a plain-text CTA — is correct in structure and safe to publish. But it produces pages that look like a first draft from someone who read the business profile and nothing else. A client who opens their new AC service page and sees a grey wall of paragraphs with no local urgency, no trust signal hierarchy, no schema visible in the source, and no SEO meta in their SEO plugin is going to ask: "Is this finished?"

That question is not recoverable in a pilot. The client's wife opened the page, it looked generic, and now the operator is defending the product instead of renewing the contract.

**V1 is enough to prove the chain works. V2 is what makes a client say "this is better than what my last agency did."**

Three specific gaps drive V2:

**Gap 1 — Template depth.** V1 uses one implicit structure for all page types. A service page for "AC repair" needs different section logic than a local landing page for "AC repair Dallas" or an emergency page for "no AC in summer." Same product, three different buying triggers, three different page shapes.

**Gap 2 — Block quality.** V1 renders CTAs as styled paragraphs, not as `wp:buttons`. Internal links are printed as a comma-separated note, not as actual links. The proof block is an unordered list with no heading hierarchy. These are functional but they look like scaffolding, not a published page.

**Gap 3 — SEO meta is not delivered.** V1 generates `metaTitle` and `metaDescription` and stores them in the artifact. They are never pushed to the WordPress site. The operator must manually open Yoast or Rank Math on every published page and type them in. At 2–3 pages per month per client, that is an acceptable manual step. At 5–10 pages, it becomes the most error-prone and forgettable step in the delivery chain. Missing meta on published pages is a direct client complaint.

V2 closes all three gaps without requiring a full redesign of the delivery pipeline.

---

## 2. Current WordPress V1 Capabilities

### What works

| Capability | Status |
|---|---|
| Self-hosted WordPress connection (Application Passwords) | ✅ Working |
| Capability check (canCreateDraft, canReadPages, roles) | ✅ Working |
| Inventory sync — pages and posts | ✅ Working |
| Page mappings (existing / candidate / missing / manual) | ✅ Working |
| Delivery readiness on artifacts | ✅ Working |
| Draft creation from approved `page_brief` artifact | ✅ Working |
| `publishing_bundles` and `wordpress_drafts` records | ✅ Working |
| `wp_edit_link` and `wp_preview_link` in execution board | ✅ Working |
| `markWordpressDraftPublished` (operator-confirmed) | ✅ Working |
| `published_at`, `published_by`, `published_url` on draft record | ✅ Working |
| Delivery counts in monthly reports (created + published) | ✅ Working |
| Safety gates (approval, WP connected, canCreateDraft) | ✅ Working |
| Failure recording with error message | ✅ Working |
| 15-second WP API timeout | ✅ Working |

### What does not work

| Capability | Status |
|---|---|
| WordPress.com draft creation | ❌ Hard blocked in V1 |
| Live publish from LeadLayer | ❌ Not built — draft only |
| SEO plugin meta (Yoast, Rank Math) | ❌ Not pushed — stored locally only |
| Existing page updates (PATCH) | ✅ V1 complete — see `docs/EXISTING_PAGE_OPTIMIZATION_V1.md` |
| Media uploads | ❌ Not built |
| `wp:buttons` / `wp:button` CTA | ❌ Rendered as paragraph with class |
| Template-specific section logic | ❌ One implicit structure for all page types |
| Emergency / urgency page template | ❌ Not defined |
| Local landing page template | ❌ Not defined |
| `wp:group` for visual section grouping | ❌ Not used |
| Rollback or version management | ❌ Not built |
| Stale inventory cleanup | ❌ Inventory grows monotonically |

---

## 3. V2 Goals

### 3.1 Create high-quality new pages with template-specific structure

V2 introduces three named page templates, each with its own section sequence, required inputs, risk flags, and Gutenberg block mapping. The artifact generator selects the template based on `masterplan_item.type` and `metadata`. The Gutenberg transformer renders the correct structure for each template.

### 3.2 Push SEO meta to the WordPress site

On draft creation, V2 will attempt to write `metaTitle` and `metaDescription` to the WordPress page via SEO plugin meta fields. Priority order:
- Yoast SEO (most common; uses `_yoast_wpseo_title` and `_yoast_wpseo_metadesc` in page meta)
- Rank Math (second most common; uses `rank_math_title` and `rank_math_description`)
- If neither plugin is detected: store meta in LeadLayer, surface manual checklist to operator

### 3.3 Publish from LeadLayer with safety gate

V2 adds a `publishWordpressDraft` server function that PATCHes the existing WP draft to `status: publish` via the REST API. This requires an additional operator confirmation step (not automatic). The draft is already in WP admin — the operator has reviewed it. The confirm-and-publish action in LeadLayer replaces the two-step "publish in WP + mark in LeadLayer" sequence with one operator click.

### 3.4 Record delivery proof

All V1 delivery proof fields remain (`published_at`, `published_by`, `published_url`). V2 adds `seo_meta_pushed` (boolean) and `publish_source` (`operator_manual` or `leadlayer_publish`) to the `wordpress_drafts` record so reports and audits can distinguish the two paths.

### 3.5 Preserve operator review at every step

No automated actions. Operator approves artifact → operator creates draft → operator reviews in WP admin → operator confirms publish in LeadLayer. Each step remains a deliberate action.

---

## 4. V2 Non-Goals

These are explicitly out of scope for V2. Document them here so implementation does not drift.

| Excluded feature | Reason |
|---|---|
| **Existing page updates (PATCH on published pages)** | Risk too high without snapshot/before state. Separate sprint: Existing Page Optimization V1. |
| **Form editing** | Contact forms are not part of content delivery. Operator handles outside LeadLayer. |
| **Media uploads** | Images require operator creative judgment. Cannot be automated safely. |
| **Alt text generation and push** | Depends on media upload first. |
| **WordPress.com draft creation** | REST write scope is unclear; different payload shape. Separate sprint. |
| **Rollback / version snapshot** | Page versions exist in WP Revisions. LeadLayer does not need to manage this in V2. |
| **Multi-location page scoping** | `location_id` on drafts not yet built. Branches V1 sprint. |
| **Auto-publish without operator confirmation** | Operator must always confirm before going live. No exceptions. |
| **Theme/CSS/layout changes** | Outside content delivery scope entirely. |
| **Blog post type** | Draft creation targets `type: page` only. Blog posts not in V2. |
| **Custom post types** | Not in V2. |
| **WordPress Multisite** | Not validated, not in scope. |

---

## 5. Page Template Types

Three templates cover the service business pilot target market.

| Template | When used | Trigger |
|---|---|---|
| **Service Page** | Primary service offering page — one service, one site | `masterplan_item.type = "service_page"` |
| **Local Landing Page** | Location-specific version of a service page, targeting a named city or service area | `masterplan_item.type = "location_page"` |
| **Emergency / Urgent Service Page** | High-urgency service where the client converts fastest — "no heat in winter", "burst pipe", "AC out in summer" | `masterplan_item.type = "service_page"` AND `metadata.urgency = "emergency"` |

---

### Service Page

**Purpose:** Rank for a primary service keyword in the client's service area. Educate and convert a researching buyer who is comparing options.

**When used:** For each high-priority service in the masterplan. This is the most common page type.

**Sections:**
1. Hero — H1 with primary keyword, location mention, and strongest proof signal (years in business, response time, rating)
2. Problem / urgency block — what happens if the reader doesn't act, and why this service solves it
3. Service explanation — what the service includes, what is typical, what the process involves
4. Why choose us — 3–5 verifiable differentiators (not superlatives; tied to proof claims)
5. Process — numbered steps from first call to job completion
6. Local relevance — how the service relates to the client's specific market (climate, building type, local patterns)
7. FAQ — 4–6 questions that appear in real search intent; answers that handle objections
8. Final CTA — single primary call to action with urgency rationale
9. Schema — `LocalBusiness` + `Service` JSON-LD
10. Internal links — 2–4 links to related pages (other services, contact, about)

**Required inputs from artifact payload:**
- `h1`, `metaTitle`, `metaDescription`, `targetSlug`
- `introBlock` (becomes problem/urgency)
- `serviceSections[]` (minimum 2)
- `proofBlock.items` (minimum 2)
- `faqBlock[]` (minimum 3)
- `ctaBlock.primary`
- `schemaRecommendation.type` and `suggestedFields`
- `targetService`, `targetLocation`

**Optional inputs:**
- `ctaBlock.secondary`
- `ctaBlock.placement`
- `internalLinkTargets[]`
- `parentSlug`

**Risk flags (automatically added to artifact):**
- Fewer than 2 proof items → `"proofBlock too thin — unverified claims will appear"`
- Missing location in H1 → `"No location signal in H1 — local SEO impact"`
- No schema type → `"Schema recommendation missing"`

**Success metric:** Artifact includes `successMetric` field. For service page: `"Page ranks in top 5 for '{service} {location}' within 90 days and generates ≥1 lead via form within 60 days of publish."`

---

### Local Landing Page

**Purpose:** Capture location-specific search intent for buyers in a specific city or service area. Converts buyers searching for "AC repair [city name]" who are closer to a decision than a general-service searcher.

**When used:** For each important service area location in the masterplan. Typically created after the primary service page exists.

**Sections:**
1. Local hero — H1 with service + location name, immediate proof of local presence
2. Service-area intro — why this location matters (traffic patterns, building age, climate notes, distance from office)
3. Services in this area — the specific services available at this location (list, not full explanation — links to service pages for depth)
4. Local proof — reviews or testimonials specifically mentioning this area, or proximity/response-time proof
5. Nearby areas / service coverage — which adjacent areas are served (signals coverage, helps for adjacent searches)
6. FAQ — location-specific questions ("Do you serve [suburb]?", "How fast can you get here?")
7. CTA — with location-specific urgency ("Same-day service in [city]")
8. Schema — `LocalBusiness` with `areaServed` set to location name
9. Internal links — primary service page, contact page, other nearby location pages

**Required inputs:**
- `h1`, `metaTitle`, `metaDescription`, `targetSlug`
- `targetService`, `targetLocation`
- `introBlock` (becomes local area intro)
- At least 1 `serviceSections` item listing available services
- `ctaBlock.primary`
- `schemaRecommendation` with `areaServed`

**Optional inputs:**
- `proofBlock.items` (location-specific testimonials if available)
- `internalLinkTargets` (strongly recommended — link to primary service page)
- Nearby areas list (from business profile `serviceAreas`)

**Risk flags:**
- No local proof available → `"No location-specific proof — generic page risk"`
- Location not in business profile `serviceAreas` → `"Target location not confirmed in business profile"`

**Success metric:** `"Page ranks for '{service} {location}' and generates ≥1 lead within 90 days of publish."`

---

### Emergency / Urgent Service Page

**Purpose:** Convert high-intent buyers in an immediate need state. "No AC in summer heat", "burst pipe", "no heat in winter". These buyers are not researching — they are acting. The page must answer: can you come now, do you serve my area, and are you trustworthy?

**When used:** For services with emergency demand in the masterplan. Flagged by `metadata.urgency = "emergency"` on the masterplan item.

**Sections:**
1. Urgent hero — H1 with urgency ("Emergency AC Repair in Dallas — Same-Day Service"), response time proof, phone number prominent
2. What to do now — immediate instructions (call this number, available 24/7, what to say)
3. Emergency service explanation — what the emergency service includes, how fast, what equipment is on the truck
4. Verified availability / response proof — ONLY use verifiable claims: response time, hours, coverage area. No unverifiable superlatives.
5. Areas served — which cities/suburbs are covered for emergency calls (fast list, no padding)
6. Trust / safety — licensing, insurance, certified technicians — fast bullets only
7. Emergency FAQ — "Are you really available at 3am?", "How much does an emergency call cost?", "What if you can't fix it tonight?"
8. Strong call CTA — full-width prominence, phone number in text (not just a button), urgency rationale
9. Schema — `LocalBusiness` with `openingHours` set if available, `hasMap` if GBP present

**Required inputs:**
- `h1` (must contain urgency word — "Emergency", "Same-Day", "24/7")
- `metaTitle`, `metaDescription`
- `targetSlug`
- `targetService`, `targetLocation`
- `ctaBlock.primary` (must include phone number or instruction)
- `proofBlock.items` (response time, coverage — verified only)

**Optional inputs:**
- `schemaRecommendation` with `openingHours`
- `internalLinkTargets` (link to main service page)

**Risk flags:**
- H1 missing urgency signal → `"Emergency page H1 must contain urgency signal (Emergency/Same-Day/24-7)"`
- Proof block contains unverifiable superlatives → `"Emergency page claims must be verifiable — remove unverifiable superlatives"`
- No phone number in CTA → `"Emergency page must have phone number in CTA"`
- `ctaBlock.primary` is generic → `"Emergency CTA must trigger immediate action"`

**Success metric:** `"Page generates ≥1 inbound call or lead within 30 days of publish."`

---

## 6. Service Page — Full Gutenberg Block Structure

```
<!-- wp:heading {"level":1} -->
<h1>{h1}</h1>
<!-- /wp:heading -->

<!-- wp:paragraph {"className":"wp-block-intro"} -->
<p class="wp-block-intro">{introBlock}</p>
<!-- /wp:paragraph -->

<!-- service sections: one wp:heading h2 + wp:paragraph per section -->
<!-- wp:heading {"level":2} -->
<h2>{serviceSections[0].heading}</h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>{serviceSections[0].body}</p>
<!-- /wp:paragraph -->
... repeat for each section ...

<!-- wp:separator -->
<hr class="wp-block-separator has-alpha-channel-opacity"/>
<!-- /wp:separator -->

<!-- wp:heading {"level":2} -->
<h2>Why {businessName}?</h2>
<!-- /wp:heading -->
<!-- wp:list -->
<ul class="wp-block-list">
  <li>{proofBlock.items[0]}</li>
  ...
</ul>
<!-- /wp:list -->

<!-- wp:separator -->
<hr class="wp-block-separator has-alpha-channel-opacity"/>
<!-- /wp:separator -->

<!-- FAQ: h2 header + wp:heading h3 / wp:paragraph pairs -->
<!-- wp:heading {"level":2} -->
<h2>Frequently Asked Questions</h2>
<!-- /wp:heading -->
<!-- wp:heading {"level":3} -->
<h3>{faqBlock[0].question}</h3>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>{faqBlock[0].answer}</p>
<!-- /wp:paragraph -->
... repeat for each FAQ item ...

<!-- wp:separator -->
<hr class="wp-block-separator has-alpha-channel-opacity"/>
<!-- /wp:separator -->

<!-- CTA: wp:buttons > wp:button (V2 — replaces V1 styled paragraph) -->
<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons">
  <!-- wp:button {"backgroundColor":"primary","textColor":"white"} -->
  <div class="wp-block-button">
    <a class="wp-block-button__link has-white-color has-primary-background-color wp-element-button">{ctaBlock.primary}</a>
  </div>
  <!-- /wp:button -->
</div>
<!-- /wp:buttons -->

<!-- If ctaBlock.secondary: -->
<!-- wp:paragraph {"className":"wp-block-cta-secondary"} -->
<p class="wp-block-cta-secondary">{ctaBlock.secondary}</p>
<!-- /wp:paragraph -->

<!-- Internal link suggestions (operator adjusts actual hrefs) -->
<!-- wp:paragraph {"className":"wp-block-related-pages"} -->
<p class="wp-block-related-pages">Related: {internalLinkTargets[0].anchorText} — <a href="/{internalLinkTargets[0].targetSlug}">{internalLinkTargets[0].anchorText}</a>, ...</p>
<!-- /wp:paragraph -->

<!-- Schema JSON-LD -->
<!-- wp:html -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "{schemaRecommendation.type}",
  ...suggestedFields
}
</script>
<!-- /wp:html -->
```

**Note on `wp:buttons`:** V2 must use the correct block structure (`wp:buttons > wp:button`) so that WP renders a styled button widget, not a plain paragraph. The V1 paragraph-with-class workaround is replaced. The block serializer must wrap the button in the outer `wp-block-buttons` div with the `wp-block-button` inner div — this is what WordPress stores and renders.

---

## 7. Local Landing Page — Full Gutenberg Block Structure

```
<!-- wp:heading {"level":1} -->
<h1>{h1} — {targetLocation}</h1>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>{introBlock}</p>
<!-- /wp:paragraph -->

<!-- Services in this area -->
<!-- wp:heading {"level":2} -->
<h2>Services in {targetLocation}</h2>
<!-- /wp:heading -->
<!-- wp:list -->
<ul class="wp-block-list">
  <li>{serviceSections[0].heading} — {serviceSections[0].body}</li>
  ...
</ul>
<!-- /wp:list -->

<!-- Local proof (if proofBlock.items available) -->
<!-- wp:separator -->...<!-- /wp:separator -->
<!-- wp:heading {"level":2} -->
<h2>Trusted by {targetLocation} Customers</h2>
<!-- /wp:heading -->
<!-- wp:list -->
<ul class="wp-block-list">
  <li>{proofBlock.items[0]}</li>
  ...
</ul>
<!-- /wp:list -->

<!-- Nearby areas -->
<!-- wp:separator -->...<!-- /wp:separator -->
<!-- wp:heading {"level":2} -->
<h2>Also Serving Nearby Areas</h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>We serve {targetLocation} and surrounding areas including: {serviceAreas joined with ", "}.</p>
<!-- /wp:paragraph -->

<!-- FAQ -->
... same as service page ...

<!-- CTA -->
<!-- wp:buttons -->...<!-- /wp:buttons -->

<!-- Internal links — especially link to primary service page -->
...

<!-- Schema with areaServed -->
<!-- wp:html -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "areaServed": "{targetLocation}",
  ...suggestedFields
}
</script>
<!-- /wp:html -->
```

---

## 8. Emergency Page — Full Gutenberg Block Structure

```
<!-- wp:heading {"level":1} -->
<h1>{h1}</h1>
<!-- /wp:heading -->

<!-- Urgency bar: prominent paragraph styled as emergency alert -->
<!-- wp:paragraph {"className":"wp-block-emergency-header","backgroundColor":"vivid-red","textColor":"white"} -->
<p class="wp-block-emergency-header has-white-color has-vivid-red-background-color">
  📞 Call now: {ctaBlock.primary}
</p>
<!-- /wp:paragraph -->

<!-- What to do now -->
<!-- wp:heading {"level":2} -->
<h2>What to Do Right Now</h2>
<!-- /wp:heading -->
<!-- wp:list {"ordered":true} -->
<ol class="wp-block-list">
  <li>Call us: {phone}</li>
  <li>Describe the emergency</li>
  <li>We dispatch — {responseTimeProof}</li>
</ol>
<!-- /wp:list -->

<!-- Emergency service explanation -->
<!-- wp:heading {"level":2} -->
<h2>Our Emergency {targetService} Service</h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>{serviceSections[0].body}</p>
<!-- /wp:paragraph -->

<!-- Verified proof only -->
<!-- wp:separator -->...<!-- /wp:separator -->
<!-- wp:heading {"level":2} -->
<h2>Verified Availability</h2>
<!-- /wp:heading -->
<!-- wp:list -->
<ul class="wp-block-list">
  <li>{proofBlock.items[0]}</li>  <!-- response time, hours, coverage only -->
  ...
</ul>
<!-- /wp:list -->

<!-- Areas served: compact list -->
<!-- wp:heading {"level":2} -->
<h2>Areas We Serve for Emergency Calls</h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>{targetLocation} and: {serviceAreas joined with ", "}</p>
<!-- /wp:paragraph -->

<!-- Trust signals: compact bullets -->
<!-- wp:list -->
<ul class="wp-block-list">
  <li>Licensed and insured</li>
  <li>{yearsExperience} years in business</li>
  <li>{certifications}</li>
</ul>
<!-- /wp:list -->

<!-- Emergency FAQ -->
<!-- wp:heading {"level":2} -->
<h2>Emergency Service FAQ</h2>
<!-- /wp:heading -->
... faqBlock pairs ...

<!-- Strong final CTA -->
<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons">
  <!-- wp:button {"backgroundColor":"vivid-red","textColor":"white","fontSize":"large"} -->
  <div class="wp-block-button">
    <a class="wp-block-button__link has-large-font-size has-white-color has-vivid-red-background-color wp-element-button">
      {ctaBlock.primary}
    </a>
  </div>
  <!-- /wp:button -->
</div>
<!-- /wp:buttons -->

<!-- Schema -->
<!-- wp:html -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "openingHours": "{openingHours if available}",
  ...
}
</script>
<!-- /wp:html -->
```

---

## 9. Gutenberg Block Mapping — Full Reference

| Content element | V1 block | V2 block | Notes |
|---|---|---|---|
| Page title / H1 | WP post title (not in body) | WP post title (not in body) | Unchanged — correct behavior |
| Intro / problem block | `core/paragraph` | `core/paragraph {"className":"wp-block-intro"}` | Add className for theme styling |
| Section heading (H2) | `core/heading {"level":2}` | `core/heading {"level":2}` | Unchanged |
| Section body | `core/paragraph` | `core/paragraph` | Unchanged |
| Proof / bullets | `core/list` | `core/list` | Unchanged |
| FAQ heading (H3) | `core/heading {"level":3}` | `core/heading {"level":3}` | Unchanged |
| FAQ answer | `core/paragraph` | `core/paragraph` | Unchanged |
| CTA primary | `core/paragraph` with className | **`core/buttons > core/button`** | V2 change — real button block |
| CTA secondary | `core/paragraph` | `core/paragraph {"className":"wp-block-cta-secondary"}` | Unchanged |
| Internal links | Comma-separated paragraph | Paragraph with `<a href="/slug">text</a>` anchors | V2 change — real links |
| Section separator | `core/separator` | `core/separator` | Unchanged |
| Schema JSON-LD | `core/html` | `core/html` | Unchanged |
| Emergency alert bar | Not defined in V1 | `core/paragraph {"backgroundColor":"vivid-red","textColor":"white"}` | V2 new |
| Ordered process list | Not defined in V1 | `core/list {"ordered":true}` | V2 new |

**Fallback behavior:** If `wp:buttons` serialization fails validation or causes WP import errors (detected by checking `wpPostId` exists and `wp_status` returns correctly), the system falls back to the V1 styled-paragraph CTA and logs `block_fallback: "cta_paragraph"` in the draft's `raw_response`. Operator sees a warning in the execution board.

**`core/group` usage:** Not used in V2. `core/group` adds nesting complexity and is theme-dependent. Defer to V3 when theme analysis is available.

---

## 10. SEO Meta Delivery

### Source of meta fields

`metaTitle` (max 70 chars) and `metaDescription` (max 160 chars) are generated by the page brief generator and stored on the `execution_artifacts.payload`. They are validated against character limits before the artifact is approved.

In V2, these are pushed to the WordPress site during draft creation.

### Detection strategy

V2 will attempt to detect which SEO plugin is active by inspecting the REST API response from the page after creation. The draft creation response includes a `meta` object. If the response contains `yoast_head_json` or `yoast_head` keys, Yoast is active. If it contains `rank_math_title` or `rank_math_description` in the meta, Rank Math is active.

Alternatively: a pre-check at capability check time. After `GET /wp-json/wp/v2/users/me`, issue a `GET /wp-json` (root) and inspect `namespaces`. Yoast registers `yoast/v1`. Rank Math registers `rankmath/v1`. If found, store detected plugin in `wordpress_connections.capabilities.seoPlugin`.

### Yoast SEO delivery

Yoast exposes SEO meta via the WP REST API using the `meta` field on the page object. On draft creation POST, include in the body:

```json
{
  "title": "...",
  "slug": "...",
  "content": "...",
  "excerpt": "{metaDescription}",
  "status": "draft",
  "type": "page",
  "meta": {
    "_yoast_wpseo_title": "{metaTitle}",
    "_yoast_wpseo_metadesc": "{metaDescription}"
  }
}
```

**Prerequisite:** Yoast must have the REST API meta fields enabled. Yoast SEO 14.0+ exposes these by default via the `wpseo` meta schema. Older versions may require the Yoast REST API plugin add-on. If the `meta` field is rejected (HTTP 400 on meta keys), fall back to manual checklist.

### Rank Math delivery

Rank Math exposes meta via:
```json
{
  "meta": {
    "rank_math_title": "{metaTitle}",
    "rank_math_description": "{metaDescription}"
  }
}
```

Same pattern as Yoast. Rank Math REST API fields are enabled by default in Rank Math 1.0+.

### Unknown plugin — manual checklist

If neither `yoast/v1` nor `rankmath/v1` is in the API namespace list, or if the meta write is rejected, V2 falls back to:

1. Store `metaTitle` and `metaDescription` on the `wordpress_drafts` row (new column: `meta_title`, `meta_description`)
2. Show operator checklist in the execution board after draft creation:
   - [ ] Open the draft in WP Admin
   - [ ] Open your SEO plugin (Yoast / Rank Math / SEOPress / other)
   - [ ] Set SEO title to: `{metaTitle}`
   - [ ] Set meta description to: `{metaDescription}`
   - [ ] Save
3. Operator marks checklist as complete before proceeding to publish

### Failure surfacing

`wordpress_drafts` gets a new field: `seo_meta_status` with values:
- `pushed_yoast` — pushed successfully via Yoast meta fields
- `pushed_rankmath` — pushed successfully via Rank Math meta fields
- `manual_required` — plugin not detected or write rejected; operator checklist shown
- `skipped` — meta fields were empty in the artifact

The execution board shows a visual indicator per draft:
- Green checkmark: `pushed_yoast` or `pushed_rankmath`
- Amber warning + checklist: `manual_required`
- Grey: `skipped`

Monthly reports include `seoMetaPushed: boolean` in the draft summary.

### What is stored in LeadLayer

Regardless of push success, the following are always stored:
- `metaTitle` in `execution_artifacts.payload.metaTitle` (immutable after approval)
- `metaDescription` in `execution_artifacts.payload.metaDescription`
- `meta_title` and `meta_description` on `wordpress_drafts` (copy for reference)
- `seo_meta_status` on `wordpress_drafts`

---

## 11. Publish from LeadLayer

### Context

V1: Operator publishes in WP Admin → returns to LeadLayer → clicks "Mark as published" → enters live URL.
V2 option: Operator clicks "Publish this draft" in LeadLayer → LeadLayer PATCHes WP draft to `status: publish` → records `published_at`, `published_by`, `published_url` automatically.

V2 publish is opt-in. If the operator prefers to publish in WP Admin, the V1 flow remains available.

### Required gates before publish from LeadLayer

All of the following must be true:

1. `wordpress_drafts.status = "created"` (not failed, not already published)
2. `wordpress_connections.status = "connected"` (verified in last 7 days preferred; warn if older)
3. `capabilities.canCreateDraft = true` (required for write access; publish uses the same auth)
4. Operator has explicitly clicked a "Confirm and publish" button (not an accident path)
5. The draft exists in WP (wp_post_id is not null)
6. No pending `seo_meta_status = "manual_required"` checklist items (warn, but do not hard-block — operator may override)

### Operator confirmation checklist (shown in UI before publish)

The execution board shows a pre-publish confirmation panel with:
- [ ] I have reviewed the draft in WP Admin
- [ ] Images have been added or are not required for this page
- [ ] Internal links have been wired or noted as a follow-up
- [ ] SEO meta is confirmed (auto-filled if pushed; manual if `manual_required`)
- [ ] This page is ready to go live

Operator checks all boxes, then clicks "Publish now."

### WP REST API behavior

`PATCH /wp-json/wp/v2/pages/{wp_post_id}` with body:
```json
{ "status": "publish" }
```

Same auth as draft creation (Basic auth, Application Password).

Expected response: HTTP 200, `status: "publish"`, `link: "https://site.com/slug/"`.

The `link` field from the response is stored as `published_url` automatically (operator does not need to enter it manually).

### Status updates on success

```
wordpress_drafts:
  status          → "published"
  wp_status       → "publish"
  published_at    → now()
  published_by    → userId
  published_url   → response.link
  publish_source  → "leadlayer_publish"

publishing_bundles:
  status          → "published"
```

### Failure handling

If the PATCH fails (network error, auth error, 4xx/5xx):
- `wordpress_drafts.status` remains `"created"`
- `error_message` updated with the failure reason
- Execution board shows error with retry button
- Operator can try again or fall back to manual publish in WP Admin + V1 "Mark as published" flow

### No auto-publish

Auto-publish is explicitly blocked. The publish action requires:
1. Active operator session
2. Operator role
3. Explicit button click
4. Confirmation checklist completed

There is no scheduled publish, no time-delayed publish, and no triggered publish from any pipeline event.

---

## 12. Delivery Proof Integration

### wordpress_drafts record

After V2, each draft record contains:

| Field | When set | Source |
|---|---|---|
| `status` | Created or published | LeadLayer |
| `published_at` | On publish | `now()` |
| `published_by` | On publish | userId |
| `published_url` | On publish | WP API `link` field |
| `publish_source` | On publish | `"leadlayer_publish"` or `"operator_manual"` |
| `seo_meta_status` | On draft creation | Plugin detection result |
| `meta_title` | On draft creation | Artifact payload |
| `meta_description` | On draft creation | Artifact payload |

### Monthly report

`wordpressSummary` in the monthly report:
```ts
{
  draftsCreated: number,       // created this period (created_at filter)
  draftsPublished: number,     // published this period (published_at filter)
  seoMetaPushed: number,       // drafts with seo_meta_status = pushed_* this period
  drafts: Array<{
    title: string | null,
    targetSlug: string | null,
    wpEditLink: string | null,
    publishedUrl: string | null,
    publishedAt: string | null,
    publishSource: string | null,  // "leadlayer_publish" | "operator_manual"
    seoMetaStatus: string | null,
    status: string,
  }>
}
```

The report narrative distinguishes:
- "X pages published via LeadLayer, Y published manually"
- "SEO meta pushed for Z pages; W pages require manual SEO entry"

### Public report (`/r/:shareToken`)

Adds:
- "Pages published" count (unchanged from V1)
- No `seoMetaStatus` exposure — operator-internal

### Monthly execution plan

If `draftsPublished === 0` for the period and the execution plan ran: plan adds an action item "Confirm pages published — X drafts are ready but not marked live."

If `seoMetaStatus: "manual_required"` exists for any draft: plan adds "Complete SEO meta entry for [page title] in WP Admin."

---

## 13. Safety Model

### What V2 never does automatically

| Action | Status |
|---|---|
| Live-publish a page without operator confirmation | ❌ Never |
| PATCH or overwrite an existing published page | ❌ Never (V2 only creates new; existing page updates are V3) |
| Submit or edit a contact form | ❌ Never |
| Upload or replace images | ❌ Never |
| Set alt text on existing images | ❌ Never |
| Create a draft on WordPress.com | ❌ Never (V2 scope) |
| Delete a page | ❌ Never |
| Create a draft on WordPress.com | ❌ Never |

### Credentials

- Stored in `tenant_secrets` as AES-GCM encrypted value with `encryption_version`
- Decrypted in-memory only within server functions
- Never logged, never returned to client, never cached between requests
- Each credential load is a fresh DB read + decrypt

### Failure safety

On any WP API failure:
1. Record the error on the draft row (`error_message`)
2. Set draft `status: "failed"`
3. Set bundle `status: "failed"`
4. Do not retry automatically
5. Operator sees error and retry button in execution board

On SEO meta write failure:
1. Fall back to `seo_meta_status: "manual_required"`
2. Draft creation continues normally — SEO meta failure does not block the draft
3. Operator sees manual checklist in execution board

### No existing page overwrite

V2 uses `POST /wp-json/wp/v2/pages` (create) only. The `PATCH /wp-json/wp/v2/pages/{id}` endpoint is used only for the `status: publish` change on the same draft record created by LeadLayer. No existing page (created outside LeadLayer) is ever written to in V2.

---

## 14. Existing Page Optimization V1 — Next Sprint After V2

This is explicitly out of V2 scope. Define here so the product is coherent.

**Goal:** Allow LeadLayer to improve an existing published service page without creating a new one.

**Trigger:** Masterplan item of type `service_page` or `location_page` where `page_mappings` shows `mapping_type = "existing_page"` — the page already exists.

**Flow:**

1. Operator clicks "Fetch existing page" on the masterplan item
2. LeadLayer calls `GET /wp-json/wp/v2/pages/{wp_post_id}` and stores the current title, content, meta, and slug as a snapshot on the `wordpress_site_inventory` row (`before_snapshot: JSON`)
3. Page brief generator runs in "optimization mode" — it receives the before snapshot alongside the standard context and generates an optimization patch: what to change in H1, meta, intro, proof block, CTA, schema, internal links
4. Operator reviews the patch in the execution board (diff-style: before / after per section)
5. Operator approves the patch
6. LeadLayer calls `PATCH /wp-json/wp/v2/pages/{wp_post_id}` with the updated title, content, excerpt, and meta
7. `published_at`, `published_by`, and `publish_source: "leadlayer_optimize"` are recorded
8. Before snapshot is retained for audit trail

**Risks (reason this is not in V2):**
- Overwriting an existing page that is currently ranking is high-risk without before-state confirmation
- Content inside complex Gutenberg layouts (reusable blocks, FSE templates) may not serialize/deserialize cleanly
- Requires before/after diffing UI that does not yet exist

**V1 implementation status: COMPLETE — 2026-05-29**
- Before snapshot stored before any write ✓
- PATCH only updates fields with non-null recommended values ✓
- Content hash validates snapshot freshness before applying ✓
- Page-builder pages (Elementor, Divi, WPBakery, Beaver) detected as `meta_only` ✓
- Operator 4-item confirmation checklist gates every apply ✓
- Delivery proof in `wordpress_page_updates`, artifact `delivery_status` ✓

See `docs/EXISTING_PAGE_OPTIMIZATION_V1.md` for full spec.

---

## 15. Pilot Readiness Acceptance Criteria

All of the following must pass before the first paid pilot client:

**Template system**
- [ ] Service Page template generates correct Gutenberg block structure for an AC repair page brief
- [ ] Local Landing Page template generates correct Gutenberg block structure for an AC repair + Dallas location brief
- [ ] Emergency Page template generates correct structure with urgency bar, ordered process list, and red CTA button
- [ ] Template selection happens automatically from `masterplan_item.type` and `metadata.urgency`
- [ ] `wp:buttons > wp:button` block renders as a clickable button in WP editor (not a paragraph)
- [ ] Internal links render as `<a href="/slug">text</a>` in the block content (not comma-separated text)

**SEO meta**
- [ ] Yoast detection works: `yoast/v1` in REST namespaces → `seo_meta_status: "pushed_yoast"` on success
- [ ] Rank Math detection works: `rankmath/v1` in REST namespaces → `seo_meta_status: "pushed_rankmath"` on success
- [ ] Manual checklist shown in execution board when `seo_meta_status: "manual_required"`
- [ ] `meta_title` and `meta_description` stored on `wordpress_drafts` row
- [ ] SEO meta push failure does not block draft creation

**Publish from LeadLayer**
- [ ] Operator confirmation checklist shown before publish action
- [ ] `PATCH /wp-json/wp/v2/pages/{id}` with `status: publish` succeeds on a real test site
- [ ] `published_url` is automatically populated from WP API response `link` field
- [ ] `publish_source: "leadlayer_publish"` recorded on success
- [ ] Failure shows error and retry without corrupting draft record

**Delivery proof**
- [ ] Monthly report `wordpressSummary.seoMetaPushed` count is correct
- [ ] Monthly report narrative distinguishes LeadLayer-published vs. manually-published pages
- [ ] Execution board shows SEO meta status indicator per draft

**Safety**
- [ ] No code path exists that sets `status: publish` without operator confirmation
- [ ] No `PATCH` call targets a page that was not created by LeadLayer in this session

**Typecheck and build clean** after all V2 changes

---

## 16. Open Decisions

These decisions are needed before implementation begins. Record the decision and the person who made it.

| Decision | Options | Default if not decided | Owner |
|---|---|---|---|
| **Yoast only, or Yoast + Rank Math at launch?** | Yoast only (simpler, lower risk) vs. Yoast + Rank Math (more coverage) | Yoast only — add Rank Math when a pilot client needs it | Product |
| **Publish from LeadLayer in pilot, or still manual in WP?** | V2 publish (one operator click) vs. V1 flow (WP admin + mark in LeadLayer) | V1 flow for first pilot; V2 publish as optional upgrade | Operator |
| **How many templates required before pilot?** | All 3 (Service + Local + Emergency) vs. Service + Local only (Emergency deferred) | Service + Local only — Emergency added when needed by a pilot client's niche | Product |
| **Is emergency template required for the HVAC pilot?** | Yes (AC out in summer = emergency demand) vs. No (general service pages first) | Yes for HVAC — recommend including Emergency as priority 3 | Operator |
| **SEO plugin detection: pre-check at capability check, or post-check at draft creation?** | Pre-check (stored on connection, faster at draft time) vs. post-check (always fresh, slightly slower) | Pre-check — store `seoPlugin` in `wordpress_connections.capabilities` | Engineering |
| **CTA button color: hardcoded primary, or theme-aware?** | Hardcoded `"backgroundColor":"primary"` (safe, theme handles it) vs. operator-configured color | Hardcoded primary — operator adjusts in WP editor if needed | Engineering |
| **meta_title / meta_description columns on wordpress_drafts: add now or derive from artifact?** | New columns (easier querying) vs. derive from artifact join at report time (no migration needed) | New columns — makes reporting and manual checklist simpler | Engineering |
| **If Yoast meta write fails silently (200 response but meta not saved), how do we detect?** | Re-read page after POST and verify `yoast_head_json` contains our title vs. trust the 200 | Re-read and verify — adds one extra GET per draft creation | Engineering |

---

*Last updated: 2026-05-29*
*Related docs: [`docs/WORDPRESS_DRAFT_CREATION_V1.md`](./WORDPRESS_DRAFT_CREATION_V1.md), [`docs/PILOT_RUNBOOK_AND_MONTHLY_DELIVERY_OS.md`](./PILOT_RUNBOOK_AND_MONTHLY_DELIVERY_OS.md)*
