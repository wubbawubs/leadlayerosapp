# WordPress Integration Architecture

> Version: 1.0
> Status: Design spec — no implementation in this sprint
> Sibling: `CLIENT_JOURNEY_AND_OS_ARCHITECTURE.md`

WordPress is treated as a **core delivery layer**, not a plugin
afterthought. This doc defines the staged integration so the Execution
Layer can be built against a real target instead of a generic content
blob.

No code, schema, or UI changes in this sprint. The existing WPCOM OAuth
helper (`src/lib/shared/wpcom/`) is unchanged and gets reused.

---

## A. Product Purpose

WordPress is the delivery surface for approved LeadLayer execution
artifacts. Every artifact (page brief, optimization bundle, FAQ block,
schema) ultimately becomes either:

- a **new WordPress draft page**, or
- an **update bundle** prepared for an existing WordPress page

Designed **before** Execution so artifacts know their target format,
constraints, and safety envelope.

---

## B. Integration Stages

```
1. Connection
2. Capability check
3. Site inventory
4. Page mapping
5. Draft creation                 (new pages)
6. Existing-page update bundle    (proposed edits, no live write)
7. Publishing gate                (operator approval → draft published)
8. Safe auto-publishing           (future, not V1)
```

V1 ends at stage 7 for new pages, stage 6 for existing pages. Live
writes to existing pages are out of scope until rollback + diff preview
exist.

---

## C. Auth Model

Two paths, same data model:

- **WordPress.com sites** — reuse existing OAuth2 in `src/lib/shared/wpcom/` (already wired through `/api/public/wpcom/callback`).
- **Self-hosted WordPress** — WordPress Application Passwords. HTTPS required. Revocable by site admin. Encrypted at rest using the existing `ENCRYPTION_KEY` (same envelope as `src/lib/shared/secrets/crypto.server.ts`).

V1 connection flow is **operator-assisted**: the operator pastes the
application password during onboarding. Client self-service comes later.

A user with Editor capability is sufficient for V1 (read pages, create
drafts, upload media). Admin is not required.

---

## D. Data Model Proposal

Sketches, **not migrations**. Built next sprint.

- `wordpress_connections` — one per (tenant, site)
- `wordpress_site_inventory` — snapshot of pages/posts/media/templates
- `wordpress_page_mappings` — LeadLayer page-role ↔ WordPress post
- `wordpress_drafts` — drafts created by LeadLayer, linked to artifacts
- `publishing_bundles` — approved artifact payload ready to publish

RLS scoped by `tenant_id` like every other tenant-owned table.

---

## E. Field Specs

### `wordpress_connections`
- `id`, `tenant_id`
- `site_id` (FK to `site_connections` when applicable)
- `kind` — `wpcom` | `self_hosted`
- `base_url`, `rest_base_url`
- `username`
- `encrypted_application_password` (or `encrypted_oauth_token` for WPCOM)
- `status` — `pending` | `connected` | `error` | `revoked`
- `capabilities` — JSON: `{ canReadPages, canCreateDraft, canUpdateDraft, canUploadMedia, canReadTaxonomies }`
- `last_checked_at`, `error_message`
- `created_at`, `updated_at`

### `wordpress_site_inventory`
- `id`, `connection_id`, `tenant_id`
- `wp_post_id`, `type` (`page` | `post` | custom)
- `status` (`publish` | `draft` | `private`)
- `title`, `slug`, `link`, `parent`
- `template`
- `modified` (WP-side timestamp)
- `content_hash` (to detect drift)
- `mapped_page_role` — nullable, resolved during mapping
- `last_synced_at`

### `wordpress_page_mappings`
- `id`, `tenant_id`, `connection_id`
- `wp_post_id` (nullable for "new page" targets)
- `page_intelligence_id` (nullable)
- `masterplan_item_id` (nullable)
- `target_kind` — `existing_page` | `new_page`
- `page_role` — e.g. `service:ac_repair`, `location:dallas`, `homepage`, `contact`
- `confidence`, `notes`

### `wordpress_drafts`
- `id`, `tenant_id`, `connection_id`, `mapping_id`
- `artifact_id` (FK to future execution artifact)
- `wp_post_id` (nullable until WP draft created)
- `status` — `staged` | `draft_created` | `draft_updated` | `published` | `failed`
- `payload` (Gutenberg block JSON)
- `meta` (title, slug, excerpt, schema)
- `last_action_at`, `error_message`

### `publishing_bundles`
- `id`, `tenant_id`, `artifact_id`
- `target` — `wordpress_draft` | `wordpress_update_bundle` | `toplayer` (future)
- `approved_by`, `approved_at`
- `payload` (full bundle as delivered to WP or stored locally)
- `result` — `pending` | `dispatched` | `done` | `failed`

---

## F. Page Mapping Logic

