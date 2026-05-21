# Tone Profile V1 — Linguistic Brand Model

## Doel

Geen plat `tone_summary` veld meer. Een gestructureerd, gelaagd taalprofiel per tenant dat proposals **stuurt én blokkeert**. Vervangt de huidige `brand_voice_profiles` als bron van waarheid voor alle proposal-output.

## Scope V1 (wat we nu bouwen)

Wel:
- 3 nieuwe tabellen: `tone_profiles`, `tone_profile_samples`, `tone_feedback_examples`
- Analyzer die 5–8 site samples scoort op kwaliteit en alleen goede zwaar meeweegt
- Volledig JSON-schema (10 lagen: voiceIdentity, sentenceArchitecture, vocabulary, claimStyle, ctaStyle, trustStyle, audienceAdaptation, localeTone, examples, scoringWeights)
- Operator UI op `/settings/tone-profile` — geen JSON dump, mooie secties met edit/lock per veld
- "Test output" knop in UI: genereer voorbeeld-meta/H1/CTA met huidige profiel + scores tonen
- Prompt-context builder die het profiel comprimeert naar wat de LLM nodig heeft
- Output-evaluator: elke proposal krijgt `toneScore { voiceFit, vocabularyFit, sentenceRhythmFit, claimSafety, ctaFit, localeFit, genericnessRisk }`
- Blocking gate in generator:
  - geen profile → status `needs_context`
  - verboden claim/woord → `rejected`
  - genericnessRisk > drempel → `regenerate` (max 1x)
  - toneFitScore < 8 → `needs_review`, niet `draft`
- Feedback capture: approve/reject/edit op proposals schrijft naar `tone_feedback_examples`

Niet nu (V2+):
- Tone embeddings / retrieval van approved content
- Fine-tune dataset export
- Tone drift detection bij her-crawl
- Vertical presets
- Audience adaptation als losse switch per proposal (schema is er, gebruik volgt)

## Architectuur

```text
audit pages  ─┐
              ├─► sample scorer ─► weighted samples ─► LLM analyzer ─► tone_profiles.profile (JSONB)
manual paste ─┘                                                                │
                                                                               ▼
operator UI (edit/lock per veld) ──────────────────────────────────────► tone_profiles (status: draft|approved|locked)
                                                                               │
                                                                               ▼
proposal generator ──► context builder ──► LLM ──► output evaluator ──► toneScore + verdict
                                                                               │
                                              approve/reject/edit ─────────────┴──► tone_feedback_examples
```

## Database

### `tone_profiles`
- `tenant_id`, `language`, `locale`
- `status`: `draft | approved | locked`
- `profile jsonb` — volgens schema hieronder
- `confidence_score numeric`
- `source_summary jsonb` — { sample_count, avg_quality, sources }
- `analyzed_at`, `job_status`, `job_error`
- RLS: member select, operator write (zelfde pattern als bestaande tabellen)

### `tone_profile_samples`
- `tenant_id`, `tone_profile_id`
- `source_type`: `homepage | service | blog | about | contact | manual_paste | approved_proposal`
- `source_url`, `text`
- `quality_score numeric` (0–10), `weight numeric default 1`
- `analysis jsonb` — losse metingen (zinslengte, passieve vorm %, etc.)

### `tone_feedback_examples`
- `tenant_id`, `tone_profile_id`
- `example_type`: `approved | rejected | edited | manual_good | manual_bad`
- `before_text`, `after_text`, `reason`
- `proposal_id uuid` (nullable)

### Migratie van bestaande `brand_voice_profiles`
- Blijft staan, wordt **gedeprecateerd** in V1. Generator leest alleen nog `tone_profiles`.
- Geen data-migratie nodig — V0 brand voice was testdata. Operator klikt 1x "Analyze" op nieuwe pagina.

## Tone Profile JSON-schema

Exact zoals jij beschreef, met Zod-validatie:

```json
{
  "voiceIdentity": { "summary", "persona", "emotionalRegister", "authorityStyle", "commercialIntensity" },
  "sentenceArchitecture": { "averageSentenceLength", "paragraphLength", "preferredStructure", "usesQuestions", "passiveVoicePolicy", "rhythm" },
  "vocabulary": { "preferred[]", "avoid[]", "forbidden[]", "replacements{}", "technicalTermsPolicy" },
  "claimStyle": { "allowedClaims[]", "riskyClaims[]", "forbiddenClaims[]", "safeClaimPatterns[]", "evidenceRequiredFor[]" },
  "ctaStyle": { "primaryCtaPatterns[]", "secondaryCtaPatterns[]", "style", "avoid[]" },
  "trustStyle": { "primaryTrustDrivers[]", "proofTypes[]", "trustLanguage", "avoid[]" },
  "audienceAdaptation": {},
  "localeTone": { "locale", "salesIntensity", "culturalNotes[]", "spelling", "formality" },
  "examples": { "good[]", "bad[]", "rewritePatterns[]" },
  "scoringWeights": { ... default weights }
}
```

