# Sprint 3 — Strategy & Master Plan

**Doel:** AI genereert per tenant een `master_plan` (12 maanden) + huidige `monthly_plan`. Operator reviewt & approved. Geen edits zonder approval.

---

## Todo's

### LLM
- [ ] Prompt-templates `src/lib/shared/llm/prompts/masterPlan.ts`, `monthlyPlan.ts` (NL/EN, vertical-aware).
- [ ] Output-schemas in Zod, strict validation.

### Server functions
- [ ] `strategy.generateMasterPlan({ tenantId })` — input: laatste audit + tenant.vertical + geo → output JSON.
- [ ] `strategy.approveMasterPlan({ planId })` → `approval_state='approved'`, locks edits.
- [ ] `strategy.regenerate({ planId })` → nieuwe versie naast oude, diff zichtbaar.

### UI
- [ ] `/app/strategy` — kaart per kwartaal, klik → maand-detail.
- [ ] Diff-view bij re-generate (oud vs nieuw).
- [ ] Approve-knop (disabled tot review compleet).

### Audit-log
- [ ] Élke generate + approve schrijft plan-audit-rij.

---

## Acceptance

- [ ] Master plan generation < 30s voor gemiddelde tenant.
- [ ] Approve → monthly_plan locked; re-generate vereist nieuwe approval.
- [ ] Diff-view toont per maand wat veranderde.
