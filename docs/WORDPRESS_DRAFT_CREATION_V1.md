# WordPress Draft Creation V1

Turn an approved `page_brief` execution artifact into a WordPress draft page for operator review.

## What was built

### Database

**`publishing_bundles`** — one bundle per artifact delivery attempt.
- Columns: `id`, `tenant_id`, `execution_artifact_id`, `masterplan_item_id`, `wordpress_connection_id`, `status`, `bundle_type`, `payload` (JSONB), `safety_checks` (JSONB), `error_message`, `created_at`, `updated_at`
- Status values: `draft_ready → draft_created | failed`; future: `needs_review → approved_for_publish | rejected`
- RLS: tenant members can SELECT; operator/owner can INSERT/UPDATE/DELETE

**`wordpress_drafts`** — one row per WP REST API call.
- Columns: `id`, `tenant_id`, `publishing_bundle_id`, `wordpress_connection_id`, `execution_artifact_id`, `wp_post_id`, `wp_post_type`, `wp_status`, `wp_edit_link`, `wp_preview_link`, `target_slug`, `title`, `status`, `error_message`, `raw_response`, `created_at`, `updated_at`
- Status values: `created | failed | needs_review | approved_for_publish | published`
- RLS: same pattern as publishing_bundles

### Shared schemas (`src/lib/shared/wordpressDrafts/schemas.ts`)
- `PublishingBundle`, `WordpressDraft` domain types
- `DraftSafetyChecks` — stored on bundle before API call
- `WordpressDraftPayload` — the title/slug/content/excerpt compiled from page brief
- `CreateWordpressDraftInputSchema`, `GetWordpressDraftForArtifactInputSchema`, `ListWordpressDraftsInputSchema`

### Gutenberg transformer (`src/lib/shared/wordpressDrafts/gutenberg.server.ts`)

`pageBriefToGutenbergContent(payload)` converts a `PageBriefArtifactPayload` into WordPress block editor content.

**Block mapping:**
| Page brief field | WP block(s) |
|---|---|
| `h1` | → WP post title (NOT duplicated in body) |
| `introBlock` | `core/paragraph` |
| `serviceSections[].heading` | `core/heading` (h2) |
| `serviceSections[].body` | `core/paragraph` |
| `proofBlock.items` | `core/list` (ul) |
| `faqBlock[].question` | `core/heading` (h3) |
| `faqBlock[].answer` | `core/paragraph` |
| `ctaBlock` | Styled `core/paragraph` with CTA text |
| `internalLinkTargets` | `core/paragraph` note (operator adjusts) |
| `schemaRecommendation` | `core/html` with JSON-LD `<script>` |

**V1 approach:** block-serialized HTML with `<!-- wp:block -->` comment markers. WordPress parses these as Gutenberg blocks in the editor. This is safe and avoids innerBlocks serialization complexity.

### WP REST write (`src/lib/shared/wpcom/wp-rest.server.ts`)

Added `createSelfHostedWordpressDraft(opts)`:
- POSTs to `{baseUrl}/wp-json/wp/v2/pages` with `status: "draft"`
- Returns `wpPostId`, `wpEditLink`, `wpPreviewLink`, `slug`
- Credentials never logged
- **WordPress.com draft creation is NOT supported in V1** — the WPcom REST v1.1 endpoint requires a different payload shape and the OAuth token scope from the current flow may not include post write access

### Server functions (`src/lib/shared/wordpressDrafts/wordpressDrafts.functions.ts`)

**`createWordpressDraftFromArtifact`** — primary action:
1. Load `execution_artifact` (requires `artifact_type = page_brief`, `status = approved`)
2. Load WordPress connection (requires `status = connected`, `kind = self_hosted`)
3. Check `capabilities.canCreateDraft = true`
4. Build `DraftSafetyChecks` and store on bundle
5. Transform payload via `pageBriefToGutenbergContent`
6. Create `publishing_bundles` row
7. Load credentials from `tenant_secrets` (never returned to client)
8. Call `createSelfHostedWordpressDraft`
9. Insert `wordpress_drafts` row
10. Update bundle status → `draft_created` or `failed`

**`getWordpressDraftForArtifact`** — latest draft for an artifact (for board display)

**`listWordpressDraftsForTenant`** — tenant-level listing (for future reporting)

### Execution Board integration (`src/routes/_authenticated/growth.execution.tsx`)

For approved `page_brief` items:
- **No draft yet:** "Create WordPress draft" button (active, calls `createWordpressDraftFromArtifact`)
- **Draft created:** "Draft created" badge + "Edit in WP ↗" + "Preview ↗" links
- **Draft failed:** "Retry draft creation" button (rose style)

Board fetches `wordpress_drafts` per approved artifact in `board.functions.ts` and surfaces `wpDraftId`, `wpDraftStatus`, `wpEditLink`, `wpPreviewLink` on each `ExecutionBoardItem`.

### Safety checks

Stored on `publishing_bundles.safety_checks` before any WP API call:
- `artifactApproved` — must be true
- `businessProfileReviewed`, `toneProfileReviewed` — informational (from quality gates)
- `wordpressConnected` — must be true
- `canCreateDraft` — must be true (from capabilities)
- `noLivePublish` — always `true`; draft status only
- `claimRiskFlagCount`, `missingContextCount` — stored for audit trail
- `checkedAt` — timestamp

If any hard gate (`artifactApproved`, `wordpressConnected`, `canCreateDraft`) fails, the API call is blocked and an error is thrown.

## Supported WordPress types (V1)

| Type | Support |
|---|---|
| Self-hosted WordPress (Application Passwords) | ✅ Full support |
| WordPress.com | ❌ Not supported in V1 |

## Non-goals

- Live publishing (no `status: publish` is ever written)
- Updating existing live pages
- Rollback / version management
- Auto-publishing pipeline
- WP.com draft creation
- Client portal
- GA/GSC/call tracking
- Monthly report generation

## Delivery proof (Delivery Proof + Revenue Chain V1)

New DB columns on `wordpress_drafts`:
| Column | Type | Notes |
|---|---|---|
| `published_at` | timestamptz nullable | Operator-confirmed publication timestamp |
| `published_by` | uuid nullable | `auth.users.id` of the operator who confirmed |
| `published_url` | text nullable | Live page URL after publication |
| `publication_notes` | text nullable | Optional operator notes |

**`markWordpressDraftPublished({ tenantId, draftId, publishedUrl?, notes? })`**
- Operator-only. Requires the draft to exist and not already be marked published.
- Sets `status = published`, `published_at = now()`, `published_by = userId`.
- No WP API call is made — this is a manual confirmation of operator-published page.
- Execution board shows "Published" badge + date + "View live" link after this action.

**Monthly report impact:**
- `wordpressSummary.draftsPublished` counts drafts with `published_at` in the report period.
- Narrative distinguishes: "X pages published live" vs. "Y drafts awaiting publish."
- Public share page shows "Pages published" instead of "Pages in draft" when `draftsPublished > 0`.

## Future publishing gate

Publishing a WP draft to `status: publish` requires:
1. Operator manual approval in WP admin + `markWordpressDraftPublished` in LeadLayer, OR
2. A future "Approve for publish" gate in the platform (changes `publishing_bundles.status → approved_for_publish`)
3. A separate "Publish" server function that sets `wp_status = publish` via PATCH to the pages endpoint
