# Existing Page Optimization V1

**Design doc. Not client-facing.**
**Companion to:** [`docs/WORDPRESS_DELIVERY_V2_PAGE_TEMPLATE_SYSTEM.md`](./WORDPRESS_DELIVERY_V2_PAGE_TEMPLATE_SYSTEM.md)

---

## 1. Why Existing Page Optimization Matters Before Pilot

Every pilot client arrives with a WordPress site that already exists. That site has a homepage, a contact page, and usually 2–5 service pages. Some of those pages rank for something. Some convert leads. Some do nothing.

If LeadLayer can only create new pages, the operator's first month of work looks like this: "We created 2 new pages." That's hard to defend when the client's existing homepage still has a broken CTA, no schema, and a meta description that was set in 2019.

Existing page optimization unlocks faster, more visible value:

**Fast value.** A client's existing service page might rank on page 2 for a competitive keyword. Improving the H1, meta title, and intro block is a 30-minute intervention that can move the needle faster than a new page that takes 3–4 months to build authority.

**Improves current lead paths.** Most inbound traffic lands on existing pages, not new ones. If the contact page CTA is weak or the homepage proof block is empty, LeadLayer-created new pages won't capture those leads even if they rank.

**Not only new pages.** The masterplan for a single-location HVAC client will always include both new pages (missing service/location pages) and improvements to existing pages (homepage, primary service page, contact). V1 delivers on both.

**Supports conversion and SEO improvements.** An existing page with a clear CTA update and improved schema can show conversion impact in the first monthly report. That's a more concrete "proof of delivery" story than waiting for new pages to rank.

---

## 2. Current Supported WordPress Delivery

| Capability | Status |
|---|---|
| New page draft creation from approved page_brief artifact | ✅ V2A |
| Three page templates (service / local / emergency) | ✅ V2A |
| SEO meta push to Yoast / Rank Math (best-effort, graceful fallback) | ✅ V2B |
| Plugin detection stored on connection capabilities | ✅ V2B |
| Publish from LeadLayer with 5-item operator checklist | ✅ V2C |
| `publish_source` recorded on draft (LeadLayer vs. operator manual) | ✅ V2C |
| Before snapshot of existing page before update | ❌ Not built |
| Fetch existing page content from WP REST API | ❌ Not built |
| Optimization artifact type (`page_optimization_brief`) | ❌ Not built |
| PATCH existing page via WP REST API | ❌ Not built |
| Delivery proof for optimized (not just created) pages | ❌ Not built |

---

## 3. V1 Goals

### 3.1 Fetch current page content

Before any optimization, LeadLayer fetches the existing page from the WP REST API (`GET /wp-json/wp/v2/pages/{id}`) and stores a before snapshot: title, slug, status, raw content, excerpt, and SEO meta if accessible. This snapshot is the safety record.

### 3.2 Store before snapshot

The snapshot is stored immutably on the `wordpress_site_inventory` row or a new `page_optimization_snapshots` table. It is never overwritten. The operator can reference it at any time to see what the page looked like before LeadLayer touched it.

### 3.3 Generate optimization artifact

A new artifact type — `page_optimization_brief` — is generated from the page brief generator in "optimization mode." The generator receives: the before snapshot, the growth goal context, business profile, tone profile, and masterplan item context. It produces a patch: what to change in the title, H1, meta, intro block, proof block, CTA, schema, and internal links.

### 3.4 Update content where safe

After operator approval, LeadLayer PATCHes the existing page via `POST /wp-json/wp/v2/pages/{id}` with only the fields that changed. Fields not touched by the optimization patch are not sent in the PATCH body — only modified fields are written.

Safe fields to update in V1:
- `title` (WP post title / H1)
- `content` (Gutenberg block content — only if page passes the safety gate)
- `excerpt` (used as meta description by WP and SEO plugins)
- `meta._yoast_wpseo_title` and `meta._yoast_wpseo_metadesc` (if Yoast detected)
- `meta.rank_math_title` and `meta.rank_math_description` (if Rank Math detected)

### 3.5 Record delivery proof

After a successful update:
- `delivery_status: "optimized"` on the artifact
- `delivered_at` and `delivered_by` recorded
- `before_snapshot_ref` links back to the snapshot
- Monthly report counts optimized pages separately from new pages

### 3.6 Preserve operator approval at every step

No automated optimization. The gate sequence is: fetch → snapshot → generate artifact → operator reviews diff → operator approves → operator clicks "Apply optimization" → LeadLayer PATCHes WP → proof recorded.

---

