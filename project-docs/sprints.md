# LeadLayer — Sprint Execution Plan

Eén document, per sprint exact wat je moet doen. Bedoeld om naar Cursor / Claude Code te sturen en stap-voor-stap af te werken.

---

## Volgorde-advies: backend-first, maar dun

Niet "eerst alle backend, dan alle frontend". Wel: **per sprint eerst data + contracten, dan worker/edge, dan UI**. Reden:

- RLS, schema en job-contracten zijn de duurste fouten als je ze later moet terugdraaien.
- UI bouwen op nog-niet-bestaande tabellen leidt tot mock-data die nooit verdwijnt.
- Worker (Playwright, crawls) is traag te debuggen, dus die wil je vroeg kunnen draaien.

**Per sprint deze vaste volgorde:**

1. DB migratie (tabellen, enums, RLS, triggers)
2. Shared contracten (Zod schemas, repo functies, job payloads)
3. Worker / edge function logic
4. Frontend UI + routes
5. E2E smoke + RLS-isolatietest

Pas door naar de volgende sprint als alle 5 stappen voor de huidige sprint groen zijn.

---

## S0 — Foundation (klaar in Lovable)

**Doel:** schema, RLS, auth, shared libs, secrets staan.

- [x] `0001_init.sql` — tenants, memberships(PK user_id,tenant_id), onboarding_sessions, site_connections, leads, raw_events, pages, fix_proposals, workflow_runs
- [x] `0002_rls_policies.sql` — expliciete policies per tabel + `is_tenant_member`, `has_tenant_role`
- [x] `0003_function_grants.sql` — revoke EXECUTE op trigger-functies
- [x] Auth: email+password, Google, geen auto-confirm, HIBP aan
- [x] Secrets: `ENCRYPTION_KEY`, `LOVABLE_API_KEY`
- [ ] Monorepo bootstrap buiten Lovable: `apps/web`, `apps/worker`, `packages/shared`
- [ ] `packages/shared/`: `locale/`, `db/repos/`, `secrets/crypto.ts` (AES-256-GCM), `jobs/schemas.ts` (Zod), `llm/router.ts`
- [ ] CI: RLS isolation smoke test (tenant A mag tenant B niet zien)

**Done-criterium:** twee test-users in twee tenants, beide kunnen alleen eigen data zien via API én via directe SQL met hun JWT.

---

## S1 — Onboarding & Tenant Setup

**Doel:** user kan account maken → tenant aanmaken → onboarding-flow doorlopen.

1. **DB:** geen nieuwe tabellen, alleen `onboarding_sessions` invullen (al bestaand).
2. **Shared:** `repos/tenants.ts`, `repos/onboarding.ts`, `OnboardingStep` enum.
3. **Worker/Edge:** edge function `create-tenant` (transactie: tenant + membership owner via trigger).
4. **Frontend:**
   - `/auth` (login + signup, Google)
   - `/onboarding/welcome` → `/onboarding/business` → `/onboarding/site` → `/onboarding/done`
   - Tenant-switcher in topbar
5. **Test:** signup → tenant aangemaakt → membership=owner → onboarding voltooid.

**Done:** nieuwe user kan in <2 min van signup naar lege dashboard.

---

## S2 — Site Connect (WordPress REST)

**Doel:** tenant koppelt WP-site, credentials encrypted opgeslagen, probe werkt.

1. **DB:** `site_connections` (al bestaand) — `provider='wordpress'`, `auth_type='app_password'`, `credentials_encrypted bytea`.
2. **Shared:** `secrets/crypto.ts` (encrypt/decrypt met `ENCRYPTION_KEY`), `repos/siteConnections.ts`, job-payload `probe_site`.
3. **Worker:** job `probe_site` → REST call `/wp-json/wp/v2/users/me` → status opslaan in `site_connections.last_probe_at` + `last_probe_status`.
4. **Frontend:**
   - `/sites` lijst
   - `/sites/new` form (URL, username, application password) — submit encrypt clientside? **Nee**: stuur via edge function, encrypt server-side.
   - status-badge (green/red/never)
5. **Test:** kapotte URL → status=failed met reden; goede URL → status=ok.

**Done:** ≥1 echte WP-site succesvol gekoppeld en geprobed.

---

## S3 — Audit (Crawl + Analyse)

**Doel:** voor gekoppelde site een SEO/tech audit draaien en `pages` vullen.

1. **DB migratie:** `audits` (id, tenant_id, site_connection_id, status, started_at, finished_at, summary jsonb) + index op `(tenant_id, site_connection_id)`. RLS via `is_tenant_member`.
2. **Shared:** `repos/audits.ts`, job-payload `run_audit`.
3. **Worker:**
   - `run_audit` → sitemap fetch → top N pages → Playwright render → extract title, meta, h1, status, schema, links, images zonder alt → store in `pages`.
   - Summary → `audits.summary`.
4. **Frontend:**
   - `/sites/:id/audits` list
   - `/audits/:id` rapport (issues per categorie, top fix candidates)
5. **Test:** audit op demo-WP → minstens 20 pages → 0 leaks tussen tenants.

**Done:** klant ziet bruikbaar audit-rapport binnen 5 min na koppeling.

---

## S4 — SEO Proposal Engine (geen publish)

