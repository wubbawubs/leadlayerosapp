
## Waarom

De analyzer-pipeline (Stage A ~75s + Stage B ~60s + crawl + DB-writes) duurt 135–150s. De hosting-proxy kapt elke HTTP-request rond ~100s af → `504 upstream request timeout`. Trimmen = brein dommer maken. We lossen het architecturaal op met een job-pattern dat tegelijk de standaard wordt voor alle latere zware engines (Page Intelligence, Proposal V2, QA Compare, Safe Publish, Landing Page Factory).

Eén HTTP-call duurt voortaan <2s. De echte analyzer draait in een background-route die geen proxy-limiet heeft.

```text
[UI] ──startAnalyzerJob───────▶ [serverFn]   (insert job, fire-and-forget)
                                    │
                                    └── POST /api/public/run-analyzer-job (HMAC)
                                            │
                                            ├── status=running, stage=crawl
                                            ├── analyzeBusinessProfileFromWebsite()
                                            │     ├── stage=stage_a
                                            │     ├── stage=stage_b
                                            │     └── stage=persist
                                            └── status=succeeded|failed

[UI] ──getAnalyzerJob(jobId) every 2s──────▶ stage + result/error
```

## Wat we bouwen

### 1. Migration: `business_profile_analyzer_jobs`

Kolommen: `id`, `tenant_id`, `created_by`, `status` (queued|running|succeeded|failed, check-constraint), `stage` (text), `started_at`, `finished_at`, `result jsonb default '{}'`, `error_message`, `created_at`, `updated_at`.

Indexen: `(tenant_id, status, created_at desc)`, `(created_by, created_at desc)`.

RLS:
- `select`: `is_tenant_member(tenant_id)`
- `insert`: `has_tenant_min_role(tenant_id, 'operator')` met `created_by = auth.uid()`
- `update`/`delete`: geen authenticated-policy → alleen `supabaseAdmin` (service role) via de public route kan schrijven

Trigger: bestaande `set_updated_at` hergebruiken.

### 2. Secret

`secrets--add_secret` voor `ANALYZER_JOB_SECRET` (HMAC-shared-secret tussen `startAnalyzerJob` en `/api/public/run-analyzer-job`).

### 3. `startAnalyzerJob` serverFn (vervangt `analyzeBusinessProfileFromWebsiteFn`)

In `src/lib/shared/businessProfile/repo.functions.ts`:
- `requireSupabaseAuth` + `has_tenant_min_role(tenantId, 'operator')` check
- Look-up: bestaande job met `status in ('queued','running')` voor deze tenant van laatste 10 min → return die `jobId`
- Insert nieuwe row (`status='queued'`, `stage='queued'`, `created_by=userId`)
- HMAC-sign body `{ jobId, tenantId }` met `ANALYZER_JOB_SECRET` (`createHmac('sha256', ...).update(body).digest('hex')`)
- Fire-and-forget: `void fetch(SITE_URL + '/api/public/run-analyzer-job', { method:'POST', headers:{ 'x-analyzer-signature': sig }, body })` zonder `await`; korte AbortController-timeout (1s) op de outbound zodat het serverFn niet wacht
- `SITE_URL`: bouw uit `getRequestHost()` + scheme; fallback `process.env.SITE_URL`
- Return `{ jobId }`; totale duur <2s

### 4. Public server-route: `src/routes/api/public/run-analyzer-job.ts`

- POST handler
- HMAC-verify met `timingSafeEqual` → 401 bij mismatch
- Load job by `id` + `tenant_id`. Niet `queued`? → 200 "skipped"
- `supabaseAdmin` update: `status='running', started_at=now(), stage='crawl'`
- Roept `analyzeBusinessProfileFromWebsite({ tenantId, jobId, onStageChange })` aan met de bestaande pipeline volledig intact
- Op succes: `status='succeeded', finished_at=now(), result={suggestionsCreated, observedPages, overallConfidence, durationMs}`
- Op fout: `status='failed', finished_at=now(), error_message=<normalizeAnalyzerError().message>`; volledige stack `console.error`'d
- Response body is irrelevant (niemand luistert)

