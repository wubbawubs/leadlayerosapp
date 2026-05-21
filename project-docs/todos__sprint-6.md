# Sprint 6 — Polish & GA

**Doel:** productie-rijp: billing, RBAC UI, audit-log viewer, SLA.

---

## Todo's

### Billing
- [ ] Stripe integratie (per tenant, seat-based).
- [ ] `/app/billing` — plan, invoices, payment method.
- [ ] Webhook `/api/public/stripe/webhook` (signature verify).

### RBAC
- [ ] Invite-flow (owner/admin invite via e-mail).
- [ ] Role-change UI met `protect_last_owner` guard.
- [ ] `/app/team` — member-lijst + role-editor.

### Observability
- [ ] Audit-log viewer combineert `secret_audit_log` + plan-audit + publish-audit.
- [ ] `/app/audit-log` — filter op user, action, datum.

### SLA & polish
- [ ] Status-page (uptime, last 30d incidents).
- [ ] Onboarding-video's + in-product tour.
- [ ] Empty-states + skeleton-loaders consistent.

---

## Acceptance

- [ ] Nieuwe tenant kan zelfstandig betalen, team invite-en, en activiteit auditen.
- [ ] Geen "lege" schermen zonder begeleiding.
