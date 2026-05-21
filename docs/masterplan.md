# LeadLayer OS — Masterplan

> Single source of truth voor scope, volgorde en acceptatie van het hele platform.
> Update dit bestand bij elke scope-shift. Diagrammen staan in `docs/flows/` en `docs/database/`.

---

## 0. Noord-ster

**LeadLayer OS is de lead-infrastructuur voor service-bedrijven.**
Eén systeem dat search → website → tracking → opvolging koppelt, en élke maand gekwalificeerde aanvragen levert. Operator-grade, multi-tenant, NL/EN, brand-conform met `leadlayer.lovable.app`.

Outcome per tenant:
- Maandelijks bewezen lead-flow (nooit "we hopen dat het werkt").
- Volledig auditable: élke wijziging op de site, élke lead, élke job → terug te halen.
- AI doet zwaar werk (strategy, content, audit) → operator approved → publish.

---

## 1. Architectuur in één oogopslag

```text
┌─────────────────────────────────────────────────────────┐
│  Lovable workspace (deze repo)                          │
│  ─ TanStack Start (SSR + serverFn)                       │
│  ─ Supabase: Auth + Postgres (RLS) + Storage             │
│  ─ Lovable AI Gateway (LLMRouter)                        │
│  ─ Brand-shell identiek aan marketing-site               │
└────────────┬────────────────────────────────────────────┘
             │ (shared contracts: jobs/schemas.ts, db types)
             ▼
┌─────────────────────────────────────────────────────────┐
│  Externe worker-repo (later, buiten Lovable)            │
│  ─ Node + pg-boss                                        │
│  ─ Playwright (audits, snapshots)                        │
│  ─ WP REST probe + write-ops                             │
│  ─ DataForSEO, Resend, GSC/GA4 pulls                     │
└─────────────────────────────────────────────────────────┘
```

Marketing-site (`leadlayer.lovable.app`) blijft losse Lovable-project; alleen brand-tokens zijn overgenomen.

---

## 2. Sprintplan

| Sprint | Naam | Status | Korte definitie |
|--------|------|--------|-----------------|
| S0 | Foundation | ✅ done (zie `.lovable/plan.md`) | Cloud, migraties, auth, brand-shell, LLMRouter, vault |
| S1 | Onboarding & Connectivity | ⏳ next | Tenant-create, WP-connect (probe), GSC/GA4 connect, onboarding wizard |
| S2 | Audit & Health | 🟦 todo | Playwright crawl → issues → health-score → dashboard |
| S3 | Strategy & Master Plan | 🟦 todo | LLM master_plan + monthly_plan generator, approve-flow |
| S4 | Content & Publish | 🟦 todo | Page-edits via change-groups → preview-diff → WP write-ops |
| S5 | Leads & Reporting | 🟦 todo | raw_events → leads dedupe → maandrapport + alerting |
| S6 | Polish & GA | 🟦 todo | Billing, multi-seat, RBAC UI, audit-log viewer, SLA |

---

## 3. Sprint 1 — Onboarding & Connectivity

**Doel:** een nieuwe operator kan inloggen, een tenant aanmaken, zijn WordPress-site koppelen, en GSC + GA4 autoriseren — alles eindigt in `onboarding_sessions.status = 'connected'`.

### 3.1 Flows

Zie `docs/flows/s1-onboarding.mmd`.

### 3.2 Todo's

- [ ] **DB**: migratie `0004_s1_indexes.sql` — indexes op `site_connections(tenant_id, type)`, `onboarding_sessions(user_id)`.
- [ ] **ServerFn**: `tenants.createTenant({ name, geo, vertical })` → maakt tenant + owner-membership + onboarding_session.
- [ ] **ServerFn**: `siteConnections.startWpConnect({ tenantId, siteUrl })` → returnt instructies (app-password URL) + `connection_id`.
- [ ] **ServerFn**: `siteConnections.verifyWpConnect({ connectionId, username, appPassword })` → server-side WP REST probe (`/wp-json/wp/v2/users/me`), encrypt creds via vault, set `status='connected'`.
- [ ] **ServerFn**: `siteConnections.startOAuth({ tenantId, provider: 'gsc' | 'ga4' })` → returnt redirect URL (Google OAuth via Lovable broker, scopes per provider).
- [ ] **Route**: `/api/public/oauth/google/callback` — verifieer state, store refresh_token in vault, mark connection.
- [ ] **UI**: `/app/onboarding` wizard, 4 stappen — *Tenant → WordPress → GSC → GA4*. Stepper-component, server-state via `useQuery`.
- [ ] **UI**: gate `/app` — als geen tenant of `onboarding_sessions.status != 'connected'` → redirect naar `/app/onboarding`.
- [ ] **Locale**: NL/EN copy voor alle wizard-stappen in `src/lib/shared/locale/onboarding.ts`.
- [ ] **Tests** (handmatig acceptatie):
  - [ ] Twee users → twee tenants → kunnen elkaars data niet zien (RLS).
  - [ ] WP-probe faalt netjes bij verkeerd app-password (geen secret leak in error).
  - [ ] OAuth callback rejecteert verkeerde `state`.

### 3.3 Acceptance S1

- [ ] Nieuwe user → wizard volledig doorlopen → landt op `/app` met "Connected" badge per provider.
- [ ] `tenant_secrets` bevat 1 WP-cred + 2 OAuth refresh tokens, encrypted.
- [ ] `secret_audit_log` heeft rijen voor élke read.

---

## 4. Sprint 2 — Audit & Health

**Doel:** voor een connected tenant een baseline-audit draaien (Playwright crawl, geleverd door externe worker), issues opslaan, health-score per categorie tonen.

### 4.1 Flows

Zie `docs/flows/s2-audit.mmd`.

### 4.2 Todo's

