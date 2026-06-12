# Publishing Gate V1

Formal operator approval + safety envelope between "draft created" and "page goes live".
This was the blocking item for Safe Publishing in [`ROADMAP_V4.md`](./ROADMAP_V4.md).

## What changed

Before: a WordPress draft in `created` status could be published directly
(`publishWordpressDraftFromLeadLayer`) or marked published manually — no formal
approval step existed. The `needs_review` / `approved_for_publish` statuses were
reserved in the schema but never wired.

Now the flow is:

```
created ──(approve: checklist + safety envelope)──▶ approved_for_publish ──▶ publish
   │  ▲                                                    │                (LeadLayer API
   ▼  │                                                    ▼                 or manual mark)
needs_review ◀──────(request changes: reason)──────────────┘
```

Both publish paths refuse drafts that are not `approved_for_publish`. The gate is
enforced **server-side** — UI affordances only appear when the state allows them.

## Database

New columns on `wordpress_drafts` (in `20260602000000_schema_v1.sql`):

| Column | Type | Notes |
|---|---|---|
| `approved_at` | timestamptz | When the gate was passed |
| `approved_by` | uuid | `auth.users.id` of the approving operator |
| `approval_notes` | text | Optional operator notes at approval |
| `review_notes` | text | Reason when a draft is sent back for changes |
| `publish_safety_checks` | jsonb | The safety envelope (see below) |

No new statuses — `needs_review` and `approved_for_publish` already existed in
the `wordpress_drafts_status_chk` and `publishing_bundles_status_chk` constraints.

## Safety envelope (`PublishSafetyChecks`)

Stored on `wordpress_drafts.publish_safety_checks` at approval time, re-stamped at publish:

- `artifactApproved` — source page_brief artifact is still `approved`
- `draftHasWpPost` — WP post exists to publish
- `wordpressConnected` — connection status is `connected` at approval
- `canPublish` — connection capabilities allow writes
- `operatorChecklistConfirmed` — operator confirmed the 6-item checklist
- `seoMetaStatus` — SEO meta push state at approval (audit trail)
- `approvedAt` / `recheckedAt` — approval timestamp; publish-time re-check timestamp

If artifact approval, connection, or capabilities fail at approval time, the
approve call throws and nothing is written.

## Server functions (`src/lib/shared/wordpressDrafts/wordpressDrafts.functions.ts`)

**`approveWordpressDraftForPublish`** — the gate itself (operator/owner only):
1. Draft must be `created` or `needs_review`, not published, with a `wp_post_id`
2. Source artifact must still be `approved`
3. WP connection must be `connected` with `canCreateDraft`
4. Writes `approved_for_publish` + `approved_at/by` + notes + safety envelope
5. Bundle → `approved_for_publish`

**`requestWordpressDraftChanges`** — sends `created` or `approved_for_publish`
back to `needs_review` with a required reason; clears any prior approval; bundle
→ `needs_review`. Published drafts are refused (changes go through page optimization).

**`publishWordpressDraftFromLeadLayer`** — now requires `approved_for_publish`
(was: `created`). On success, re-stamps the safety envelope with `recheckedAt`.

**`markWordpressDraftPublished`** — now requires `approved_for_publish`. The
manual path (operator or client publishes in WP admin) goes through the same gate.

Input schemas: `ApproveWordpressDraftInputSchema` (requires `checklistConfirmed: true`),
`RequestWordpressDraftChangesInputSchema` (requires `reason`).

## UI

**Execution board (`/growth/execution`):**
- `created` drafts: "Approve for publish →" opens the formal approval modal — the
  6-item operator checklist (reviewed in WP, images, internal links, SEO meta,
  schema verified, ready to go live) moved here from the old publish modal, plus
  optional approval notes. A "Send back: what needs to change?" inline row
  requests changes with a reason.
- `needs_review` drafts: amber "Changes requested" badge + the reason +
  "Re-approve for publish →".
- `approved_for_publish` drafts: emerald badge with approval date; only now do
  "Publish from LeadLayer →" (simplified final-confirm modal) and the manual
  "Mark manual" row appear.

**Operator dashboard (`src/components/execution/ExecutionBoard.tsx`):**
same gate with a compact two-step confirm button instead of the modal
(formal checklist lives on the execution board).

**Client pages table (`/clients/$tenantId/pages`):**
the Publish button only renders for `approved_for_publish` drafts; unapproved
drafts show "Awaiting approval" / "Changes requested". `PageInventoryItem` now
carries `draftStatus` for this.

## Non-goals (unchanged)

- Auto-publishing — every transition is operator-initiated
- Rollback / version management
- Client-facing approval flows (operator approves; client approval per tier is
  still an open question in `WORDPRESS_INTEGRATION_ARCHITECTURE.md`)

## What unblocks now

Safe Publishing's precondition ("no client website is touched until the approval
gate exists") is met. Remaining before first pilot publish: an operator drives a
full Goal → Masterplan → Execution → QA → Approve → Publish loop end-to-end in
the preview environment.
