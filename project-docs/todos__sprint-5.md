# Sprint 5 — Leads & Reporting

**Doel:** alle ingaande events (form, call, email) → dedupe → `leads` tabel → maandrapport + alerts bij dip.

**Flow:** `diagrams/flow-leads.mmd`

---

## Todo's

### Public routes
- [ ] `/api/public/leads/ingest` — HMAC-signed, accepteert form/call/email events.

### Server functions / jobs
- [ ] `leads.dedupe()` — cron via pg_cron op worker, match op email+phone+24h-window.
- [ ] `reports.monthly({ tenantId, month })` → JSON + Resend e-mail.

### UI
- [ ] `/app/leads` — lijst + filters (status, source, datum), detail-drawer met event-timeline.
- [ ] `/app/reports` — historisch overzicht, download PDF/CSV.

### Alerting
- [ ] Cron-rule "leads deze week < 70% van rolling-4w avg" → Resend alert naar owner.

---

## Acceptance

- [ ] 100 test-events → correct gededupliceerd (manual fixtures).
- [ ] Maandrapport mailt op de 1e van de maand om 08:00 lokale tijd tenant.
- [ ] Alert triggert bij gesimuleerde dip.
