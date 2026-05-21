# Sprint 2 — Audit & Health

**Doel:** voor een connected tenant een baseline-audit draaien (Playwright crawl via externe worker), issues opslaan, health-score per categorie tonen.

**Flow:** `diagrams/flow-s2-audit.mmd`

---

## Todo's

### Contracts
- [ ] `jobs/schemas.ts` → `AuditPayload`, `BaselineSnapshotPayload`, `AuditResult` (Zod).

### Server functions
- [ ] `audits.requestAudit({ tenantId })` → schrijft `workflow_runs` rij met `state='queued'`.
- [ ] `audits.getLatest({ tenantId })` → laatste scan + health_scores + issues.

### Public routes
- [ ] `/api/public/worker/audit-callback` — HMAC-signed, worker upload `issues[]` + `health_scores`.

### Database
- [ ] Indexes op `issues(scan_id, severity)`, `health_scores(tenant_id, scored_at desc)`.

### UI
- [ ] `/app/audit` — health-score (4 categorieën: tech, content, links, conversion), issue-list met severity filter, "Run new audit" knop.
- [ ] Issue-detail drawer (recommendation + "Send to plan").

### Locale
- [ ] NL/EN voor issue-categorieën + severities.

---

## Acceptance

- [ ] Audit-knop → `workflow_runs.state` doorloopt `queued → running → done` (mock worker oké).
- [ ] Health-score zichtbaar binnen 5s na callback.
- [ ] Issues filterbaar op severity, link naar betreffende `page`.
