-- Execution Artifact Foundation V1
-- Table: execution_artifacts
-- First real execution artifact layer.
-- proposal_v2 stays for audit-fix micro-proposals.
-- This table holds structured page briefs and future artifact types.

CREATE TABLE public.execution_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  masterplan_item_id uuid NOT NULL REFERENCES public.masterplan_items(id) ON DELETE CASCADE,
  growth_goal_id uuid REFERENCES public.growth_goals(id) ON DELETE SET NULL,
  artifact_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_gates jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_readiness jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_context jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_from jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT execution_artifacts_type_chk
    CHECK (artifact_type IN (
      'page_brief',
      'page_optimization_brief',
      'cta_recommendation',
      'gbp_checklist',
      'tracking_checklist',
      'review_flow',
      'report_brief'
    )),
  CONSTRAINT execution_artifacts_status_chk
    CHECK (status IN ('draft', 'needs_review', 'approved', 'rejected'))
);

CREATE INDEX idx_execution_artifacts_tenant_item
  ON public.execution_artifacts (tenant_id, masterplan_item_id);
CREATE INDEX idx_execution_artifacts_tenant_status
  ON public.execution_artifacts (tenant_id, status);
CREATE INDEX idx_execution_artifacts_tenant_type
  ON public.execution_artifacts (tenant_id, artifact_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.execution_artifacts TO authenticated;
GRANT ALL ON public.execution_artifacts TO service_role;

ALTER TABLE public.execution_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "execution_artifacts member select"
  ON public.execution_artifacts FOR SELECT
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "execution_artifacts operator write"
  ON public.execution_artifacts FOR ALL
  USING (public.has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (public.has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER execution_artifacts_set_updated_at
  BEFORE UPDATE ON public.execution_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