## 4. V1 Non-Goals

| Excluded feature | Reason |
|---|---|
| **Form editing** | Contact forms are outside content delivery scope |
| **Media / image uploads** | Operator creative judgment required |
| **Alt text generation and push** | Depends on media handling first |
| **Visual builder page editing (Elementor, Divi, Beaver Builder)** | These pages do not use standard Gutenberg serialization — PATCH would corrupt the layout. Excluded unless operator selects "manual mode" |
| **WordPress.com page updates** | Not supported in V1 scope |
| **Automated rollback** | WP Revisions is the rollback path. LeadLayer stores the before snapshot for reference; operator uses WP admin to revert if needed |
| **Auto-apply without operator confirmation** | Operator must review and approve every optimization |
| **Multi-location page scoping** | Branches V1 not yet built |
| **Bulk page optimization** | One page per artifact in V1 |
| **Page builder adapters** | Would require parser for each builder format |

---

## 5. Page Eligibility Rules

Not every WordPress page is safe to update via the REST API. LeadLayer must assess eligibility before generating an optimization artifact.

### Safe to optimize

| Page type | Condition |
|---|---|
| Standard Gutenberg page | Content uses `<!-- wp:block -->` markers — REST API reads and writes these cleanly |
| Classic editor page (simple HTML) | Content is plain HTML without builder shortcodes — writable, lower risk |
| Standard WP page with no `[shortcode]` markers | Shortcodes typically render builder or plugin content — safe to avoid |
| Blog post (if operator selects "post" type) | Same eligibility logic as pages |

### Ineligible or requires manual mode

| Page type | Risk | Recommendation |
|---|---|---|
| Elementor pages | Content is JSON in `_elementor_data` meta, not standard Gutenberg. REST content block is empty or placeholder. PATCH of `content` would destroy the layout. | Blocked unless operator switches to "meta-only mode" (update SEO meta only, leave content untouched) |
| Divi pages | Similar to Elementor — content stored in custom meta | Blocked / meta-only mode |
| Beaver Builder pages | Custom post meta | Blocked / meta-only mode |
| WPBakery / Visual Composer | Shortcode-heavy content | Blocked / meta-only mode |
| Homepage (page_on_front) | High visibility, high risk of breaking something the client notices immediately | Requires explicit operator confirmation beyond the standard checklist |
| Any page with `[contact-form-7]`, `[gravityforms]`, or similar plugin shortcodes in content | Form shortcodes are fragile if content is rewritten | Blocked / meta-only mode for content; SEO meta safe to update |

### Eligibility detection (at fetch time)

After fetching the page, LeadLayer checks:

1. **Content check:** if `rendered` content contains `data-elementor`, `data-widget_type`, `[et_pb_`, `[vc_`, `[gravityforms` — flag as page-builder-risk
2. **Meta check:** if `_elementor_data` or `_et_pb_use_builder` appear in the accessible meta — flag as page-builder-risk
3. **Gutenberg check:** if the `content.raw` field contains `<!-- wp:` markers — flag as Gutenberg-safe
4. **Homepage check:** if `slug === ''` or the page matches the site's `page_on_front` setting — flag as homepage-risk

These flags are stored on the before snapshot and surfaced to the operator before artifact generation.

### Meta-only mode

When a page is flagged as page-builder-risk, the operator can switch to "meta-only mode":
- Content is not PATCHed
- Only `title`, `excerpt`, and SEO plugin meta fields are updated
- Risk is significantly lower — content layout is preserved
- Delivery proof records `update_mode: "meta_only"`

---

## 6. Optimization Artifact Structure

The `page_optimization_brief` artifact type stores the following in `execution_artifacts.payload`:

```ts
type PageOptimizationBriefPayload = {
  // Target
  targetWpPostId:       number;
  targetSlug:           string;
  pageType:             "page" | "post";
  updateMode:           "full_content" | "meta_only";

  // Before state (reference — full before snapshot is stored separately)
  beforeSnapshotRef:    string;        // UUID of the before snapshot record
  currentTitle:         string | null;
  currentMetaTitle:     string | null;
  currentMetaDesc:      string | null;
  currentContentHash:   string;        // SHA-256 of before content

  // Recommended changes
  recommendedTitle:     string | null; // null = keep current
  metaTitle:            string | null; // null = no change
  metaDescription:      string | null; // null = no change
  improvedIntro:        string | null; // null = no change to intro block
  ctaBlock:             { primary: string; secondary?: string; placement?: string } | null;
  proofBlock:           { items: string[] } | null;
  faqBlock:             Array<{ question: string; answer: string }> | null;
  schemaRecommendation: { type: string; suggestedFields: Record<string, string> } | null;
  internalLinks:        Array<{ anchorText: string; targetSlug: string; rationale: string }>;

  // Operator guidance
  operatorChecklist:    string[];      // specific items for the operator to verify before applying
  riskFlags:            string[];      // flags surfaced during generation
  assumptions:          string[];
  successMetric:        string;
};
```