**Doel:** uit audit fix-voorstellen genereren via LLM, opslaan, reviewbaar maken. **Schrijft niets naar WP.**

1. **DB migratie:** `fix_proposal_groups` (audit_id, theme, status), `fix_proposals` (al bestaand) uitbreiden met `group_id`, `before jsonb`, `after jsonb`, `rationale text`, `confidence numeric`.
2. **Shared:** `llm/router.ts` met providers (OpenAI/Anthropic via Lovable AI), prompt-templates per proposal-type, Zod-schema voor LLM-output.
3. **Worker:** job `generate_proposals(audit_id)` → batch per page → LLM → valideren tegen schema → opslaan met status=`draft`.
4. **Frontend:**
   - `/audits/:id/proposals` lijst, gegroepeerd
   - Per proposal: before/after diff, rationale, approve/reject
5. **Test:** 50 proposals, 0 schema-violations, alle hebben rationale.

**Done:** operator kan in batches proposals goedkeuren of afkeuren. Niets gaat naar WP.

---

## S5 — Safe Publishing Layer (approval + rollback)

**Doel:** goedgekeurde proposals daadwerkelijk publiceren naar WP, met rollback.

1. **DB migratie:** `approvals` (proposal_id, approver_user_id, decided_at, decision), `wp_write_operations` (proposal_id, status, request jsonb, response jsonb, rollback_payload jsonb, applied_at, rolled_back_at).
2. **Shared:** `repos/publishing.ts`, job-payload `apply_proposal` en `rollback_proposal`.
3. **Worker:**
   - `apply_proposal` → fetch huidige WP-state → store als `rollback_payload` → PATCH via REST → status=applied.
   - `rollback_proposal` → PATCH met `rollback_payload`.
4. **Frontend:**
   - Bulk-approve UI met dry-run preview
   - Per applied proposal: rollback-knop
5. **Test:** apply + rollback op staging-WP, content matcht 100%.

**Done = MVP klaar.** Diagnostic Pilot €1.500 kan starten.

---

## S6 — Lead Capture

**Doel:** leads van WP-form / chat / call-tracking inkomen, dedupliceren, tonen.

1. **DB migratie:** `leads` uitbreiden (source enum, raw_event_id fk), `raw_events` (al bestaand) — bron, payload jsonb, received_at, tenant_id.
2. **Shared:** `repos/leads.ts`, ingestion-schema per bron.
3. **Worker / Edge:** publieke edge function `ingest-lead` (tenant via API key per site), normaliseer → leads + raw_events.
4. **Frontend:**
   - `/leads` inbox, filter op source/status
   - Detail-view met raw payload
5. **Test:** 3 sources → leads correct toegewezen aan juiste tenant, geen cross-tenant.

**Done:** klant ziet leads binnen 10s na submit.

---

## S7 — Google Reviews (only)

**Doel:** Google reviews ophalen + tonen + alert bij nieuwe/negatieve.

1. **DB migratie:** `review_sources` (tenant_id, provider='google', place_id, status), `reviews` (source_id, external_id unique, rating, text, author, posted_at).
2. **Shared:** `repos/reviews.ts`, job `sync_google_reviews`.
3. **Worker:** Google Places/Business API poll (cron via pg-boss), upsert.
4. **Frontend:** `/reviews` lijst, sterren-filter, alert-badge bij rating<=3.
5. **Test:** sync → reviews zichtbaar; tweede sync → geen duplicates.

**Done:** klant ziet alle Google reviews in dashboard.

---

## S8 — Reporting & Billing

**Doel:** maandrapport per tenant + Stripe subscription.

1. **DB migratie:** `reports` (tenant_id, period, generated_at, payload jsonb, pdf_url), `subscriptions` (tenant_id, stripe_customer_id, plan, status).
2. **Shared:** `repos/reports.ts`, `repos/billing.ts`.
3. **Worker:** cron `generate_monthly_report` → aggregeer audits/proposals/leads/reviews → PDF (Playwright print) → upload naar Storage.
4. **Frontend:** `/reports` history + download, `/billing` Stripe portal-link.
5. **Test:** rapport generen voor demo-tenant, Stripe test-checkout end-to-end.

**Done:** product is commercieel: klanten betalen, krijgen rapport.

---

## Algemene werkregels per sprint

- **Eén PR per laag** (db / shared / worker / frontend / tests). Niet alles in één mega-commit.
- **RLS-isolatietest is verplicht** bij elke nieuwe tabel — anders merge weigeren.
- **Geen TODO's in productiecode** zonder ticket-ID.
- **LLM-output altijd via Zod**. Geen `as any` op LLM-responses.
- **WP-writes altijd via `wp_write_operations`** met rollback_payload — nooit direct.
- **Secrets nooit in jobs-payload**. Alleen `site_connection_id`, worker decrypt zelf.

---

## Antwoord op je vraag

**Eerst backend of frontend?** Per sprint backend-first, maar dunne plakjes. Niet alle backend van alle sprints achter elkaar — dan bouw je 4 weken zonder iets te zien werken. Per sprint: migratie → shared → worker → UI → test, en dan pas door. Zo heb je elke sprint iets demobaars.

**Volgorde van sprints:** S0 → S1 → S2 → S3 → S4 → S5 = MVP. Pas daarna S6 / S7 / S8 op basis van wat pilots vragen.