## Server-side flow

1. **`analyzeToneProfile(tenantId)`** serverFn
   - Pakt laatste succesvolle audit, selecteert tot 8 pagina's (homepage + 3 service + 2 blog + about + contact)
   - Per sample: LLM-call `scoreSampleQuality` → `{ quality, isCommercial, isGeneric }` (cheap model)
   - Filter samples met quality < 5
   - LLM-call `extractToneProfile` met overgebleven samples (gemini-2.5-pro voor diepte)
   - Zod-valideer, schrijf naar `tone_profiles`, status = `draft`
   - Sla samples op in `tone_profile_samples`

2. **`testToneOutput(tenantId, kind)`** serverFn — UI knop
   - kind: `meta | h1 | cta`
   - Genereer 1 voorbeeld + evaluator-scores, return inline (niet opslaan)

3. **`generator.server.ts` (bestaand)** — uitbreiden
   - Vervang `getProposalContext` brand voice deel door `tone_profiles.profile`
   - Inject compressed profile + 3 good + 3 bad examples in prompt
   - Na LLM-output: roep `evaluateToneOutput(text, profile)` aan
   - Bepaal verdict + status volgens blocking gate hierboven

4. **`evaluateToneOutput(text, profile)`** — server-only
   - Deterministische checks (verboden woorden regex, gemiddelde zinslengte)
   - LLM-call voor `voiceFit`, `genericnessRisk` (cheap model, strict JSON)
   - Schrijft naar bestaande `proposal_quality_checks` (al aanwezig sinds S4.5)

5. **Feedback capture** — uitbreiden bestaande approve/reject endpoints
   - approve → insert in `tone_feedback_examples` (type `approved`)
   - reject met reden → type `rejected`
   - edit (nieuwe actie) → type `edited`, before+after

## UI

Route: `/settings/tone-profile`

Secties (collapsible, geen JSON-dump):
1. **Samenvatting** — voiceIdentity + confidence badge + status pill + "Analyze from website" knop
2. **Schrijfstijl** — sentenceArchitecture, edit per veld
3. **Woorden** — 4 tag-inputs (preferred / avoid / forbidden / replacements)
4. **Claims** — 3 lijsten + safe patterns
5. **CTA's** — patterns + voorbeelden
6. **Trust** — drivers + proof types
7. **Voorbeelden** — good / bad / rewrite patterns (toevoegen/verwijderen)
8. **Test output** — 3 knoppen, toont gegenereerde tekst + score-bars
9. **Feedback log** — laatste 20 approved/rejected examples readonly

Per veld: lock-toggle (locked → analyzer overschrijft niet meer).

Status-pill bovenaan: `draft` (grijs) / `approved` (groen) / `locked` (blauw).

## Acceptance criteria

V1 is klaar als:
- Analyzer levert geldig profiel op echte audit-data (handmatig getest op 1 NL site)
- Operator kan elk veld editten en locken
- "Approve" knop zet status op `approved`
- Proposal generator gebruikt het profiel — bewijs: prompt-snapshot in logs bevat profile-block
- Elke proposal heeft `toneScore` in `proposal_quality_checks`
- Verboden woord in output → proposal status `rejected`, zichtbaar in UI
- Geen profile → nieuwe proposals krijgen status `needs_context` (nieuwe enum-waarde)
- Approve/reject schrijft naar `tone_feedback_examples`

## Wat we expliciet NIET doen in V1

- Geen embeddings / vector search
- Geen audience-switch per proposal (schema staat, UI komt in V2)
- Geen tone drift detection
- Geen vertical presets
- Geen auto-regenerate loop voorbij 1 retry
- Geen fine-tune export

## Volgorde van uitvoeren

1. Migratie: 3 nieuwe tabellen + nieuwe enum-waarde `needs_context` op `proposal_status`
2. Zod-schemas + repos
3. Sample scorer + analyzer serverFn
4. Operator UI (read-only eerst, dan edit per sectie)
5. Generator integratie + evaluator + blocking gate
6. Feedback capture op approve/reject/edit
7. End-to-end test op echte audit

Geschat: 1 sprint. Geen S5 erbij. Pas naar S5 als tone scores consistent ≥8 zitten op echte data.
