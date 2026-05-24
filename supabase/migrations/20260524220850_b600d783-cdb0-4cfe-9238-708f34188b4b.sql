
-- Drop dead schema and rebuild
DROP TABLE IF EXISTS public.monthly_plans CASCADE;
DROP TABLE IF EXISTS public.master_plans CASCADE;

CREATE TABLE public.master_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  growth_goal_id uuid,
  status text NOT NULL DEFAULT 'draft',
  summary text,
  strategy_summary text,
  lead_math jsonb NOT NULL DEFAULT '{}'::jsonb,
  main_constraints jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_from jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_context jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT master_plans_status_check CHECK (status IN ('draft','active','archived'))
);

CREATE INDEX master_plans_tenant_status_idx ON public.master_plans(tenant_id, status);
CREATE INDEX master_plans_tenant_created_idx ON public.master_plans(tenant_id, created_at DESC);
CREATE UNIQUE INDEX master_plans_one_active_per_tenant ON public.master_plans(tenant_id) WHERE status = 'active';

ALTER TABLE public.master_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master_plans member select" ON public.master_plans
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "master_plans operator write" ON public.master_plans
  FOR ALL USING (has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER master_plans_touch BEFORE UPDATE ON public.master_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.masterplan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  master_plan_id uuid NOT NULL REFERENCES public.master_plans(id) ON DELETE CASCADE,
  linked_goal_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  description text,
  reason text,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'proposed',
  effort text DEFAULT 'medium',
  expected_impact text DEFAULT 'medium',
  source text DEFAULT 'ai',
  linked_page_id uuid,
  linked_audit_id uuid,
  linked_issue_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT masterplan_items_type_check CHECK (type IN ('tracking','service_page','location_page','website_fix','gbp','review','content','conversion','reporting')),
  CONSTRAINT masterplan_items_priority_check CHECK (priority IN ('low','medium','high','critical')),
  CONSTRAINT masterplan_items_status_check CHECK (status IN ('proposed','approved','in_progress','done','skipped')),
  CONSTRAINT masterplan_items_effort_check CHECK (effort IN ('low','medium','high')),
  CONSTRAINT masterplan_items_impact_check CHECK (expected_impact IN ('low','medium','high')),
  CONSTRAINT masterplan_items_source_check CHECK (source IN ('goal','audit','business_profile','page_intelligence','ai','operator'))
);

CREATE INDEX masterplan_items_plan_idx ON public.masterplan_items(tenant_id, master_plan_id);
CREATE INDEX masterplan_items_priority_idx ON public.masterplan_items(tenant_id, priority);
CREATE INDEX masterplan_items_status_idx ON public.masterplan_items(tenant_id, status);
CREATE INDEX masterplan_items_type_idx ON public.masterplan_items(tenant_id, type);

ALTER TABLE public.masterplan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "masterplan_items member select" ON public.masterplan_items
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "masterplan_items operator write" ON public.masterplan_items
  FOR ALL USING (has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER masterplan_items_touch BEFORE UPDATE ON public.masterplan_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
