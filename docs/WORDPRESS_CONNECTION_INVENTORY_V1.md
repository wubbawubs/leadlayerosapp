# WordPress Connection + Inventory V1

> Status: Implemented — branch `wordpress-connection-inventory-v1`
> Built on top of: `docs/WORDPRESS_INTEGRATION_ARCHITECTURE.md`

Read-only inventory layer. No WordPress writes, no draft creation, no publishing.

---

## Scope

V1 covers stages 1–3 of the integration:

1. **Connection** — `wordpress_connections` row wraps an existing `site_connections` row
2. **Capability check** — reads WP REST `users/me` to confirm credentials work and role is sufficient
3. **Site inventory** — fetches pages + posts and upserts into `wordpress_site_inventory`
4. **Conservative page mapping** — matches inventory to masterplan items / business profile services / locations

**Explicitly out of scope:**
- WordPress writes, draft creation, live publishing
- Execution task engine, artifact generation
- Rollback, diff preview, tracking integration

---

## Architecture

### Credential model

Credentials are never stored in the new tables. The existing flow is reused:

| Connection type  | Secret key                            | Source                                      |
|------------------|---------------------------------------|---------------------------------------------|
| `wordpress`      | `site:{siteConnectionId}:app_password`      | Application Password entered by operator    |
| `wordpress_com`  | `site:{siteConnectionId}:wpcom_access_token` | OAuth2 callback (`/api/public/wpcom/callback`) |

`tenant_secrets` stores AES-256-GCM encrypted values. `decrypt()` is called server-side only. Secrets are never returned to the client.

### Table relationships

```
site_connections          (existing)
  └── wordpress_connections          ← V1 new — capability metadata
        └── wordpress_site_inventory ← V1 new — page/post snapshot
        └── wordpress_page_mappings  ← V1 new — role assignments
```

`wordpress_connections` has a `UNIQUE(site_connection_id)` constraint — one metadata row per site connection.

---

## Database tables

### `wordpress_connections`

WordPress-specific metadata layer on top of `site_connections`. No credential columns.

| Column           | Type        | Notes                                              |
|------------------|-------------|----------------------------------------------------|
| `id`             | uuid        | Primary key                                        |
| `tenant_id`      | uuid FK     | → `tenants`                                        |
| `site_connection_id` | uuid FK | → `site_connections`, unique                       |
| `kind`           | text        | `self_hosted` or `wordpress_com`                  |
| `base_url`       | text        | Normalized (no trailing slash)                     |
| `rest_base_url`  | text        | `{base_url}/wp-json/wp/v2` for self-hosted         |
| `status`         | text        | `not_connected` / `connected` / `failed` / `needs_review` / `revoked` |
| `capabilities`   | jsonb       | Result of last capability check                    |
| `last_checked_at`| timestamptz | When capabilities were last verified               |
| `error_message`  | text        | Last error if `status=failed`                      |

### `wordpress_site_inventory`

Snapshot of pages and posts. Unique on `(wordpress_connection_id, wp_post_id, post_type)`.

| Column                   | Type        | Notes                                   |
|--------------------------|-------------|-----------------------------------------|
| `wp_post_id`             | bigint      | WP internal post ID                     |
| `post_type`              | text        | `page` or `post`                        |
| `status`                 | text        | `publish`, `draft`, `private`           |
| `title`, `slug`, `link`  | text        | From WP REST                            |
| `parent_id`              | bigint      | WP parent post ID (0 = root)            |
| `template`               | text        | Page template slug if set               |
| `modified_at`            | timestamptz | WP-side last modified                   |
| `content_hash`           | text        | For drift detection (future)            |
| `raw`                    | jsonb       | Full WP REST response                   |
| `mapped_page_role`       | text        | Role assigned by mapping (nullable)     |
| `last_synced_at`         | timestamptz | When this row was last written          |

### `wordpress_page_mappings`

Conservative role assignments.

| Column              | Type    | Notes                                           |
|---------------------|---------|-------------------------------------------------|
| `inventory_id`      | uuid FK | → inventory row, null for `missing_page`        |
| `masterplan_item_id`| uuid    | Linked masterplan item if applicable            |
| `mapping_type`      | text    | `existing_page` / `missing_page` / `candidate_match` / `manual_match` |
| `target_service`    | text    | Service term this mapping targets               |
| `target_location`   | text    | Location term this mapping targets              |
| `confidence`        | numeric | 0–1; `missing_page` always 0                   |
| `reasons`           | jsonb   | Array of strings explaining the match           |

