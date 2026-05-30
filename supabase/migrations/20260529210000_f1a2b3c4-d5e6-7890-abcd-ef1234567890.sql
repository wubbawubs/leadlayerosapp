-- Existing Page Optimization V1
-- Tables: page_optimization_snapshots, wordpress_page_updates
-- Extends: execution_artifacts (delivery fields), wordpress_site_inventory (optimization tracking)

-- ------------------------------------------------------------------
-- page_optimization_snapshots
-- Immutable before-snapshots of existing WordPress pages.
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.page_optimization_snapshots (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wordpress_connection_id uuid        NOT NULL REFERENCES public.wordpress_connections(id) ON DELETE CASCADE,
  wp_post_id              bigint      NOT NULL,
  wp_post_type            text        NOT NULL DEFAULT 'page',
  wp_status               text,
  title                   text,
  slug                    text,
  link                    text,
  excerpt                 text,
  raw_content             text,
  rendered_content        text,
  detected_builder        text,
  eligibility_status      text        NOT NULL
    CHECK (eligibility_status IN ('safe', 'meta_only', 'manual_mode', 'blocked')),
  content_hash            text        NOT NULL,
  fetched_at              timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_tenant_id  ON public.page_optimization_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_conn_post  ON public.page_optimization_snapshots(wordpress_connection_id, wp_post_id);

ALTER TABLE public.page_optimization_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_select_member" ON public.page_optimization_snapshots
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "pos_insert_operator" ON public.page_optimization_snapshots
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'operator')
    )
  );

CREATE POLICY "pos_update_operator" ON public.page_optimization_snapshots
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'operator')
    )
  );

CREATE POLICY "pos_delete_operator" ON public.page_optimization_snapshots
  FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'operator')
    )
  );

-- ------------------------------------------------------------------
-- wordpress_page_updates
-- Proof of every PATCH applied to an existing WP page.
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wordpress_page_updates (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  execution_artifact_id   uuid        REFERENCES public.execution_artifacts(id) ON DELETE SET NULL,
  snapshot_id             uuid        REFERENCES public.page_optimization_snapshots(id) ON DELETE SET NULL,
  wordpress_connection_id uuid        NOT NULL REFERENCES public.wordpress_connections(id) ON DELETE CASCADE,
  wp_post_id              bigint      NOT NULL,
  status                  text        NOT NULL DEFAULT 'applied'
    CHECK (status IN ('pending', 'applied', 'failed')),
  applied_at              timestamptz,
  applied_by              uuid,
  update_source           text        NOT NULL DEFAULT 'leadlayer_update',
  fields_updated          jsonb       NOT NULL DEFAULT '[]',
  error_message           text,
  raw_response            jsonb       NOT NULL DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpu_tenant_id    ON public.wordpress_page_updates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wpu_artifact_id  ON public.wordpress_page_updates(execution_artifact_id);
CREATE INDEX IF NOT EXISTS idx_wpu_snapshot_id  ON public.wordpress_page_updates(snapshot_id);

CREATE OR REPLACE FUNCTION public.update_wordpress_page_updates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wpu_updated_at
  BEFORE UPDATE ON public.wordpress_page_updates
  FOR EACH ROW EXECUTE FUNCTION public.update_wordpress_page_updates_updated_at();

ALTER TABLE public.wordpress_page_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wpu_select_member" ON public.wordpress_page_updates
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "wpu_insert_operator" ON public.wordpress_page_updates
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'operator')
    )
  );

CREATE POLICY "wpu_update_operator" ON public.wordpress_page_updates
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'operator')
    )
  );

CREATE POLICY "wpu_delete_operator" ON public.wordpress_page_updates
  FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'operator')
    )
  );

-- ------------------------------------------------------------------
-- Extend execution_artifacts — delivery tracking for optimized pages
-- ------------------------------------------------------------------

ALTER TABLE public.execution_artifacts
  ADD COLUMN IF NOT EXISTS delivery_status      text,
  ADD COLUMN IF NOT EXISTS delivered_at         timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_by         uuid,
  ADD COLUMN IF NOT EXISTS delivered_url        text,
  ADD COLUMN IF NOT EXISTS before_snapshot_ref  uuid
    REFERENCES public.page_optimization_snapshots(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.execution_artifacts.delivery_status IS
  'For page_optimization_brief: optimized | delivery_failed | pending. Null for other artifact types.';
COMMENT ON COLUMN public.execution_artifacts.before_snapshot_ref IS
  'FK to page_optimization_snapshots — set at brief generation time, used to validate snapshot freshness at apply time.';

-- ------------------------------------------------------------------
-- Extend wordpress_site_inventory — optimization tracking
-- ------------------------------------------------------------------

ALTER TABLE public.wordpress_site_inventory
  ADD COLUMN IF NOT EXISTS last_optimized_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_optimized_by   uuid;

COMMENT ON COLUMN public.wordpress_site_inventory.last_optimized_at IS
  'Timestamp of last successful LeadLayer optimization PATCH for this page.';
COMMENT ON COLUMN public.wordpress_site_inventory.last_optimized_by IS
  'UUID of the execution_artifact that last optimized this page.';
