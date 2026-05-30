-- Monthly Execution Planner V1
-- Table: monthly_execution_plans
--
-- Forward-looking companion to monthly_reports.
-- Report = what happened. Plan = what to execute next month.
-- V1 is operator-reviewed, deterministic, not auto-scheduled.

CREATE TABLE public.monthly_execution_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  growth_goal_id uuid REFERENCES public.growth_goals(id) ON DELETE SET NULL,
  monthly_report_id uuid REFERENCES public.monthly_reports(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  package_tier text NOT NULL DEFAULT 'growth',
  status text NOT NULL DEFAULT 'draft',
  lead_gap_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  rationale text,
  expected_impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_inputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monthly_execution_plans_tier_chk
    CHECK (package_tier IN ('starter', 'growth', 'pro')),
  CONSTRAINT monthly_execution_plans_status_chk
    CHECK (status IN ('draft', 'ready_for_review', 'approved', 'in_execution', 'completed', 'archived')),
  CONSTRAINT monthly_execution_plans_period_chk
    CHECK (period_end >= period_start)
);

CREATE INDEX idx_monthly_execution_plans_tenant
  ON public.monthly_execution_plans (tenant_id);
CREATE INDEX idx_monthly_execution_plans_tenant_period
  ON public.monthly_execution_plans (tenant_id, period_start DESC);
CREATE INDEX idx_monthly_execution_plans_tenant_status
  ON public.monthly_execution_plans (tenant_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_execution_plans TO authenticated;
GRANT ALL ON public.monthly_execution_plans TO service_role;

ALTER TABLE public.monthly_execution_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly_execution_plans member select"
  ON public.monthly_execution_plans FOR SELECT
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "monthly_execution_plans operator write"
  ON public.monthly_execution_plans FOR ALL
  USING (public.has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (public.has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER monthly_execution_plans_set_updated_at
  BEFORE UPDATE ON public.monthly_execution_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
