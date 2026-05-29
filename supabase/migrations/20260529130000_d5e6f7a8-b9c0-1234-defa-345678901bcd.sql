-- Monthly Reports V1
-- Operator-generated monthly progress reports: what was delivered, how many leads,
-- goal gap, next actions. No scheduling, no email/PDF in V1.

CREATE TABLE public.monthly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  growth_goal_id uuid REFERENCES public.growth_goals(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  lead_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  execution_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  wordpress_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  goal_progress_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  narrative text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monthly_reports_status_chk
    CHECK (status IN ('draft', 'ready_for_review', 'approved', 'sent', 'archived')),
  CONSTRAINT monthly_reports_period_chk
    CHECK (period_end >= period_start)
);

CREATE INDEX idx_monthly_reports_tenant
  ON public.monthly_reports (tenant_id);
CREATE INDEX idx_monthly_reports_tenant_period
  ON public.monthly_reports (tenant_id, period_start DESC);
CREATE INDEX idx_monthly_reports_tenant_status
  ON public.monthly_reports (tenant_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_reports TO authenticated;
GRANT ALL ON public.monthly_reports TO service_role;

ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly_reports member select"
  ON public.monthly_reports FOR SELECT
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "monthly_reports operator write"
  ON public.monthly_reports FOR ALL
  USING (public.has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (public.has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER monthly_reports_set_updated_at
  BEFORE UPDATE ON public.monthly_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
