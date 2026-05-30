-- WordPress Connection + Inventory V1
-- Adds wordpress_connections (capability metadata), wordpress_site_inventory (page/post snapshot)
-- and wordpress_page_mappings (conservative role assignment).
--
-- Auth/credentials stay in site_connections + tenant_secrets.
-- No plaintext secrets or credential columns here.

-- ============================================================
-- wordpress_connections
-- WordPress-specific metadata layer on top of site_connections.
-- ============================================================
CREATE TABLE public.wordpress_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_connection_id uuid NOT NULL REFERENCES public.site_connections(id) ON DELETE CASCADE,
  site_id uuid,
  kind text NOT NULL DEFAULT 'self_hosted',
  base_url text NOT NULL,
  rest_base_url text,
  status text NOT NULL DEFAULT 'not_connected',
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_connection_id),
  CONSTRAINT wordpress_connections_kind_chk
    CHECK (kind IN ('self_hosted', 'wordpress_com')),
  CONSTRAINT wordpress_connections_status_chk
    CHECK (status IN ('not_connected', 'connected', 'failed', 'needs_review', 'revoked'))
);

CREATE INDEX idx_wordpress_connections_tenant ON public.wordpress_connections (tenant_id);
CREATE INDEX idx_wordpress_connections_tenant_status ON public.wordpress_connections (tenant_id, status);
CREATE INDEX idx_wordpress_connections_site_conn ON public.wordpress_connections (site_connection_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wordpress_connections TO authenticated;
GRANT ALL ON public.wordpress_connections TO service_role;

ALTER TABLE public.wordpress_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wordpress_connections member select"
  ON public.wordpress_connections FOR SELECT
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "wordpress_connections operator write"
  ON public.wordpress_connections FOR ALL
  USING (public.has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (public.has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER wordpress_connections_set_updated_at
  BEFORE UPDATE ON public.wordpress_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- wordpress_site_inventory
-- Snapshot of WordPress pages/posts per connection.
-- ============================================================
CREATE TABLE public.wordpress_site_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wordpress_connection_id uuid NOT NULL REFERENCES public.wordpress_connections(id) ON DELETE CASCADE,
  site_connection_id uuid NOT NULL REFERENCES public.site_connections(id) ON DELETE CASCADE,
  site_id uuid,
  wp_post_id bigint NOT NULL,
  post_type text NOT NULL,
  status text,
  title text,
  slug text,
  link text,
  parent_id bigint,
  template text,
  modified_at timestamptz,
  content_hash text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  mapped_page_role text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(wordpress_connection_id, wp_post_id, post_type)
);

CREATE INDEX idx_wp_inventory_tenant_conn ON public.wordpress_site_inventory (tenant_id, wordpress_connection_id);
CREATE INDEX idx_wp_inventory_tenant_type ON public.wordpress_site_inventory (tenant_id, post_type);
CREATE INDEX idx_wp_inventory_tenant_status ON public.wordpress_site_inventory (tenant_id, status);
CREATE INDEX idx_wp_inventory_slug ON public.wordpress_site_inventory (wordpress_connection_id, slug);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wordpress_site_inventory TO authenticated;
GRANT ALL ON public.wordpress_site_inventory TO service_role;

ALTER TABLE public.wordpress_site_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wordpress_site_inventory member select"
  ON public.wordpress_site_inventory FOR SELECT
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "wordpress_site_inventory operator write"
  ON public.wordpress_site_inventory FOR ALL
  USING (public.has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (public.has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER wordpress_site_inventory_set_updated_at
  BEFORE UPDATE ON public.wordpress_site_inventory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- wordpress_page_mappings
-- Conservative LeadLayer role <-> WordPress post mapping.
-- ============================================================
CREATE TABLE public.wordpress_page_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wordpress_connection_id uuid NOT NULL REFERENCES public.wordpress_connections(id) ON DELETE CASCADE,
  inventory_id uuid REFERENCES public.wordpress_site_inventory(id) ON DELETE CASCADE,
  page_intelligence_id uuid,
  masterplan_item_id uuid,
  mapping_type text NOT NULL,
  target_service text,
  target_location text,
  confidence numeric NOT NULL DEFAULT 0,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wordpress_page_mappings_type_chk
    CHECK (mapping_type IN ('existing_page', 'missing_page', 'candidate_match', 'manual_match'))
);

CREATE INDEX idx_wp_mappings_tenant_conn ON public.wordpress_page_mappings (tenant_id, wordpress_connection_id);
CREATE INDEX idx_wp_mappings_type ON public.wordpress_page_mappings (tenant_id, mapping_type);
CREATE INDEX idx_wp_mappings_inventory ON public.wordpress_page_mappings (inventory_id);
CREATE INDEX idx_wp_mappings_masterplan ON public.wordpress_page_mappings (masterplan_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wordpress_page_mappings TO authenticated;
GRANT ALL ON public.wordpress_page_mappings TO service_role;

ALTER TABLE public.wordpress_page_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wordpress_page_mappings member select"
  ON public.wordpress_page_mappings FOR SELECT
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "wordpress_page_mappings operator write"
  ON public.wordpress_page_mappings FOR ALL
  USING (public.has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (public.has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER wordpress_page_mappings_set_updated_at
  BEFORE UPDATE ON public.wordpress_page_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