- [ ] **Contract**: `jobs/schemas.ts` → `AuditPayload`, `BaselineSnapshotPayload`, `AuditResult`.
- [ ] **ServerFn**: `audits.requestAudit({ tenantId })` → schrijft `workflow_runs` rij met `state='queued'`.
- [ ] **Public route**: `/api/public/worker/audit-callback` — HMAC-signed, worker upload `issues[]` + `health_scores`.
- [ ] **DB**: indexes op `issues(scan_id, severity)`, `health_scores(tenant_id, scored_at desc)`.
- [ ] **UI**: `/app/audit` — health-score (4 categorieën: tech, content, links, conversion), issue-list met severity filter, "Run new audit" knop.
- [ ] **UI**: issue-detail drawer (recommendation + "Send to plan").
- [ ] **Locale**: NL/EN voor issue-categorieën.

### 4.3 Acceptance S2

- [ ] Audit-knop → `workflow_runs.state` doorloopt `queued → running → done` (mock worker oké).
- [ ] Health-score zichtbaar binnen 5s na callback.
- [ ] Issues filterbaar op severity, link naar betreffende `page`.

---

## 5. Sprint 3 — Strategy & Master Plan

**Doel:** AI genereert per tenant een `master_plan` (12 maanden) + huidige `monthly_plan`. Operator reviewt & approved. Geen edits zonder approval.

### 5.1 Todo's

- [ ] **LLMRouter**: prompt-templates `prompts/masterPlan.ts`, `prompts/monthlyPlan.ts` (NL/EN, vertical-aware).
- [ ] **ServerFn**: `strategy.generateMasterPlan({ tenantId })` — input: laatste audit + tenant.vertical + geo → output JSON gevalideerd met Zod.
- [ ] **ServerFn**: `strategy.approveMasterPlan({ planId })` → `approval_state='approved'`, locks edits.
- [ ] **UI**: `/app/strategy` — kaart per kwartaal, klik → maand-detail, approve-knop met diff-view bij re-generate.
- [ ] **Audit-log**: élke (re)generate + approve schrijft `secret_audit_log`-achtige plan-audit-rij.

### 5.2 Acceptance S3

- [ ] Master plan generation < 30s voor gemiddelde tenant.
- [ ] Approve → monthly_plan locked; re-generate vereist nieuwe approval.

---

## 6. Sprint 4 — Content & Publish

**Doel:** approved monthly_plan → AI genereert `change_groups` (page-edits) → operator preview/edit → publish naar WP via worker.

### 6.1 Todo's

- [ ] **ServerFn**: `changes.generateForMonth({ monthlyPlanId })` → batch LLM-calls, output `change_groups` + `changes` rijen.
- [ ] **ServerFn**: `changes.approveGroup({ groupId })` → enqueue `wp_write_operations` rij.
- [ ] **Public route**: `/api/public/worker/wp-write-callback` — worker meldt success/fail per change.
- [ ] **UI**: `/app/content` — change-group lijst, diff-viewer per page (oud snapshot vs nieuw), bulk-approve.
- [ ] **Rollback**: knop "revert to snapshot" → nieuwe change-group die `page_snapshots[prev]` herstelt.

### 6.2 Acceptance S4

- [ ] Publish-flow end-to-end op test-WP (worker mock).
- [ ] Élke publish heeft `page_snapshots` rij vóór en na (audit-trail).
- [ ] Rollback werkt 1-klik.

---

## 7. Sprint 5 — Leads & Reporting

**Doel:** alle ingaande events (form, call, email) → dedupe → `leads` tabel → maandrapport + alerts bij dip.

### 7.1 Todo's

- [ ] **Public route**: `/api/public/leads/ingest` — HMAC-signed, accepteert form/call/email events.
- [ ] **ServerFn**: `leads.dedupe()` (cron via pg_cron op worker) — match op email+phone+24h-window.
- [ ] **UI**: `/app/leads` — lijst + filters (status, source, datum), detail-drawer met event-timeline.
- [ ] **ServerFn**: `reports.monthly({ tenantId, month })` → JSON + Resend e-mail.
- [ ] **Alerting**: cron-rule "leads deze week < 70% van rolling-4w avg" → Resend alert.

### 7.2 Acceptance S5

- [ ] 100 test-events → correct gededupliceerd.
- [ ] Maandrapport mailt op de 1e van de maand om 08:00 lokale tijd tenant.

---

## 8. Sprint 6 — Polish & GA

- [ ] Stripe billing (per tenant, seat-based).
- [ ] RBAC UI (owner/admin/editor/viewer) — invite-flow, role-change met `protect_last_owner`.
- [ ] Audit-log viewer (`secret_audit_log` + plan-audit + publish-audit).
- [ ] SLA-page (status, uptime, last 30d incidents).
- [ ] Onboarding-video's + in-product tour.

---

## 9. Cross-cutting (altijd geldend)

- **Security**: nooit een ServerFn zonder `requireSupabaseAuth` (behalve `/api/public/*` met HMAC).
- **Tenancy**: élke query filtert expliciet op `tenant_id`; RLS is backstop, niet enige laag.
- **Locale**: alle user-facing strings via `locale/`; LLM-prompts krijgen `locale` mee.
- **Brand**: alleen semantische tokens; geen hex in components.
- **AI**: default route via Lovable AI Gateway; geen vendor keys in MVP.
- **Observability**: élke ServerFn logt `tenantId` + `userId` + `duration` (geen PII).

---

## 10. Documenten in deze map

- `docs/masterplan.md` — dit bestand.
- `docs/flows/` — Mermaid diagrammen per sprint (user-flow + system-flow).
- `docs/database/` — ERD + per-tabel toelichting.
- `docs/decisions/` — ADR's (één bestand per architectuurkeuze).