Map LeadLayer concepts to WordPress posts so Execution never generates
duplicate garbage pages.

Inputs:
- `page_intelligence` rows (role, intent, target keyword)
- `masterplan_items` (service / location / content / conversion targets)
- `wordpress_site_inventory` (existing pages with slug + title)

Resolver:
1. **Exact slug match** — `service-ac-repair` ↔ `/services/ac-repair/`
2. **Normalized title match** — fuzzy match on title vs page role
3. **Intent match** — page intent + target keyword vs page title/slug
4. **Manual override** — operator can lock or override a mapping

Output per masterplan item:
- `target_kind: existing_page` with `wp_post_id` and confidence, or
- `target_kind: new_page` with proposed slug/parent

Without mapping, Execution must not generate a draft. No mapping, no write.

---

## G. Draft Strategy

**New pages**
- Generate page bundle from artifact
- Create WP draft via REST API
- Save `wp_post_id` on `wordpress_drafts`
- Operator reviews in WordPress admin OR in LeadLayer preview

**Existing pages**
- V1: **never overwrite live pages**
- Generate a LeadLayer update bundle (proposed diff: title, meta, sections, CTA, schema)
- Operator reviews bundle in LeadLayer
- Future: create WP revision/draft clone after diff preview + rollback exist

---

## H. Content Format

V1 generates **Gutenberg-compatible structured blocks**:

- `core/heading` for H1/H2
- `core/paragraph` for intro and sections
- `core/list` for FAQs
- `core/buttons` for CTA
- `core/html` for JSON-LD schema (or `<script type="application/ld+json">` in raw HTML fallback)

Meta (SEO title, meta description, OG image) stored on the artifact in
V1 — direct write to Yoast/RankMath custom fields is a follow-up.

No Elementor / Divi / Bricks builder output in V1. Themes that depend on
a page builder get "draft + manual styling needed" treatment until
explicit support is added per builder.

Page-level fields written on WP draft:
- `title`, `slug`, `status: 'draft'`, `parent` (when known), `content` (block markup)

---

## I. Safety Model

- **No live publish in V1.** Every WP write goes to `status: draft`.
- **Operator approval required** to even create a draft. Artifact must be approved first.
- **Artifact versioning** — every regeneration creates a new artifact version; the bundle records which version was published.
- **Write audit log** — every WP API call logged with payload hash, response, actor.
- **Rollback** — store the WP post's pre-write `content_hash` on `wordpress_drafts`; rollback as a future safe-publishing feature.
- **Capability re-check** — before each write, verify `capabilities` is still valid (token may have been revoked).

---

## J. How This Connects to Execution

Execution Artifact lifecycle:

```
Snapshot
  → masterplan item
  → execution task
  → artifact generated (uses BP, tone, market, competitive, page diag, GBP, claims)
  → operator review
  → artifact approved
  → publishing_bundles row created
  → wordpress_drafts row created
  → WP draft created via REST
  → operator final review
  → (future) publish
```

Artifact approval is **the only path** that touches WordPress. No raw
audit issue, no unreviewed proposal, no auto-generated copy reaches WP
without going through this gate.

---

## K. Client / Operator Journey

**V1 — operator-assisted connection**
1. Operator collects WP URL + admin contact during onboarding call
2. Client (or their admin) creates an Application Password
3. Operator pastes it into LeadLayer
4. LeadLayer runs capability check + inventory sync
5. Operator confirms key page mappings

**V2 — client self-service**
1. Client enters WP URL in onboarding
2. Guided UI walks them through creating an Application Password
3. Automatic capability check + inventory
4. Operator confirms mappings later

---

## L. Open Questions

- **Encryption mechanism** — reuse `ENCRYPTION_KEY` envelope from `src/lib/shared/secrets/crypto.server.ts`, or new per-connection key?
- **Gutenberg edge cases** — how do we render proof blocks (reviews, certifications) without a custom block?
- **Media upload** — upload to WP media library on draft creation, or reference external URLs?
- **SEO plugin meta** — first-class support for Yoast and RankMath, or generic post-meta writes?
- **Revisions / rollback** — needed before any live-page edit; design separately
- **Client approval for publish** — required per tier? Required for new pages but not for minor optimizations?
- **Multi-site tenants** — one tenant, multiple WordPress sites: scope mappings per connection (already implied), but UI implications?
- **Theme detection** — should we detect "this site uses Elementor" during inventory and refuse to generate Gutenberg drafts?

---

## Build order (after this sprint)

1. Growth Intelligence Snapshot builder
2. **WordPress Connection + Inventory** (this doc → schema + server functions)
3. Navigation cleanup
4. Execution Task Engine + Artifacts (targeting WP draft bundles)
5. **WordPress Draft Publishing** (this doc → draft creation + mapping resolver)
6. Publishing Gate / QA
7. Tracking + Monthly Loop
