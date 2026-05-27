
CREATE TABLE public.competitor_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  growth_goal_id uuid,
  market_scan_id uuid,
  status text NOT NULL DEFAULT 'draft',
  source text DEFAULT 'dataforseo+firecrawl',
  clusters_scanned integer,
  serp_results_collected integer,
  scan_started_at timestamptz,
  scan_completed_at timestamptz,
  error_message text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric,
  partial boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX competitor_scans_tenant_status_idx ON public.competitor_scans(tenant_id, status);
CREATE INDEX competitor_scans_tenant_created_idx ON public.competitor_scans(tenant_id, created_at DESC);
CREATE INDEX competitor_scans_tenant_goal_idx ON public.competitor_scans(tenant_id, growth_goal_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_scans TO authenticated;
GRANT ALL ON public.competitor_scans TO service_role;
ALTER TABLE public.competitor_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "competitor_scans member select" ON public.competitor_scans FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "competitor_scans operator write" ON public.competitor_scans FOR ALL USING (has_tenant_min_role(tenant_id, 'operator'::app_role)) WITH CHECK (has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TABLE public.competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  competitor_scan_id uuid NOT NULL REFERENCES public.competitor_scans(id) ON DELETE CASCADE,
  domain text NOT NULL,
  display_name text,
  is_self boolean NOT NULL DEFAULT false,
  serp_appearance_count integer NOT NULL DEFAULT 0,
  clusters_appeared_in jsonb NOT NULL DEFAULT '[]'::jsonb,
  gbp_name text,
  gbp_rating numeric,
  gbp_review_count integer,
  gbp_category text,
  service_pages_count integer,
  location_pages_count integer,
  service_pages_sample jsonb NOT NULL DEFAULT '[]'::jsonb,
  location_pages_sample jsonb NOT NULL DEFAULT '[]'::jsonb,
  trust_signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  competitor_score numeric,
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_confidence numeric,
  data_completeness numeric,
  error_message text,
  raw_homepage jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX competitors_tenant_scan_idx ON public.competitors(tenant_id, competitor_scan_id);
CREATE INDEX competitors_tenant_domain_idx ON public.competitors(tenant_id, domain);
CREATE INDEX competitors_tenant_is_self_idx ON public.competitors(tenant_id, is_self);
CREATE INDEX competitors_tenant_score_idx ON public.competitors(tenant_id, competitor_score);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitors TO authenticated;
GRANT ALL ON public.competitors TO service_role;
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "competitors member select" ON public.competitors FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "competitors operator write" ON public.competitors FOR ALL USING (has_tenant_min_role(tenant_id, 'operator'::app_role)) WITH CHECK (has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TABLE public.competitor_serp_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  competitor_scan_id uuid NOT NULL REFERENCES public.competitor_scans(id) ON DELETE CASCADE,
  competitor_id uuid REFERENCES public.competitors(id) ON DELETE SET NULL,
  cluster_key text,
  keyword text,
  location text,
  rank integer,
  url text,
  domain text,
  title text,
  snippet text,
  is_local_pack boolean NOT NULL DEFAULT false,
  local_pack_name text,
  local_pack_rating numeric,
  local_pack_review_count integer,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX competitor_serp_tenant_scan_idx ON public.competitor_serp_results(tenant_id, competitor_scan_id);
CREATE INDEX competitor_serp_tenant_keyword_idx ON public.competitor_serp_results(tenant_id, keyword);
CREATE INDEX competitor_serp_tenant_domain_idx ON public.competitor_serp_results(tenant_id, domain);
CREATE INDEX competitor_serp_tenant_pack_idx ON public.competitor_serp_results(tenant_id, is_local_pack);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_serp_results TO authenticated;
GRANT ALL ON public.competitor_serp_results TO service_role;
ALTER TABLE public.competitor_serp_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "competitor_serp member select" ON public.competitor_serp_results FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "competitor_serp operator write" ON public.competitor_serp_results FOR ALL USING (has_tenant_min_role(tenant_id, 'operator'::app_role)) WITH CHECK (has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER competitor_scans_set_updated_at BEFORE UPDATE ON public.competitor_scans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER competitors_set_updated_at BEFORE UPDATE ON public.competitors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
