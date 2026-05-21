## Probleem

Op `/audits/$id/proposals` blijft "Generate proposals" stilletjes hangen. In de DB staan 0 proposals voor audit `c60e08cd...` ondanks 23 issues. Oorzaken:

1. **Worker timeout** — `generateProposalsForAudit` doet meerdere LLM-calls (Gemini 2.5 Flash) in één request. Cloudflare workerd hakt rond ~30s af en de fetch faalt voordat onze try/catch een toast kan tonen. Geen log, geen feedback.
2. **All-or-nothing** — als er één LLM-call faalt of de hele batch time-out, krijg je 0 groups en gooien we een generieke fout. De gebruiker ziet alleen "Generating…" → niks.
3. **Geen voortgang** — knop heeft alleen `isPending` state, geen idee van "3/8 pages klaar".

## Oplossing: per-page generatie + client-side polling

Splits de zware loop op zodat elke server-call binnen het worker budget past, en laat de UI orchestreren.

### Backend

1. Nieuwe serverFn `listEligibleAuditPages({ auditId })` → geeft array `{ id, url, issueCount }` van pagina's met >0 issues, gesorteerd op issueCount desc.
2. Nieuwe serverFn `generateProposalsForPage({ auditId, auditPageId })` → doet exact één LLM-call voor één pagina, persist één `fix_proposal_group` + bijhorende `fix_proposals`, returnt `{ proposalsCreated, errorMessage? }`. Past ruim binnen worker budget.
3. Bestaande `generateProposals` blijft, maar wordt thin wrapper die per-page functie aanroept voor backwards compat (of we verwijderen 'm).
4. In `generator.server.ts`: betere error-surfacing — gooi specifieke error met LLM response body als parsing faalt.

### Frontend (`audits.$auditId.proposals.tsx`)

1. Bij klik op "Generate proposals":
   - Fetch eligible pages via `listEligibleAuditPages`.
   - Itereer en roep `generateProposalsForPage` aan per pagina (sequentieel met `await` om rate limits te respecteren).
   - Toon live progress: "Verwerkt 3/8 pagina's · 12 proposals · 1 fout".
   - Na elke pagina `qc.invalidateQueries(['proposals', auditId])` zodat de lijst meteen vult.
2. Per-pagina foutmeldingen verzamelen en tonen in een uitklapbare "Errors" sectie i.p.v. één toast.
3. Disable knop tijdens generatie; toon "Cancel" knop die `AbortController` triggert.

### Verificatie

- Klik Generate op audit `c60e08cd...`: verwacht 8 sequentiële calls, ~3-5s elk, eindigend met 8 groups en N proposals in DB.
- Check `psql -c "select count(*) from fix_proposals"` > 0.
- Bekijk worker logs: per pagina één `[proposals] page=... got=N` regel.

### Niet in scope

- Geen queue/cron infra (overkill voor MVP).
- Geen WordPress write-back (S5).
- Geen wijziging aan auth, RLS, schema.

## Bestanden

- `src/lib/shared/proposals/generator.server.ts` — splits in `generateProposalsForAuditPage(pageId)`; oude functie wordt loop-helper.
- `src/lib/shared/db/repos/proposals.functions.ts` — voeg `listEligibleAuditPages` + `generateProposalsForPage` serverFns toe.
- `src/routes/_authenticated/audits.$auditId.proposals.tsx` — vervang single-shot mutation door sequentiële loop met progress state.