### Field rules

- Any field set to `null` means "do not change this field" — the PATCH body will not include it
- `recommendedTitle` is null when the current title is already adequate
- `improvedIntro` is null when update mode is "meta_only"
- `faqBlock` is null when the existing page already has adequate FAQ content
- `operatorChecklist` is always a non-empty array — operator must acknowledge every item before applying
- `riskFlags` surface issues the operator should check: content-heavy changes, schema type mismatch, keyword cannibalization risk

---

## 7. Before Snapshot Model

The before snapshot is stored in a new table: `page_optimization_snapshots`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK → tenants | |
| `wordpress_connection_id` | uuid FK → wordpress_connections | |
| `wp_post_id` | integer | WP REST API post/page ID |
| `post_type` | text | `"page"` or `"post"` |
| `title` | text nullable | WP post title at fetch time |
| `slug` | text nullable | |
| `status` | text nullable | `"publish"`, `"draft"`, etc. |
| `content_raw` | text nullable | `content.raw` from REST response (Gutenberg serialized) |
| `content_rendered` | text nullable | `content.rendered` from REST response (HTML) — stored for diff display |
| `excerpt_raw` | text nullable | `excerpt.raw` |
| `meta_title` | text nullable | SEO plugin title at fetch time (if readable) |
| `meta_description` | text nullable | SEO plugin description at fetch time (if readable) |
| `content_hash` | text | SHA-256 of `content_raw` — used to detect if page changed between snapshot and apply |
| `page_builder_risk` | boolean | True if Elementor/Divi/Beaver detected |
| `homepage_risk` | boolean | True if this is the site's front page |
| `fetched_at` | timestamptz | When the snapshot was taken |
| `created_at` | timestamptz | |

### Snapshot immutability

Once created, a snapshot row is never updated. If an operator re-fetches the page (e.g. after making manual changes in WP admin), a new snapshot row is created with a new UUID. The artifact's `beforeSnapshotRef` points to the snapshot used at generation time.

### Snapshot validity check at apply time

Before PATCHing the live page, the apply function re-fetches the page and compares the current `content.raw` hash against `page_optimization_snapshots.content_hash`. If they differ, the page has been modified since the snapshot — the operator is warned and must re-confirm or re-fetch a new snapshot before proceeding.

---

## 8. Apply Update Flow

The apply flow runs after operator approval of the optimization artifact.

### Step 1 — Pre-apply gates (all must pass)

See Section 9 for the full gate list. If any hard gate fails, the apply is blocked with a clear error message.

### Step 2 — Re-validate snapshot

Re-fetch the live page via `GET /wp-json/wp/v2/pages/{wp_post_id}` and compare `content.raw` hash to `page_optimization_snapshots.content_hash`. If mismatch: warn operator and require re-confirmation or new snapshot.

### Step 3 — Build PATCH body

Construct the PATCH payload from the optimization artifact. Only include fields that have a non-null recommended value:

```ts
const patch: Record<string, unknown> = {};
if (payload.recommendedTitle)   patch.title   = payload.recommendedTitle;
if (payload.improvedIntro && payload.updateMode === "full_content") {
  patch.content = buildGutenbergContent(payload); // run through template renderer
}
if (payload.metaDescription)    patch.excerpt  = payload.metaDescription;
if (meta fields detectable)     patch.meta     = buildSeoMetaFields(payload, seoPlugin);
```

### Step 4 — Execute PATCH

`POST /wp-json/wp/v2/pages/{wp_post_id}` with the PATCH body. Same authentication as draft creation (Application Password, Basic auth).

### Step 5 — Record delivery proof on success

Update the `execution_artifacts` row:
```
status:             "delivered"
delivery_status:    "optimized"
delivered_at:       now()
delivered_by:       userId
delivered_url:      response.link (if publish status, otherwise null)
before_snapshot_ref: unchanged (already set at artifact generation)
update_mode:        "full_content" | "meta_only"
```

Update the `wordpress_site_inventory` row for this `wp_post_id`:
```
last_optimized_at:  now()
last_optimized_by:  artifact_id
```

