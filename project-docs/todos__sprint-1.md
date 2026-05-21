# Sprint 1 — Onboarding & Connectivity

**Doel:** een nieuwe operator kan inloggen, een tenant aanmaken, zijn WordPress-site koppelen, en GSC + GA4 autoriseren — alles eindigt in `onboarding_sessions.status = 'connected'`.

**Flow:** `diagrams/flow-s1-onboarding.mmd`

---

## Todo's

### Database
- [ ] Migratie `0004_s1_indexes.sql` — indexes op `site_connections(tenant_id, type)`, `onboarding_sessions(user_id)`.

### Server functions
- [ ] `tenants.createTenant({ name, geo, vertical })` → maakt tenant + owner-membership + onboarding_session.
- [ ] `siteConnections.startWpConnect({ tenantId, siteUrl })` → returnt app-password instructies + `connection_id`.
- [ ] `siteConnections.verifyWpConnect({ connectionId, username, appPassword })` → WP REST probe (`/wp-json/wp/v2/users/me`), encrypt via vault, set `status='connected'`.
- [ ] `siteConnections.startOAuth({ tenantId, provider })` → returnt Google OAuth redirect URL (scopes per provider).
- [ ] `onboarding.complete({ tenantId })` → flip status.

### Public routes
- [ ] `/api/public/oauth/google/callback` — verifieer `state`, exchange code, store refresh_token in vault.

### UI
- [ ] `/app/onboarding` wizard — 4 stappen: Tenant → WordPress → GSC → GA4. Stepper-component.
- [ ] Gate `/app` — geen tenant of niet 'connected' → redirect `/app/onboarding`.

### Locale
- [ ] NL/EN copy voor alle wizard-stappen in `src/lib/shared/locale/onboarding.ts`.

### Tests (handmatige acceptance)
- [ ] Twee users → twee tenants → kunnen elkaars data niet zien (RLS).
- [ ] WP-probe faalt netjes bij verkeerd app-password (geen secret leak in error).
- [ ] OAuth callback rejecteert verkeerde `state`.

---

## Acceptance

- [ ] Nieuwe user → wizard volledig doorlopen → landt op `/app` met "Connected" badge per provider.
- [ ] `tenant_secrets` bevat 1 WP-cred + 2 OAuth refresh tokens, encrypted.
- [ ] `secret_audit_log` heeft rijen voor élke secret-read.
