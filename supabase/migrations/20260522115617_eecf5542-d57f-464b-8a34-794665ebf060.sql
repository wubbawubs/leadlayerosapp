
CREATE TABLE IF NOT EXISTS public.proposal_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  audit_id uuid NOT NULL,
  page_id uuid NOT NULL,
  issue_id text NOT NULL,
  action_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  title text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  reasoning text NOT NULL DEFAULT '',
  before jsonb NOT NULL DEFAULT '{}'::jsonb,
  after jsonb NOT NULL DEFAULT '{}'::jsonb,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  context_used jsonb NOT NULL DEFAULT '{}'::jsonb,
  keywords_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  publishable boolean NOT NULL DEFAULT false,
  model_used text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proposal_v2_audit_page_idx ON public.proposal_v2 (audit_id, page_id);
CREATE INDEX IF NOT EXISTS proposal_v2_tenant_idx ON public.proposal_v2 (tenant_id);

ALTER TABLE public.proposal_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proposal_v2 member select"
  ON public.proposal_v2 FOR SELECT
  USING (is_tenant_member(tenant_id));

CREATE POLICY "proposal_v2 operator write"
  ON public.proposal_v2 FOR ALL
  USING (has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER proposal_v2_touch_updated_at
  BEFORE UPDATE ON public.proposal_v2
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