### Step 6 — Record delivery on failure

On any PATCH failure (network, auth, 4xx/5xx):
- Artifact `delivery_status` set to `"delivery_failed"` with `delivery_error_message`
- Page content on the live site is unchanged (PATCH either fully succeeds or fully fails at the WP level)
- Operator sees retry option in execution board
- Operator can also apply manually in WP admin and mark as optimized

### Monthly report count

`wordpressSummary` in the monthly report gains:
```ts
pagesOptimized:  number;  // execution_artifacts with delivery_status="optimized" in the period
```

---

## 9. Safety Gates

All gates are checked in `applyPageOptimization` server function before the PATCH is executed. Hard gates block the apply entirely. Soft gates warn the operator and require explicit override confirmation.

### Hard gates (blocking)

| Gate | Condition | Error |
|---|---|---|
| Artifact approved | `execution_artifacts.status === "approved"` | Artifact must be approved before applying |
| Artifact type | `artifact_type === "page_optimization_brief"` | Wrong artifact type |
| Before snapshot exists | `beforeSnapshotRef` is a valid snapshot UUID | Cannot apply without a before snapshot — re-fetch the page first |
| WP connection connected | `wordpress_connections.status === "connected"` | Re-check connection from the Sites page |
| Self-hosted only | `kind === "self_hosted"` | WordPress.com optimization not supported in V1 |
| canCreateDraft capability | `capabilities.canCreateDraft === true` | Same auth is used for PATCH |
| wp_post_id present | `targetWpPostId` is a valid integer | No post ID to PATCH |
| Snapshot freshness | Content hash matches current live page | Page has changed since snapshot — re-fetch before applying |

### Soft gates (operator confirmation required)

| Gate | Condition | Warning |
|---|---|---|
| Page builder risk | `page_builder_risk === true` and `updateMode === "full_content"` | This page appears to use a visual page builder. Updating the content block may break the layout. Switch to meta-only mode, or confirm you have a backup. |
| Homepage risk | `homepage_risk === true` | This is the site's homepage. Changes are immediately visible to all visitors. Confirm a backup exists before applying. |
| Critical risk flags | `riskFlags.length > 0` | Review all risk flags before applying. |
| SEO plugin meta manual | `seoMetaStatus === "manual_required"` | SEO meta could not be pushed automatically — enter it manually in WP Admin after applying. |

### Operator checklist items (always shown)

Before clicking "Apply optimization", the operator must check all items in `payload.operatorChecklist` (generated per artifact) plus these fixed items:

- [ ] I have reviewed the before and after content in the execution board
- [ ] The content changes are accurate and safe to publish
- [ ] I have confirmed a backup or WP Revision exists for this page
- [ ] I understand this updates the live page immediately (or draft, if the page is currently a draft)

---

## 10. Reporting Integration

### Monthly report

`wordpressSummary` is extended:

```ts
type WordpressSummary = {
  draftsCreated:    number;   // new draft pages created this period
  draftsPublished:  number;   // new pages published this period
  pagesOptimized:   number;   // existing pages optimized this period
  seoMetaPushed:    number;   // drafts where SEO meta was pushed (new + optimized)
  drafts:           DraftSummaryItem[];
};
```

The `drafts` array gains an `optimized` boolean field per item. The report narrative adds a section:

> "X existing pages were optimized this period: [page titles]. Updates included [summary of changes: meta, content, CTA, schema]."

### Public share page (`/r/:shareToken`)

Delivery section gains an "Existing pages improved" row when `pagesOptimized > 0`:

```
Pages published:   2
Existing pages improved:  1
```

The label "Existing pages improved" is intentionally plain — no technical terms about Gutenberg or REST API.

### Execution board

The execution board item for a `page_optimization_brief` artifact shows:

| State | Display |
|---|---|
| Artifact not generated | "Generate optimization brief" button |
| Artifact in review | "Review optimization" with before/after diff display |
| Artifact approved | "Apply optimization" button (with checklist gate) |
| Delivered | "Optimized" badge + delivery date + link to live page |
| Delivery failed | "Retry optimization" button + error message |

The board must also surface the `page_builder_risk` and `homepage_risk` flags as amber badges on the item card before the operator attempts to apply.

---

## 11. Future Improvements

After V1 is stable and validated on pilot clients, the following extend the capability:

