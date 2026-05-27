
-- market_scans
CREATE TABLE public.market_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_id uuid,
  growth_goal_id uuid REFERENCES public.growth_goals(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  language text DEFAULT 'en',
  country text,
  region text,
  vertical text,
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'manual',
  scan_started_at timestamptz,
  scan_completed_at timestamptz,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_scans_status_chk CHECK (status IN ('draft','pending','running','completed','failed','stale')),
  CONSTRAINT market_scans_source_chk CHECK (source IN ('manual','dataforseo','import','synthetic_fixture'))
);

CREATE INDEX idx_market_scans_tenant_status ON public.market_scans (tenant_id, status);
CREATE INDEX idx_market_scans_tenant_created ON public.market_scans (tenant_id, created_at DESC);
CREATE INDEX idx_market_scans_tenant_goal ON public.market_scans (tenant_id, growth_goal_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_scans TO authenticated;
GRANT ALL ON public.market_scans TO service_role;

ALTER TABLE public.market_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_scans member select" ON public.market_scans
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "market_scans operator write" ON public.market_scans
  FOR ALL USING (has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER market_scans_set_updated_at
  BEFORE UPDATE ON public.market_scans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- market_keywords
CREATE TABLE public.market_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  market_scan_id uuid NOT NULL REFERENCES public.market_scans(id) ON DELETE CASCADE,
  service text,
  location text,
  keyword text NOT NULL,
  normalized_keyword text,
  intent text,
  volume integer,
  difficulty numeric,
  competition numeric,
  cpc numeric,
  source text NOT NULL DEFAULT 'manual',
  confidence numeric,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_keywords_intent_chk CHECK (intent IS NULL OR intent IN ('emergency','service','commercial','informational','comparison','branded','unknown'))
);

CREATE INDEX idx_market_keywords_tenant_scan ON public.market_keywords (tenant_id, market_scan_id);
CREATE INDEX idx_market_keywords_tenant_service ON public.market_keywords (tenant_id, service);
CREATE INDEX idx_market_keywords_tenant_location ON public.market_keywords (tenant_id, location);
CREATE INDEX idx_market_keywords_tenant_keyword ON public.market_keywords (tenant_id, keyword);
CREATE INDEX idx_market_keywords_tenant_intent ON public.market_keywords (tenant_id, intent);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_keywords TO authenticated;
GRANT ALL ON public.market_keywords TO service_role;

ALTER TABLE public.market_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_keywords member select" ON public.market_keywords
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "market_keywords operator write" ON public.market_keywords
  FOR ALL USING (has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (has_tenant_min_role(tenant_id, 'operator'::app_role));

-- market_demand_clusters
CREATE TABLE public.market_demand_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  market_scan_id uuid NOT NULL REFERENCES public.market_scans(id) ON DELETE CASCADE,
  cluster_name text NOT NULL,
  service text,
  location text,
  intent text,
  total_volume integer,
  keyword_count integer,
  average_difficulty numeric,
  average_competition numeric,
  opportunity_score numeric,
  priority text,
  reasoning jsonb NOT NULL DEFAULT '[]'::jsonb,
  representative_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_demand_clusters_priority_chk CHECK (priority IS NULL OR priority IN ('low','medium','high','critical'))
);

CREATE INDEX idx_market_clusters_tenant_scan ON public.market_demand_clusters (tenant_id, market_scan_id);
CREATE INDEX idx_market_clusters_tenant_service ON public.market_demand_clusters (tenant_id, service);
CREATE INDEX idx_market_clusters_tenant_location ON public.market_demand_clusters (tenant_id, location);
CREATE INDEX idx_market_clusters_tenant_priority ON public.market_demand_clusters (tenant_id, priority);
CREATE INDEX idx_market_clusters_tenant_opp ON public.market_demand_clusters (tenant_id, opportunity_score);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_demand_clusters TO authenticated;
GRANT ALL ON public.market_demand_clusters TO service_role;

ALTER TABLE public.market_demand_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_clusters member select" ON public.market_demand_clusters
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "market_clusters operator write" ON public.market_demand_clusters
  FOR ALL USING (has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (has_tenant_min_role(tenant_id, 'operator'::app_role));
