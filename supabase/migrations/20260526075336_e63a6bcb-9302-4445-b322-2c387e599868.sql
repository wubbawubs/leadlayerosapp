-- Sprint E1: Approval / Ready-for-Publishing Gate on proposal_v2
ALTER TABLE public.proposal_v2
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approval_notes text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE INDEX IF NOT EXISTS idx_proposal_v2_status_tenant
  ON public.proposal_v2 (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_proposal_v2_ready_for_publishing
  ON public.proposal_v2 (tenant_id)
  WHERE status = 'ready_for_publishing';