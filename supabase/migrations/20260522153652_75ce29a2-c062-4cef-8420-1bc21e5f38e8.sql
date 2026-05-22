
-- 1. Add v2_run_id column (nullable, uuid to match proposal_v2.proposal_run_id)
ALTER TABLE public.proposal_comparisons
  ADD COLUMN IF NOT EXISTS v2_run_id uuid;

-- 2. Backfill v2_run_id from proposal_v2.proposal_run_id
UPDATE public.proposal_comparisons pc
SET v2_run_id = pv.proposal_run_id
FROM public.proposal_v2 pv
WHERE pc.proposal_v2_id = pv.id
  AND pc.v2_run_id IS NULL
  AND pv.proposal_run_id IS NOT NULL;

-- 3. Drop the old over-restrictive unique constraint
ALTER TABLE public.proposal_comparisons
  DROP CONSTRAINT IF EXISTS proposal_comparisons_tenant_id_audit_id_page_id_issue_id_key;

-- 4. New uniqueness: one comparison per (tenant, audit, page, issue, proposal_v2_id).
-- NULLS NOT DISTINCT so rows missing proposal_v2_id still don't duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS proposal_comparisons_unique_per_v2
  ON public.proposal_comparisons (tenant_id, audit_id, page_id, issue_id, proposal_v2_id)
  NULLS NOT DISTINCT;

-- 5. Helpful lookup indexes
CREATE INDEX IF NOT EXISTS idx_proposal_comparisons_run
  ON public.proposal_comparisons (tenant_id, audit_id, v2_run_id);

CREATE INDEX IF NOT EXISTS idx_proposal_comparisons_v2
  ON public.proposal_comparisons (tenant_id, audit_id, proposal_v2_id);