---

## Server functions

All in `src/lib/shared/db/repos/wordpressConnections.functions.ts`.

| Function                      | Role required | Description                                    |
|-------------------------------|---------------|------------------------------------------------|
| `getOrCreateWordpressConnection` | operator   | Creates `wordpress_connections` row linked to a site connection |
| `getWordpressConnection`      | member        | Gets the row by `siteConnectionId`             |
| `listWordpressConnections`    | member        | Lists all for a tenant                         |
| `checkWordpressCapabilities`  | operator      | Calls WP REST, updates `capabilities` + `status` |
| `syncWordpressSiteInventory`  | operator      | Fetches pages/posts, upserts inventory         |
| `listWordpressSiteInventory`  | member        | Lists inventory rows                           |
| `buildWordpressPageMappings`  | operator      | Builds conservative mappings, replaces existing |
| `listWordpressPageMappings`   | member        | Lists mapping rows                             |

---

## WordPress REST helpers

`src/lib/shared/wpcom/wp-rest.server.ts`

- `checkSelfHostedCapabilities` — calls `GET /wp-json/wp/v2/users/me?context=edit` with Basic auth
- `fetchSelfHostedPages` / `fetchSelfHostedPosts` — paginated fetch, cap 500 items
- `checkWpcomCapabilities` — calls `GET https://public-api.wordpress.com/rest/v1.1/me`
- `fetchWpcomInventory` — fetches pages + posts from WP.com API, cap 500 items total

All read-only. Secrets never logged.

---

## Page mapping rules (V1)

Priority order (first match wins per inventory item):

1. **Homepage** — slug is empty, `home`, or `homepage`; or link equals `base_url`
2. **Contact page** — slug/title contains `contact`
3. **Masterplan item match** — title, service, location, target keyword scored against slug + title
   - Score ≥ 0.85 → `existing_page`
   - Score 0.60–0.84 → `candidate_match`
   - No match → `missing_page` (no inventory row linked)
4. **Business profile service match** — service term from BP offer profile
5. **Business profile location match** — location term from BP location profile

Confidence is conservative: exact match = 0.9, contains = 0.7, word overlap = 0.4.

`missing_page` entries have `confidence: 0` and `inventory_id: null` — they represent a masterplan target that has no corresponding WP page yet.

---

## UI route

`/sites/{siteId}/inventory`

Shows:
- Connection status card with capability badges
- "Check capabilities" button
- "Sync inventory" button (disabled if status is `failed`)
- "Build / refresh page mappings" button (visible when inventory is non-empty)
- Mapping summary tiles (existing / candidate / missing / manual)
- Inventory table (title, type, status, slug, modified, mapped role)

Navigation: reachable via "Inventory →" link on the `/sites/{siteId}/audits` page (only shown for WordPress connections).

---

## Growth Intelligence integration

`wordpress` module added to `GrowthIntelligenceSnapshot`:

```typescript
wordpress: WordpressSlice {
  status: 'missing' | 'placeholder' | 'partial' | 'connected';
  connectionStatus: string | null;
  kind: 'self_hosted' | 'wordpress_com' | null;
  inventoryCount: number;
  mappingCount: number;
  missingPageCount: number;
  capabilitiesOk: boolean | null;
  lastCheckedAt: string | null;
  lastSyncedAt: string | null;
}
```

Appears as "WordPress delivery" in the data availability matrix. Does **not** affect the readiness score (scoring weights unchanged — wordpress delivery is informational in V1).

---

## RLS

All three tables follow the established pattern:
- `SELECT`: `is_tenant_member(tenant_id)`
- `INSERT / UPDATE / DELETE`: `has_tenant_min_role(tenant_id, 'operator')`
- `tenant_secrets` values are never exposed to the RLS-scoped `authenticated` role

---

## What comes next (V2+)

Per `WORDPRESS_INTEGRATION_ARCHITECTURE.md` stages 4–7:

- Stage 4: Page mapping refinement + manual overrides UI
- Stage 5: Draft creation (new pages → WP draft via REST)
- Stage 6: Existing-page update bundle (no live write)
- Stage 7: Publishing gate (operator approval → publish draft)
