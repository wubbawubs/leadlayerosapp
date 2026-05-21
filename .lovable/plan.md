
# Tone Profile V2 — van 6.3 naar publish-ready

De huidige 6.3/10 is geen bug, het is een ontwerplimiet. We doen één LLM-call over een handvol pagina's en hopen dat het model én observeert, én abstraheert, én juridisch wikt. Dat is te veel werk voor één pass. De auditor in je rapport wijst exact dit aan: "ingewikkeld" staat fout in avoid, CTA's zijn verzonnen ipv geobserveerd, claims missen scherpte.

De fix is structureel: **evidence-first pipeline** in plaats van one-shot extractie.

---

## Wat we bouwen (V2)

### 1. Bredere & rijkere corpus
- **Sitemap-fetch** naast audit-pagina's: probeer `/sitemap.xml`, `/sitemap_index.xml` en pak tot 25 unieke pagina's met diversiteits-cap per bucket (homepage, service ×5, blog ×5, about, contact, faq, pricing, case).
- **Manual paste tab** in UI: textarea waar gebruiker eigen tekst, reviews, sales-emails, brand bible kan plakken — krijgt `source_type: manual_paste` en `weight: 1.0`.
- **Approved-proposals feedback**: bij re-analyze tellen approved proposals als hoogwaardige samples.

### 2. Multi-pass extractie (in plaats van één call)
```text
PASS 1  per-sample observatie (cheap, parallel)
  → woordfrequentie, CTA-zinnen uit <a>/<button>, claim-zinnen, voorbeeld-zinnen
PASS 2  corpus-aggregatie (deterministisch, geen LLM)
  → frequenties tellen, dedupe, top-N per dimensie, conflict-detectie
PASS 3  synthese (pro, één call)
  → voice/persona/rhythm-beschrijving op basis van bewijs uit pass 2
PASS 4  self-critique (cheap)
  → checkt: staan avoid-woorden tegelijk in de samples positief gebruikt?
            zijn forbidden-claims daadwerkelijk hype-taal?
            zijn CTA's letterlijk gevonden of verzonnen?
  → produceert per-veld confidence en flags voor menselijke review
```

Resultaat: elk woord/claim/CTA in het profiel heeft een `evidence` veld (sample-URL + letterlijke zin). Niet meer "het model dacht dat".

### 3. CTA's & claims uit HTML, niet uit LLM-fantasie
- CTA's: bij sample-fetch trekken we anchor-/button-tekst < 60 chars eruit (regex op `<a>`, `<button>`). Die lijst voeren we letterlijk aan de synthese — geen verzonnen CTA's meer.
- Claims: simpele regex op zinnen met modale verbs (`we helpen`, `we maken`, `je krijgt`, `gegarandeerd`, `bewezen`) → LLM classificeert alleen safety, verzint niet.

### 4. Confidence die ergens op slaat
Nu: `avg(quality) + samples*0.15`. Vervangen door multi-factor:
```text
confidence = weightedAvg([
  corpus_size:      saturating(words / 4000)           # genoeg tekst?
  source_diversity: distinct_buckets / 6               # genoeg page-types?
  evidence_density: fields_with_evidence / total       # niet gehallucineerd?
  internal_consistency: 1 - conflict_rate              # avoid ↔ preferred botsingen
  sample_quality:   avg(sample.quality) / 10
]) * 10
```
Per-sectie confidence (voice/vocab/claims/cta/trust) wordt apart getoond, zodat de gebruiker ziet welk deel zwak is.

### 5. Conflict-detectie & UI-flags
Na pass 4 toont de UI per zwakke sectie een banner:
- "5 woorden in Avoid komen >2× positief voor in samples — review"
- "CTA-lijst heeft geen letterlijke match in de site — voeg handmatige voorbeelden toe"
- "Geen samples van type: about, faq, pricing — confidence beperkt"

Met inline "Move to preferred" / "Remove" / "Add evidence" knoppen — geen handmatige tag-edit nodig.

### 6. Versioning
Elke run schrijft naar `tone_profile_versions` (nieuwe tabel) met diff t.o.v. vorige. UI krijgt een "What changed" panel zodat re-analyze veilig voelt.

### 7. Approve-flow met output-test gate
Voor approve: minimum 3 succesvolle test-outputs (meta / h1 / cta) met `verdict == publishable` over de laatste run. Voorkomt dat een zwak profiel zonder check live gaat.

---

## Wat dit oplost in het auditor-rapport

| Issue rapport | Fix |
|---|---|
| "ingewikkeld" fout in Avoid | Conflict-detectie (pass 4) flagt dit; UI biedt 1-klik move |
| CTA's verzonnen / generiek | CTA's komen uit `<a>`/`<button>` HTML van site zelf |
| Allowed claims te procesgericht | Claim-extractie pakt alle "we helpen/maken/geven" zinnen; synthese kiest breder |
| Commercial intensity te laag | Pass 1 telt CTA-dichtheid en sales-werkwoorden → bepaalt intensity deterministisch |
| Confidence 6.3 onverklaard | Per-sectie confidence + breakdown ("low coverage: missing about/faq") |
| Geen test of profiel werkt | Approve-gate eist 3 publishable test-outputs |

---

## Technische uitvoering

**Nieuwe / aangepaste files:**
- `src/lib/shared/tone/corpus.server.ts` — sitemap discovery, HTML parsing, CTA/claim regex-extractie
- `src/lib/shared/tone/passes.server.ts` — pass1 (per-sample), pass2 (aggregatie), pass3 (synthese), pass4 (critique)
- `src/lib/shared/tone/confidence.server.ts` — multi-factor scoring
- `src/lib/shared/tone/analyzer.server.ts` — herschreven als orchestrator over passes
- `src/lib/shared/tone/schemas.ts` — voeg `evidence`, `frequency`, per-sectie `confidence` toe (backwards compatible: optional fields)
- `src/lib/shared/tone/repo.functions.ts` — `addManualSample`, `listSampleConflicts`, `acceptConflictResolution`
- `src/routes/_authenticated/settings.tone-profile.tsx` — manual-paste tab, conflict-banner met 1-klik acties, per-sectie confidence chips, "what changed" diff panel
- Migratie: `tone_profile_versions` tabel, `tone_profile_samples.source_type` enum uitbreiden, `tone_profile_conflicts` tabel

**LLM kosten/budget per run** (orde van grootte): pass 1 cheap × ~15 samples + pass 3 pro × 1 + pass 4 cheap × 1. Vergelijkbaar met nu, maar veel meer signal per token.

**Geen breaking change voor `generator.server.ts` / `evaluator.server.ts`**: het V1-schema blijft geldig, V2-velden zijn additief.

---

## Volgorde van uitrol (3 stappen, deploybaar per stap)

1. **Corpus + CTA/claim-extractie + manual paste** (grootste kwaliteitswinst per regel code, lost meteen het CTA-probleem op).
2. **Multi-pass + conflict-detectie + per-sectie confidence** (lost "ingewikkeld in avoid" en de 6.3-zonder-uitleg op).
3. **Versioning, diff-panel, approve-gate** (maakt het écht backbone-grade).

Zal ik beginnen met stap 1?