### 5. Minimale wijziging in `analyzer.server.ts`

- `analyzeBusinessProfileFromWebsite` input uitbreiden: `jobId?: string`, `onStageChange?: (stage: 'crawl'|'stage_a'|'stage_b'|'persist'|'done') => Promise<void>`
- `onStageChange` gecalled vóór elke stage; default `noop`
- Alle prompts, defaults, dedup, tone-normalisatie, proof-safety, locks, rejections → **0 wijzigingen**

### 6. `getAnalyzerJob` serverFn

- Input: `{ jobId }`
- `requireSupabaseAuth` + verify membership via job's `tenant_id`
- Return: `id, status, stage, result, error_message, started_at, finished_at, created_at`
- Cross-tenant gelekt → onmogelijk dankzij membership check + RLS

### 7. UI: `settings.business-profile.tsx`

- "Generate from website" knop → `startAnalyzerJob()` → `setJobId(jobId)` + `sessionStorage.setItem('bp-analyzer-job:'+tenantId, jobId)`
- `useQuery` op `['analyzer-job', jobId]` met `refetchInterval: (data) => data?.status === 'succeeded' || data?.status === 'failed' ? false : 2000`
- Stage-copy mapping:
  - `queued` → "Analyse klaarzetten…"
  - `crawl` → "Pagina's ophalen…"
  - `stage_a` → "Feiten extraheren…"
  - `stage_b` → "Strategie bepalen…"
  - `persist` → "Suggesties opslaan…"
  - `done` → "Afronden…"
- Knop disabled zolang status in `queued|running`
- `succeeded` → invalidate `['businessProfileV2']` + `['businessProfileSuggestions']`, toast ``${result.suggestionsCreated} suggesties uit ${result.observedPages} pagina's`` , clear sessionStorage
- `failed` → toon `error_message`, clear sessionStorage
- Op mount: `sessionStorage` jobId aanwezig → polling hervatten
- Stuck-detectie: `started_at` >5 min geleden en nog `running` → "Analyse lijkt vastgelopen" + retry-knop die een nieuwe `startAnalyzerJob` doet (bestaande job blijft staan, nieuwe overruled door 10-min look-up alleen als nog binnen window — anders nieuwe job)

### 8. Cleanup

- `analyzeBusinessProfileFromWebsiteFn` verwijderen uit `repo.functions.ts` (geen alias — schoon).
- Alle UI-aanroepen migreren naar `startAnalyzerJob`.

## Wat NIET in deze plan zit

- Geen BP-2.5 Completeness uitbreiding
- Geen Page Intelligence
- Geen Proposal V2
- Geen wijzigingen aan Stage A/B prompts, model-keuze of timeouts
- Geen wijzigingen aan suggestion-flow (accept/reject/lock blijven 1-op-1)

## Acceptatie

1. Klik "Generate from website" → respons <2s met `jobId`
2. Geen 504 ook al duurt analyzer 2-3 minuten
3. UI toont reële stage-copy uit DB-row
4. Suggesties verschijnen na succes; accepted/rejected/locked-gedrag ongewijzigd
5. Refresh tijdens running job → polling hervat
6. Invalid HMAC op `/api/public/run-analyzer-job` → 401
7. Andere tenant kan job niet lezen via `getAnalyzerJob`
8. Tweede klik tijdens running job → zelfde `jobId` terug (geen dubbele run)

## Volgorde van uitvoer

1. `secrets--add_secret` voor `ANALYZER_JOB_SECRET`
2. Migration `business_profile_analyzer_jobs` + RLS + indexen
3. `src/routes/api/public/run-analyzer-job.ts` (HMAC-verify + analyzer call + status-writes)
4. `analyzer.server.ts`: `jobId` + `onStageChange` toevoegen (minimaal)
5. `repo.functions.ts`: `startAnalyzerJob` + `getAnalyzerJob`, oude fn verwijderen
6. `settings.business-profile.tsx`: start+poll-pattern + stage-copy + sessionStorage-resume
7. Test op klikklaarseo-tenant: knop → job → 2-3 min draaien → suggestions zichtbaar zonder 504
