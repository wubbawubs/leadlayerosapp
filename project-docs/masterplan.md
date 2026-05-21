# LeadLayer OS — Masterplan

> Single source of truth voor scope, volgorde en architectuur van het hele platform.
> Per-sprint todo's staan in losse files: `project-docs/todos__sprint-*.md`.
> Diagrammen staan in `diagrams/`.

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

| Sprint | Naam | Status | Todo file |
|--------|------|--------|-----------|
| S0 | Foundation | ✅ done | `.lovable/plan.md` |
| S1 | Onboarding & Connectivity | ⏳ next | `project-docs/todos__sprint-1.md` |
| S2 | Audit & Health | 🟦 todo | `project-docs/todos__sprint-2.md` |
| S3 | Strategy & Master Plan | 🟦 todo | `project-docs/todos__sprint-3.md` |
| S4 | Content & Publish | 🟦 todo | `project-docs/todos__sprint-4.md` |
| S5 | Leads & Reporting | 🟦 todo | `project-docs/todos__sprint-5.md` |
| S6 | Polish & GA | 🟦 todo | `project-docs/todos__sprint-6.md` |

Elke sprint heeft:
- Doel (één zin)
- Flow-diagram in `diagrams/flow-s{N}-*.mmd`
- Concrete todo's met checkboxes
- Acceptance criteria

---

## 3. Cross-cutting principes (altijd geldend)

- **Security**: nooit een ServerFn zonder `requireSupabaseAuth` (behalve `/api/public/*` met HMAC).
- **Tenancy**: élke query filtert expliciet op `tenant_id`; RLS is backstop, niet enige laag.
- **Locale**: alle user-facing strings via `locale/`; LLM-prompts krijgen `locale` mee.
- **Brand**: alleen semantische tokens; geen hex in components.
- **AI**: default route via Lovable AI Gateway; geen vendor keys in MVP.
- **Observability**: élke ServerFn logt `tenantId` + `userId` + `duration` (geen PII).

---

## 4. Documenten map

```
project-docs/
  masterplan.md              ← dit bestand
  todos__sprint-1.md … 6.md  ← per-sprint todo's + acceptance
  architecture__*.md         ← architectuur-deep-dives
  structure__*.md            ← IA / wireframes
  decisions/                 ← ADR's (één file per keuze)

diagrams/
  db-erd.mmd                 ← entity relationship
  flow-s{N}-*.mmd            ← per sprint user/system flow
```
