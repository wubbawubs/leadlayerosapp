
# LeadLayer S0 — Foundation

Doel: complete backend-foundation conform `leadlayer-plan-v3.md` op deze nieuwe Lovable workspace, plus minimale auth-UI met de bestaande LeadLayer brand-tokens (deep navy + oranje accent, italic display). Geen marketing-site, geen onboarding, geen dashboard nog — die komen in S1+.

## 1. Lovable Cloud aan + secrets

- `supabase--enable` aanroepen (Cloud aanzetten = Supabase + Auth + Storage).
- `ai_gateway--create` voor `LOVABLE_API_KEY` (gebruikt door LLMRouter ipv directe OpenAI/Anthropic-keys in MVP — voldoet aan plan zonder vendor lock).
- `secrets--add_secret` voor: `ENCRYPTION_KEY` (32-byte base64, voor AES-GCM tenant_secrets), `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `RESEND_API_KEY`. OpenAI/Anthropic-keys laten we voor later; LLMRouter pakt eerst Lovable AI Gateway.
- Auth-config: Email/Password + Google (via Lovable broker) aanzetten, auto-confirm uit, HIBP password check aan.

## 2. Database migraties (3 files, exact uit plan-v3 Contract 1)

- `0001_init.sql` — extensions (`pgcrypto`, `vector`, `pg_cron`), alle enums (`app_role`, `geo_code`, `vertical_code`, `lead_status`, `issue_severity`, `action_type`, `approval_state`, `workflow_state`, `onboarding_status`, `connection_type`, `connection_status`, `change_status`) en alle tabellen:
  - Tenancy: `profiles`, `tenants`, `memberships` (PK = `(user_id, tenant_id)`).
  - Onboarding: `onboarding_sessions`.
  - Connectivity: `site_connections`.
  - Secrets vault: `tenant_secrets`, `secret_audit_log`.
  - Strategy: `master_plans`, `monthly_plans`.
  - Content: `pages`, `page_snapshots`, `change_groups`, `changes`, `wp_write_operations`.
  - Audits: `scans`, `issues`, `health_scores`.
  - Leads: `raw_events`, `leads`, `lead_events`.
  - Jobs spiegel: `workflow_runs`.
  - Triggers: `protect_last_owner` (tenant houdt minstens 1 owner), `handle_new_user` (auto-create `profiles` rij bij signup), `updated_at` triggers waar relevant.
- `0002_rls_policies.sql` — RLS aan op alle tabellen, expliciete policies per tabel. `SECURITY DEFINER` helpers: `is_tenant_member(tenant_id)`, `has_tenant_role(tenant_id, role)`, `has_tenant_min_role(tenant_id, role)`. `raw_events` / `workflow_runs` / `wp_write_operations` / `secret_audit_log` zijn read-only voor `authenticated`; alleen service-role schrijft.
- `0003_seed_dev.sql` — leeg / klein dev-seed (geen prod data).

## 3. Shared libs (`src/lib/shared/`)

Plat in deze repo conform handover §6 (geen pnpm-workspaces in Lovable):

- `secrets/crypto.ts` — `encrypt(value)` / `decrypt(value, version)` met AES-256-GCM via Node `crypto.createCipheriv`. Output: base64(iv ‖ authTag ‖ ciphertext). Server-only file (`crypto.server.ts`).
- `secrets/vault.functions.ts` — `setTenantSecret`, `getTenantSecret` als `createServerFn` + `requireSupabaseAuth`, schrijft `tenant_secrets` + `secret_audit_log`.
- `db/repos/` — repository-pattern per entiteit (`tenants.repo.ts`, `memberships.repo.ts`, `siteConnections.repo.ts`, etc.). Élke query filtert expliciet op `tenant_id`; type-safe wrappers boven supabase client. Onder de hood gebruikt elke repo de `requireSupabaseAuth`-supabase-client uit context (RLS-laag is backstop).
- `jobs/schemas.ts` — Zod schemas voor élke job-payload (`ProbeSitePayload`, `BaselineSnapshotPayload`, `AuditPayload`, etc.) + helper `assertTenantPayload()` die `tenantId` afdwingt. Wordt later gedeeld met externe worker.
- `llm/router.ts` — `LLMRouter` met `complete({ task, prompt })` interface. MVP-implementatie: Lovable AI Gateway via `LOVABLE_API_KEY` (Claude Sonnet als default). Retry + fallback skeleton + cost-logging stub. Pluggable backends voor later (OpenAI/Anthropic direct).
- `locale/` — `LocaleContext` + helpers (`nl-NL` default, `en-US` switch). Server-side helper voor LLM prompt-locale.

## 4. Auth UI (minimaal)

Doel: kunnen inloggen om straks in S1 onboarding te starten. Geen marketing-pagina.

- `src/routes/index.tsx` — minimale landing met LeadLayer-merknaam, oranje primary CTA "Sign in", korte tagline "Lead infrastructure for service businesses". Geen volledige marketing-site (komt in latere ronde / aparte route).
- `src/routes/login.tsx` — Email/password + "Continue with Google" (Lovable broker).
- `src/routes/signup.tsx` — Email/password + Google. `emailRedirectTo: window.location.origin`.
- `src/routes/reset-password.tsx` — verplichte recovery-pagina (`supabase.auth.updateUser({ password })`).
- `src/routes/_authenticated.tsx` — pathless layout met `beforeLoad` gate (`supabase.auth.getUser()` → redirect `/login`). Bevat `<Outlet />`.
- `src/routes/_authenticated/app.tsx` — placeholder "Foundation ready. S1 onboarding next." + sign-out knop. Bewijst dat auth-keten end-to-end werkt.
- `src/hooks/use-auth.ts` — `onAuthStateChange` listener wired in `__root.tsx` met `router.invalidate()` + `queryClient.invalidateQueries()`.

## 5. Auth-bearer + server-fn plumbing

- `src/start.ts` — registreer `attachSupabaseAuth` in `functionMiddleware` (zonder bestaande `requestMiddleware: [errorMiddleware]` te overschrijven).
- Verifieer dat `src/integrations/supabase/{client,client.server,auth-middleware,auth-attacher}.ts` aanwezig zijn (worden door Cloud-enable gegenereerd).

## 6. Design tokens (match leadlayer.lovable.app)

In `src/styles.css` semantische tokens overschrijven met de bestaande brand:

- `--background` deep navy (oklch ≈ 0.18 0.09 265).
- `--foreground` near-white.
- `--primary` LeadLayer-oranje (oklch ≈ 0.72 0.19 50), `--primary-foreground` near-white.
- `--accent` zelfde oranje, subtieler.
- `--card` iets lichter navy laag (0.22 0.08 265).
- `--border` semi-transparant wit op navy.
- Custom: `--font-display` (italic condensed, vergelijkbaar look met de "YOU'RE LEAKING LEADS" headline — kandidaat: `"Anton"` of `"Bebas Neue"` italic via Google Fonts), `--font-body` Inter-vervanger zoals `"Plus Jakarta Sans"`.
- Subtle blueprint grid background utility voor hero (radial-/linear-gradient).

Geen Marketing-content overnemen — alleen brand-shell zodat auth-flow er al als LeadLayer uitziet.

## 7. Worker-laag (bewust skipped)

Conform jouw keuze: geen worker in Lovable. Wel:
- `jobs/schemas.ts` ligt klaar (gedeeld contract).
- `workflow_runs` tabel ligt klaar (UI-spiegel).
- Geen `enqueue()` implementatie in deze workspace; komt in aparte repo met `pg-boss`.
- Playwright / WP-probe stub-functies krijgen `// TODO: move to worker` comment, geen edge-implementatie.