| Feature | Description |
|---|---|
| **Visual diff display** | Side-by-side before/after rendering in the execution board so the operator can see exactly what will change before applying |
| **Rollback restore** | Operator clicks "Restore before snapshot" — LeadLayer PATCHes the page back to the stored `content_raw` and meta. Requires fetching and applying the snapshot content. |
| **Page builder adapters** | Elementor: detect and parse `_elementor_data` JSON structure. Patch specific widget text values. Generate partial patch for text-only elements. Divi: similar. |
| **Alt text push** | After image upload capability: push `alt` attribute updates to `core/image` blocks via content PATCH |
| **Form integration** | Detect form blocks (Gravity Forms, WPForms) in content and note them in operator checklist without trying to update them |
| **Attribution to optimized page** | Link `leads` with `attributed_artifact_id` pointing to the optimization artifact, so monthly reports can say "2 leads came from the optimized AC repair page" |
| **Multi-location page scoping** | After Branches V1: `location_id` on optimization artifacts so per-location existing pages are tracked separately |
| **Automated eligibility scan** | At inventory sync time, automatically score all pages for optimization readiness (Gutenberg-safe, SEO meta present/missing, CTA present/absent, schema present/absent). Surface a "quick wins" list to the operator. |

---

## 12. Acceptance Criteria for Implementation

All of the following must pass before the V1 implementation is considered complete:

### Database

- [x] `page_optimization_snapshots` table created with all columns from Section 7
- [x] `execution_artifacts` gains: `delivery_status text nullable`, `delivered_at timestamptz nullable`, `delivered_by uuid nullable`, `delivered_url text nullable`, `before_snapshot_ref uuid nullable FK → page_optimization_snapshots`
- [x] `wordpress_page_updates` table created for per-update delivery proof
- [x] `wordpress_site_inventory` gains: `last_optimized_at timestamptz nullable`, `last_optimized_by uuid nullable`
- [x] Migration applied: `supabase/migrations/20260529210000_f1a2b3c4-d5e6-7890-abcd-ef1234567890.sql`
- [x] `src/integrations/supabase/types.ts` updated

### Server functions

- [x] `fetchAndSnapshotExistingWordpressPage({ tenantId, wordpressConnectionId, wpPostId })` — fetches live page, stores snapshot, returns eligibility flags
- [x] `generateExistingPageOptimizationBrief({ tenantId, snapshotId, masterplanItemId? })` — generates `page_optimization_brief` artifact, LLM-based with fallback
- [x] `applyExistingPageOptimization({ tenantId, artifactId, confirmLivePage? })` — full gate chain, hash validation, PATCH, proof recording
- [x] `getOptimizationSnapshot({ tenantId, snapshotId })` — read snapshot by id

### WP REST helpers

- [x] `fetchSelfHostedWordpressPage` — GET /wp-json/wp/v2/pages/{id}?context=edit
- [x] `updateSelfHostedWordpressPage` — POST /wp-json/wp/v2/pages/{id} (approved fields only)

### Schemas

- [x] `src/lib/shared/existingPageOptimization/schemas.ts` — all domain types

### Execution board

- [x] `page_optimization_brief` items appear on the execution board via `optimizationByItem` data
- [x] Builder risk, meta-only, and manual-mode amber badges visible before apply
- [x] Operator checklist gate (4-item confirm modal) prevents apply until all checked
- [x] "Optimized ✓" badge shown after successful delivery
- [x] Step-by-step actions: Fetch snapshot → Generate brief → Approve → Apply

### Monthly reporting

- [x] `pagesOptimized` count in `wordpressSummary`
- [x] Report narrative: "Improved X existing pages this period."
- [x] Public share page shows "Existing pages improved" when > 0

### Safety

- [x] No PATCH executed without a before snapshot (hard gate)
- [x] Content hash mismatch blocks apply with `stale_content` error
- [x] Page-builder pages detected as `meta_only` — content PATCH blocked
- [x] Manual mode returns error before PATCH is attempted
- [x] Apply failure: only `delivery_status` updated, artifact `status` preserved
- [x] All apply attempts logged with `applied_by` (user ID) in `wordpress_page_updates`

### Build

- [x] `npx tsc --noEmit` clean
- [x] `bun run build` clean

---

*Last updated: 2026-05-29 — V1 implementation complete*
*Related docs: [`docs/WORDPRESS_DELIVERY_V2_PAGE_TEMPLATE_SYSTEM.md`](./WORDPRESS_DELIVERY_V2_PAGE_TEMPLATE_SYSTEM.md), [`docs/PILOT_RUNBOOK_AND_MONTHLY_DELIVERY_OS.md`](./PILOT_RUNBOOK_AND_MONTHLY_DELIVERY_OS.md)*
