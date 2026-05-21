# Sprint 1 — Onboarding & Tenant Setup

## A. Eerst: sprint-docs syncen met je upload

Je nieuwe `leadlayer-sprints.md` is het canonieke plan. Ik vervang de bestaande sprint-files 1:1 met jouw inhoud.

- `project-docs/sprints__overview.md` — kop, volgorde-advies, algemene werkregels (uit jouw doc § "Volgorde-advies" + "Algemene werkregels")
- `project-docs/todos__sprint-0.md` t/m `sprint-8.md` — per-sprint blokken uit jouw doc, 1:1 overgenomen (S0 = done-overview, S6/S7/S8 nu ook expliciet)
- `project-docs/masterplan.md` — sprint-tabel uitbreiden naar S0-S8, status-kolom bijwerken (S0 ✅, S1 ⏳, S6-S8 nieuw 🟦)
- Oude `project-docs/todos__sprint-1..6.md` (van vorige ronde) worden overschreven met de S0-S8 versie

Geen schema-fix nodig: `tenants`, `memberships`, `onboarding_sessions` zitten al in S0-migratie en matchen jouw S1-spec ("geen nieuwe tabellen").

## B. Sprint 1 — 5-stappen ladder

Doel: nieuwe user → signup (al klaar) → `/onboarding/welcome` → `business` → `site` → `done` → `/app` met 1 tenant + owner-membership. Onder 2 min.

WP-probe blijft **expliciet uit S1** (= S2 per jouw doc). Site-URL wordt in S1 alleen op `onboarding_sessions.site_url` geparkeerd.

### Stap 1 — DB
Geen nieuwe migratie. Wel kleine RLS-verificatie:
- bevestigen dat `onboarding_sessions` policy "onboarding self all" upsert toelaat voor `auth.uid()`
- bevestigen dat `memberships owner manage` insert toelaat als de inserter zelf owner wordt (chicken-en-ei → owner-bootstrap via `SECURITY DEFINER` server-function, zie stap 3)

### Stap 2 — Shared contracten (`src/lib/shared/`)
- `db/repos/onboarding.functions.ts` — `getActiveSession()`, `upsertStep({ step, payload })`, `markCompleted({ tenantId })`
- `db/repos/tenants.functions.ts` (bestaat al, uitbreiden) — `createTenantWithOwner({ name, geo, vertical })` via `SECURITY DEFINER` SQL-function `create_tenant_with_owner(p_name, p_geo, p_vertical)` zodat membership-insert atomic gebeurt en RLS-deadlock omzeilt
- `locale/onboarding.ts` — NL/EN copy voor alle 4 stappen
- Zod-schemas voor `BusinessStepInput` (name, geo, vertical) en `SiteStepInput` (site_url) in `db/repos/onboarding.schemas.ts`

### Stap 3 — Worker / Edge
Niet van toepassing in S1. SQL-function `create_tenant_with_owner` (= "edge function create-tenant" uit je doc, maar als Postgres-function omdat we op TanStack ServerFn zitten — geen Supabase Edge Functions per stack-regel) doet de transactie:

```sql
create function public.create_tenant_with_owner(p_name text, p_geo geo_code, p_vertical vertical_code)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_tenant_id uuid;
begin
  insert into tenants(name, geo, vertical) values (p_name, p_geo, p_vertical) returning id into v_tenant_id;
  insert into memberships(user_id, tenant_id, role) values (auth.uid(), v_tenant_id, 'owner');
  return v_tenant_id;
end $$;
revoke execute on function public.create_tenant_with_owner from public;
grant execute on function public.create_tenant_with_owner to authenticated;
```

Migratie-file: `0005_s1_create_tenant_fn.sql`.

### Stap 4 — Frontend
Routes (TanStack file-based, geen Next-style folders):
- `src/routes/_authenticated/onboarding.tsx` — pathless layout met `<Outlet />` + stepper-header
- `src/routes/_authenticated/onboarding.welcome.tsx` — intro + "Start"
- `src/routes/_authenticated/onboarding.business.tsx` — form: name + geo (NL/BE/DE/UK) + vertical (uit `vertical_code` enum). Submit → upsertStep.
- `src/routes/_authenticated/onboarding.site.tsx` — form: site_url. Submit → upsertStep + `createTenantWithOwner` met velden uit business-step. Geen WP-probe.
- `src/routes/_authenticated/onboarding.done.tsx` — confirmatie + "Open dashboard" → `/app`
- `src/routes/_authenticated.tsx` — `beforeLoad` uitbreiden: heeft user 0 tenants OR active onboarding niet completed → redirect `/onboarding/welcome` (tenzij user al op `/onboarding/*` is)
- `src/routes/_authenticated/app.tsx` — tenant-switcher in header (dropdown over `listMyTenants`), placeholder dashboard blijft

Bewust géén tenant-switcher als losse component nu — gewoon inline dropdown. Refactor naar `<TenantSwitcher />` zodra we 2e tenant-aware route bouwen (= S2).

### Stap 5 — Test (handmatige acceptance, geen CI nog)
- 2 testaccounts (A en B) doorlopen onboarding met verschillende tenant-naam
- A queryt via `listMyTenants` → ziet enkel eigen tenant
- B kan tenant van A niet selecteren in switcher
- Direct call met B's JWT naar `create_tenant_with_owner(...)` slaagt; daarna SELECT op A's tenant returnt 0 rijen
- Gebroken business-form (geen vertical) → Zod-error, geen DB-call

## C. Done-criterium (jouw doc, letterlijk)

> Nieuwe user kan in <2 min van signup naar lege dashboard.

Plus: `memberships.role = 'owner'`, `onboarding_sessions.status = 'completed'`, tenant zichtbaar in switcher.

## D. Bewust uit S1 (= S2 of later)

- WordPress REST probe + credentials encryptie
- `site_connections` rij maken (gebeurt in S2 op basis van `onboarding_sessions.site_url`)
- Tenant-rename / delete UI
- Invite-flow voor extra members (S6 polish)

## E. Bestanden die deze sprint raken

```
project-docs/                          (overschrijven met jouw upload-content)
supabase/migrations/0005_s1_create_tenant_fn.sql   (nieuw)
src/lib/shared/db/repos/tenants.functions.ts        (uitbreiden)
src/lib/shared/db/repos/onboarding.functions.ts     (nieuw)
src/lib/shared/db/repos/onboarding.schemas.ts       (nieuw)
src/lib/shared/locale/onboarding.ts                 (nieuw)
src/routes/_authenticated.tsx                       (gate uitbreiden)
src/routes/_authenticated/onboarding.tsx            (nieuw, layout)
src/routes/_authenticated/onboarding.welcome.tsx    (nieuw)
src/routes/_authenticated/onboarding.business.tsx   (nieuw)
src/routes/_authenticated/onboarding.site.tsx       (nieuw)
src/routes/_authenticated/onboarding.done.tsx       (nieuw)
src/routes/_authenticated/app.tsx                   (switcher inline)
```

Klaar om te implementeren — geef seintje en ik start met de doc-sync + migratie, dan ServerFns, dan UI.
