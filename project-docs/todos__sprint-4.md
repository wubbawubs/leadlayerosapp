# Sprint 4 — Content & Publish

**Doel:** approved monthly_plan → AI genereert `change_groups` (page-edits) → operator preview/edit → publish naar WP via worker.

---

## Todo's

### Server functions
- [ ] `changes.generateForMonth({ monthlyPlanId })` → batch LLM-calls → `change_groups` + `changes` rijen.
- [ ] `changes.approveGroup({ groupId })` → enqueue `wp_write_operations`.
- [ ] `changes.revert({ pageId, snapshotId })` → nieuwe change-group die snapshot herstelt.

### Public routes
- [ ] `/api/public/worker/wp-write-callback` — worker meldt success/fail per change.

### UI
- [ ] `/app/content` — change-group lijst, diff-viewer per page (oud snapshot vs nieuw), bulk-approve.
- [ ] Rollback-knop met confirmatie ("revert to snapshot from {date}").

### Snapshots
- [ ] Pre-publish snapshot automatisch via worker (verplicht).
- [ ] Post-publish snapshot automatisch.

---

## Acceptance

- [ ] Publish-flow end-to-end op test-WP (worker mock).
- [ ] Élke publish heeft `page_snapshots` rij vóór en na (audit-trail).
- [ ] Rollback werkt 1-klik en is zelf een nieuwe change-group.