## 8. Acceptance criteria (S0 done)

- [ ] Cloud actief, alle 3 migraties toegepast, alle tabellen + RLS zichtbaar.
- [ ] `ENCRYPTION_KEY` + Lovable AI Gateway secrets gezet.
- [ ] Auth werkt: email/password signup + login + Google, signup maakt `profiles`-rij via trigger.
- [ ] `/reset-password` route bestaat en doet `updateUser({ password })`.
- [ ] `_authenticated` gate werkt; ongeauthenticeerde user op `/app` → `/login`.
- [ ] Crypto round-trip: server-fn `setTenantSecret` → `getTenantSecret` levert origineel terug; audit-log rij geschreven.
- [ ] LLMRouter responsief: dummy server-fn die `router.complete({ prompt: "ping" })` doet returnt tekst via Lovable AI Gateway.
- [ ] Repository-laag voorbeeld: `tenants.repo.list()` returneert alleen rijen van tenants waar de user member is (handmatige test met 2 accounts).
- [ ] Brand: navy + oranje + italic display zichtbaar op `/`, `/login`, `/app`.

## 9. Wat NIET in deze ronde

- Marketing/landing van leadlayer.lovable.app (Services/Method/Pricing/Results/About) — later ronde of buiten S0.
- Onboarding wizard, WP probe, tenant-create flow (= S1).
- Audit, leads, proposals, publish (= S2–S5).
- Externe Node worker / pg-boss / Playwright (= jouw aparte repo).

---

## Technische details (voor reviewers)

- TanStack Start v1, file-based routing in `src/routes/`. Geen `src/pages/`.
- Alle server-side Supabase access via `createServerFn` + `requireSupabaseAuth`; `supabaseAdmin` alleen in `*.server.ts` voor crypto/vault-writes naar `secret_audit_log` (service-role-only tabel).
- `crypto.server.ts` gebruikt Node `crypto` (volledig supported in Worker met `nodejs_compat`).
- LLMRouter eerste implementatie target Lovable AI Gateway (gateway endpoint via `LOVABLE_API_KEY`); `task → model` mapping is een lookup map (`default → claude-sonnet-4`, `cheap → claude-haiku`, etc.) zodat S4 prompts straks alleen `task` hoeven door te geven.
- Repository-pattern: elke functie krijgt `supabase`-client uit `requireSupabaseAuth` context; geen module-level supabase imports.
- `protect_last_owner` als BEFORE DELETE/UPDATE trigger op `memberships` met `RAISE EXCEPTION` als laatste owner weg zou vallen.
- RLS-helpers als `SECURITY DEFINER STABLE` met `SET search_path = public` (geen recursie).
- `wp_write_operations`, `raw_events`, `workflow_runs`, `secret_audit_log`, `page_snapshots` policies: `SELECT` voor members van tenant; `INSERT/UPDATE/DELETE` alleen via service-role.
