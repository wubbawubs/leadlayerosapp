CREATE TABLE public.growth_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text,
  target_type text NOT NULL DEFAULT 'clients',
  target_count numeric,
  current_count numeric,
  timeframe_months integer,
  lead_value numeric,
  close_rate numeric,
  required_leads numeric,
  service_focus jsonb NOT NULL DEFAULT '[]'::jsonb,
  locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  good_fit_leads jsonb NOT NULL DEFAULT '[]'::jsonb,
  bad_fit_leads jsonb NOT NULL DEFAULT '[]'::jsonb,
  capacity_notes text,
  tracking_notes text,
  status text NOT NULL DEFAULT 'draft',
  confidence numeric,
  source text NOT NULL DEFAULT 'operator',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX growth_goals_tenant_status_idx ON public.growth_goals (tenant_id, status);
CREATE INDEX growth_goals_tenant_created_idx ON public.growth_goals (tenant_id, created_at DESC);
CREATE UNIQUE INDEX growth_goals_one_active_per_tenant
  ON public.growth_goals (tenant_id) WHERE status = 'active';

ALTER TABLE public.growth_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "growth_goals member select"
  ON public.growth_goals FOR SELECT
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "growth_goals operator write"
  ON public.growth_goals FOR ALL
  USING (public.has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (public.has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER growth_goals_touch_updated_at
  BEFORE UPDATE ON public.growth_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();