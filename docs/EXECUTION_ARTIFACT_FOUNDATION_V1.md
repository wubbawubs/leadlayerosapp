# Execution Artifact Foundation V1 — Page Brief

> Status: Implemented — branch `wordpress-connection-inventory-v1`
> Scope: page_brief artifact for service_page and location_page masterplan items only.

---

## Purpose

Closes the gap between Masterplan planning quality and execution output quality.

Before this sprint: a `service_page` masterplan item generated a `propose_intro_or_content_expansion` proposal — a text snippet. That is not enough to create a real WordPress page.

After this sprint: `service_page` and `location_page` items generate a **structured `page_brief` artifact** containing H1, meta, intro, service sections, FAQ, proof block, CTA, schema recommendation, internal link targets, and WordPress mapping.

proposal_v2 remains untouched for audit-fix micro-proposals (`website_fix`, `conversion`, `content`).

---

## New table: `execution_artifacts`

```
execution_artifacts
  id uuid PK
  tenant_id → tenants
  masterplan_item_id → masterplan_items
  growth_goal_id → growth_goals (nullable)
  artifact_type: page_brief | page_optimization_brief | cta_recommendation | gbp_checklist | tracking_checklist | review_flow | report_brief
  status: draft | needs_review | approved | rejected
  payload jsonb       — PageBriefArtifactPayload
  quality_gates jsonb — ArtifactQualityGates
  delivery_readiness jsonb — ArtifactDeliveryReadiness
  risk_flags jsonb
  missing_context jsonb
  generated_from jsonb
```

RLS: member SELECT, operator INSERT/UPDATE/DELETE.
proposal_v2 is unchanged and continues to serve audit-fix flows.

---

## PageBriefArtifactPayload

Stored in `execution_artifacts.payload`:

| Field | Purpose |
|---|---|
| `pageType` | `service_page` or `location_page` |
| `targetService`, `targetLocation` | From masterplan item metadata |
| `targetSlug` | Conservative slug proposal (lowercase, hyphens) |
| `parentSlug` | Parent page suggestion (nullable) |
| `h1` | Target H1 (max 120 chars) |
| `metaTitle` | SEO title (max 70 chars) |
| `metaDescription` | Meta description (max 160 chars) |
| `introBlock` | Promise-first opening paragraph |
| `serviceSections` | Up to 6 content sections (heading + body) |
| `faqBlock` | Up to 6 FAQ items |
| `proofBlock` | Verified proof + missing proof items |
| `ctaBlock` | Primary CTA text, secondary, placement |
| `schemaRecommendation` | Schema type + suggested fields + proof gaps |
| `internalLinkTargets` | Anchor text + target slug + rationale |
| `wordpressMapping` | WP inventory status + recommended action |
| `operatorNotes` | QA notes, claims to validate |
| `successMetric` | How to measure page effectiveness |
| `assumptions` | What needs operator validation |
| `missingContext` | Data that would improve the brief |
| `riskFlags` | Claims, proof gaps, risks |

---

## Quality gates

Gates run before generation. All must pass for generation to proceed:

| Gate | Condition |
|---|---|
| Business profile reviewed | Status reviewed/approved/locked OR review_ready with confidence ≥ 5/10 |
| Tone profile reviewed | Profile exists and has been analyzed (voiceIdentity present) |
| Item type | Must be service_page or location_page |

**WordPress connection does NOT block artifact generation.** WordPress readiness is captured in `delivery_readiness` as:
- `missing` — no WP connection
- `connected` — WP connected but no inventory
- `inventory_synced` — WP connected + inventory synced

This allows operators to generate and review page briefs before WordPress is configured. Draft creation (future sprint) will block on `inventory_synced`.

---

## Proposal mapping change

`service_page` and `location_page` items are removed from `proposalMapping.ts` SUPPORTED map.
They now return an unsupported message directing operators to use "Generate page brief" instead.

proposal_v2 is unaffected for:
- `website_fix` → `general_recommendation`
- `conversion` → `write_cta`
- `content` → `propose_intro_or_content_expansion`

---

## ProductFlow fix

`resolve.ts` now reads `snapshot.wordpress` instead of hardcoding `not_started`.
WordPress checklist item status reflects actual connection state.

---

## Execution Board changes

- `service_page` / `location_page` items now show **"Generate page brief"** button
- Artifact status (draft / needs_review / approved / rejected) is shown per item
- WordPress delivery readiness label shown when artifact exists
- Approve / Reject buttons for items in `in_qa` state
- **"Create WordPress draft (coming soon)"** stub visible when artifact is approved
- proposal_v2 flows (website_fix, conversion, etc.) unchanged

---

## Server functions

`src/lib/shared/executionArtifacts/artifacts.functions.ts`:

| Function | Description |
|---|---|
| `generatePageBriefArtifactFn` | Creates page_brief for service/location_page items |
| `listExecutionArtifactsForItem` | Lists all artifacts for a masterplan item |
| `getExecutionArtifact` | Fetches a single artifact |
| `updateExecutionArtifactStatus` | Operator review: approve / reject |
| `listLatestArtifactsForPlan` | Latest artifact per item (for board view) |

---

## What is NOT in this sprint

- WordPress draft creation (tables `wordpress_drafts` and `publishing_bundles` not created)
- WP writes of any kind
- Live publishing
- Publishing gate
- Rollback / versioning
- Full task management engine
- Tracking integration
- Monthly loop

---

## Files changed

**New:**
- `supabase/migrations/20260528180000_b3c4d5e6-f7a8-9012-bcde-f1234567890a.sql`
- `src/lib/shared/executionArtifacts/schemas.ts`
- `src/lib/shared/executionArtifacts/gates.server.ts`
- `src/lib/shared/executionArtifacts/generatePageBrief.server.ts`
- `src/lib/shared/executionArtifacts/artifacts.functions.ts`

**Modified:**
- `src/integrations/supabase/types.ts` — added execution_artifacts table types
- `src/lib/shared/execution/board.functions.ts` — artifact-aware board
- `src/lib/shared/masterplan/proposalMapping.ts` — redirected service/location_page
- `src/lib/shared/productFlow/resolve.ts` — real WP status
- `src/routes/_authenticated/growth.execution.tsx` — page brief UI

---

## Next sprint: WordPress Draft Creation V1

Requires:
1. This sprint — approved page_brief artifact ✅
2. `wordpress_connections.status = 'connected'` + `capabilities.canCreateDraft = true`
3. `wordpress_site_inventory` synced
4. `wordpress_page_mappings` row for this item
5. New tables: `publishing_bundles`, `wordpress_drafts`
6. New server function: `createWordpressDraftFromArtifact`
