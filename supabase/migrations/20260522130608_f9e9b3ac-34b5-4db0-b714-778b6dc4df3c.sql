ALTER TABLE public.proposal_v2
  ADD COLUMN IF NOT EXISTS proposal_run_id uuid,
  ADD COLUMN IF NOT EXISTS block_reason text;

CREATE INDEX IF NOT EXISTS proposal_v2_run_idx ON public.proposal_v2 (audit_id, proposal_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS proposal_v2_audit_created_idx ON public.proposal_v2 (audit_id, created_at DESC);