CREATE TABLE public.gbp_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  site_id uuid,
  growth_goal_id uuid,
  status text NOT NULL DEFAULT 'not_connected',
  source text NOT NULL DEFAULT 'manual',
  business_name text,
  profile_url text,
  primary_category text,
  secondary_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  rating numeric,
  review_count integer,
  review_velocity jsonb NOT NULL DEFAULT '{}'::jsonb,
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  service_area jsonb NOT NULL DEFAULT '[]'::jsonb,
  address text,
  phone text,
  website_url text,
  photos_status text DEFAULT 'unknown',
  posts_status text DEFAULT 'unknown',
  nap_consistency text DEFAULT 'unknown',
  completeness_score numeric,
  trust_score numeric,
  local_visibility_score numeric,
  gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  last_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gbp_profiles_status_chk CHECK (status IN ('not_connected','connected','manual_review','reviewed','unavailable')),
  CONSTRAINT gbp_profiles_source_chk CHECK (source IN ('manual','google_api','import','operator_review')),
  CONSTRAINT gbp_profiles_photos_chk CHECK (photos_status IN ('unknown','missing','weak','ok','strong')),
  CONSTRAINT gbp_profiles_posts_chk CHECK (posts_status IN ('unknown','inactive','occasional','active')),
  CONSTRAINT gbp_profiles_nap_chk CHECK (nap_consistency IN ('unknown','inconsistent','partial','consistent'))
);

CREATE INDEX gbp_profiles_tenant_goal_idx ON public.gbp_profiles (tenant_id, growth_goal_id);
CREATE INDEX gbp_profiles_tenant_status_idx ON public.gbp_profiles (tenant_id, status);
CREATE INDEX gbp_profiles_tenant_created_idx ON public.gbp_profiles (tenant_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gbp_profiles TO authenticated;
GRANT ALL ON public.gbp_profiles TO service_role;

ALTER TABLE public.gbp_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gbp_profiles member select"
  ON public.gbp_profiles FOR SELECT
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "gbp_profiles operator write"
  ON public.gbp_profiles FOR ALL
  USING (public.has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (public.has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER gbp_profiles_set_updated_at
  BEFORE UPDATE ON public.gbp_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();