## Beslissing

S5 (WordPress publishing) **niet** nu bouwen. Eerst S4 afronden als infrastructuur, daarna S4.5 Context Layer zodat proposals niet generiek zijn maar passen bij merk, aanbod, doelgroep en pagina-intentie.

## Volgorde

```text
S4a Proposal Infrastructure (afronden)
  └─> S4.5 Context Layer (nieuw)
        └─> S4c Context-Aware Proposals (prompt rewrite + quality gate)
              └─> S5 Safe Publishing
```

---

## Stap 1 — S4a afronden (geen nieuwe features, alleen verifiëren)

End-to-end test van bestaande generate-flow:
- Generate-knop werkt op echte audit
- Proposals landen in DB (sequentieel per pagina, geen timeout)
- UI toont groepen per pagina, filters werken
- Approve/reject/regenerate werken
- Geen duplicates bij opnieuw klikken
- Failures per pagina zichtbaar

Output wordt behandeld als **testdata**, niet als publicatiekwaliteit.

---

## Stap 2 — S4.5 Context Layer

### 2.1 Database (migratie)

Vier nieuwe tabellen, allemaal `tenant_id` + RLS conform bestaand patroon (`is_tenant_member` voor select, `has_tenant_min_role('operator')` voor write):

- **business_profiles** — `business_name, industry, vertical, geo, primary_offer, secondary_offers jsonb, target_audience jsonb, service_areas jsonb, unique_value_proposition, main_promise, proof_points jsonb, avoid_claims jsonb, preferred_cta, tone_preference`
- **brand_voice_profiles** — `tone_summary, writing_style jsonb, preferred_words jsonb, forbidden_words jsonb, example_phrases jsonb, reading_level, language, source_urls jsonb, analyzed_at`
- **page_intelligence** — `page_id, page_type, intent, commercial_priority, target_keyword, target_audience, desired_action, funnel_stage, summary`
- **proposal_quality_checks** — `proposal_id, brand_fit_score, seo_fit_score, commercial_fit_score, clarity_score, risk_flags jsonb, quality_score, verdict, publishable`

Enums: `page_type`, `page_intent`, `commercial_priority`, `quality_verdict`.
Triggers: `set_updated_at` waar relevant.

### 2.2 Repos + Zod schemas

In `src/lib/shared/db/repos/`:
- `business-profiles.functions.ts` (get/upsert via `createServerFn` + `requireSupabaseAuth`)
- `brand-voice-profiles.functions.ts`
- `page-intelligence.functions.ts`
- `proposal-quality-checks.functions.ts`

Insert/update/select Zod-schemas met lengte- en regex-validatie.

### 2.3 UI — Business Profile

Route: `/_authenticated/settings/business-profile.tsx`

Formulier met velden hierboven, empty-state als geen profiel bestaat, save/load via serverFn. Toast bij opslaan. Bestaande shadcn-componenten + design tokens.

### 2.4 Brand Voice Analyzer

- Knop "Analyze brand voice from website" op de business profile pagina
- ServerFn `analyzeBrandVoice`: haalt homepage + max 5 belangrijke pagina's (hergebruik bestaande crawler in `src/lib/shared/audit/`), stuurt naar Lovable AI (`google/gemini-2.5-flash`) met strict Zod-output: `tone_summary, preferred_words, forbidden_words, example_phrases, reading_level`
- Schrijft naar `brand_voice_profiles`
- Job status zichtbaar in UI (queued / running / done / failed) — **geen mock data**

### 2.5 Page Intelligence

- ServerFn `classifyAuditPages(auditId)`: voor elke `audit_page` één LLM call, Zod-gevalideerde output `{ pageType, intent, commercialPriority, summary, targetKeyword, desiredAction }`
- Sequentieel, zelfde pattern als proposal generator
- Knop "Classify pages" op audit-detail pagina
- Resultaten zichtbaar per page-row

### 2.6 Context-fetcher voor proposal engine

Nieuw bestand `src/lib/shared/proposals/context.server.ts`:
```ts
getProposalContext(tenantId, pageId) => {
  businessProfile, brandVoiceProfile, pageIntelligence
}
```

Bestaande `generator.server.ts` haalt deze context op en geeft mee aan de prompt. **Prompt rewrite + quality gate komen pas in stap 3.** Voor nu: context wordt opgehaald en als optionele sectie in de bestaande prompt geïnjecteerd, met TODO-marker voor de volledige rewrite.

---

## Stap 3 (volgende sprint, niet nu) — Context-Aware prompt + Quality Gate

- Volledige prompt-rewrite met `businessProfile + brandVoice + pageIntelligence + issue + outputRules`
- LLM-output schema met `qualityScore, brandFitScore, riskFlags, publishable`
- Proposals onder drempel → status `needs_review`, niet `draft`
- UI toont scores en risk flags per proposal

## Stap 4 (daarna) — S5 Safe Publishing

Pas starten als context-aware proposals consistent ≥8/10 scoren.

---

## Scope van deze plan-uitvoering

Alleen **Stap 1 (verificatie) + Stap 2 (S4.5 Context Layer)**. Geen prompt-rewrite, geen quality gate, geen publishing. Geen mock data, RLS overal aan, geen secrets in client code.

### Technische details

- TanStack serverFns met `requireSupabaseAuth` voor alle reads/writes
- Lovable AI Gateway (`LOVABLE_API_KEY` al aanwezig) voor brand voice + page classification
- Sequentiële LLM-calls om timeouts te voorkomen, zelfde pattern als bestaande generator
- Migraties in één call, daarna code in batches
