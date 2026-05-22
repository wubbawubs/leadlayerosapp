
-- QA Compare V1: proposal_comparisons table
CREATE TABLE public.proposal_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  audit_id uuid NOT NULL,
  page_id uuid NOT NULL,
  issue_id text NOT NULL,
  action_type text,
  proposal_v1_id uuid,
  proposal_v2_id uuid,
  winner text NOT NULL DEFAULT 'unreviewed'
    CHECK (winner IN ('unreviewed','v1','v2','both_bad','both_good','needs_edit')),
  reason text,
  reason_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  score_mismatch boolean NOT NULL DEFAULT false,
  notes text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, audit_id, page_id, issue_id)
);

CREATE INDEX idx_proposal_comparisons_audit ON public.proposal_comparisons (audit_id);
CREATE INDEX idx_proposal_comparisons_tenant ON public.proposal_comparisons (tenant_id);

ALTER TABLE public.proposal_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proposal_comparisons member select"
  ON public.proposal_comparisons FOR SELECT
  USING (is_tenant_member(tenant_id));

CREATE POLICY "proposal_comparisons operator write"
  ON public.proposal_comparisons FOR ALL
  USING (has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER proposal_comparisons_updated_at
  BEFORE UPDATE ON public.proposal_comparisons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
