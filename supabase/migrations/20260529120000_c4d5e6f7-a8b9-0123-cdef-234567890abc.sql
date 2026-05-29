-- WordPress Draft Creation V1
-- Tables: publishing_bundles, wordpress_drafts
--
-- publishing_bundles: one bundle per artifact → delivery channel.
-- wordpress_drafts:   one row per WP API call, linked to bundle.
--
-- No live publish. draft_created is the maximum automated status.
-- Approval for publish is a human gate (future sprint).

-- ---------------------------------------------------------------
-- publishing_bundles
-- ---------------------------------------------------------------

CREATE TABLE public.publishing_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  execution_artifact_id uuid NOT NULL REFERENCES public.execution_artifacts(id) ON DELETE CASCADE,
  masterplan_item_id uuid REFERENCES public.masterplan_items(id) ON DELETE SET NULL,
  wordpress_connection_id uuid REFERENCES public.wordpress_connections(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft_ready',
  bundle_type text NOT NULL DEFAULT 'wordpress_page_draft',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  safety_checks jsonb DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publishing_bundles_status_chk
    CHECK (status IN (
      'draft_ready',
      'draft_created',
      'needs_review',
      'approved_for_publish',
      'rejected',
      'failed'
    )),
  CONSTRAINT publishing_bundles_type_chk
    CHECK (bundle_type IN ('wordpress_page_draft'))
);

CREATE INDEX idx_publishing_bundles_tenant
  ON public.publishing_bundles (tenant_id);
CREATE INDEX idx_publishing_bundles_artifact
  ON public.publishing_bundles (execution_artifact_id);
CREATE INDEX idx_publishing_bundles_tenant_status
  ON public.publishing_bundles (tenant_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.publishing_bundles TO authenticated;
GRANT ALL ON public.publishing_bundles TO service_role;

ALTER TABLE public.publishing_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "publishing_bundles member select"
  ON public.publishing_bundles FOR SELECT
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "publishing_bundles operator write"
  ON public.publishing_bundles FOR ALL
  USING (public.has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (public.has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER publishing_bundles_set_updated_at
  BEFORE UPDATE ON public.publishing_bundles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------
-- wordpress_drafts
-- ---------------------------------------------------------------

CREATE TABLE public.wordpress_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  publishing_bundle_id uuid NOT NULL REFERENCES public.publishing_bundles(id) ON DELETE CASCADE,
  wordpress_connection_id uuid NOT NULL REFERENCES public.wordpress_connections(id) ON DELETE CASCADE,
  execution_artifact_id uuid NOT NULL REFERENCES public.execution_artifacts(id) ON DELETE CASCADE,
  wp_post_id bigint,
  wp_post_type text NOT NULL DEFAULT 'page',
  wp_status text NOT NULL DEFAULT 'draft',
  wp_edit_link text,
  wp_preview_link text,
  target_slug text,
  title text,
  status text NOT NULL DEFAULT 'created',
  error_message text,
  raw_response jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wordpress_drafts_status_chk
    CHECK (status IN (
      'created',
      'failed',
      'needs_review',
      'approved_for_publish',
      'published'
    ))
);

CREATE INDEX idx_wordpress_drafts_tenant
  ON public.wordpress_drafts (tenant_id);
CREATE INDEX idx_wordpress_drafts_artifact
  ON public.wordpress_drafts (execution_artifact_id);
CREATE INDEX idx_wordpress_drafts_bundle
  ON public.wordpress_drafts (publishing_bundle_id);
CREATE INDEX idx_wordpress_drafts_tenant_status
  ON public.wordpress_drafts (tenant_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wordpress_drafts TO authenticated;
GRANT ALL ON public.wordpress_drafts TO service_role;

ALTER TABLE public.wordpress_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wordpress_drafts member select"
  ON public.wordpress_drafts FOR SELECT
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "wordpress_drafts operator write"
  ON public.wordpress_drafts FOR ALL
  USING (public.has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (public.has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER wordpress_drafts_set_updated_at
  BEFORE UPDATE ON public.wordpress_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
