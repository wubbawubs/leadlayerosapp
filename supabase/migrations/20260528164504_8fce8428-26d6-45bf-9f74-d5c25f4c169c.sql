
CREATE TABLE public.intelligence_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  site_id UUID,
  growth_goal_id UUID,
  status TEXT NOT NULL DEFAULT 'queued',
  current_stage TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'operator',
  trigger_reason TEXT,
  stages JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_hash JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_intelligence_runs_tenant_created
  ON public.intelligence_runs (tenant_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intelligence_runs TO authenticated;
GRANT ALL ON public.intelligence_runs TO service_role;

ALTER TABLE public.intelligence_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intelligence_runs member select"
  ON public.intelligence_runs FOR SELECT
  USING (is_tenant_member(tenant_id));

CREATE POLICY "intelligence_runs operator write"
  ON public.intelligence_runs FOR ALL
  USING (has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER trg_intelligence_runs_set_updated_at
  BEFORE UPDATE ON public.intelligence_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
