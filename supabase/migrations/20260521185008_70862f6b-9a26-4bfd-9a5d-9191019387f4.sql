-- audit status enum
DO $$ BEGIN
  CREATE TYPE public.audit_status AS ENUM ('queued','running','succeeded','failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- audits table
CREATE TABLE public.audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_connection_id uuid NOT NULL REFERENCES public.site_connections(id) ON DELETE CASCADE,
  status public.audit_status NOT NULL DEFAULT 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  pages_count integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audits_tenant_site_idx ON public.audits(tenant_id, site_connection_id, created_at DESC);

ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audits member select" ON public.audits FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "audits operator write" ON public.audits FOR ALL
  USING (has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (has_tenant_min_role(tenant_id, 'operator'::app_role));

-- audit_pages table
CREATE TABLE public.audit_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  page_id uuid REFERENCES public.pages(id) ON DELETE SET NULL,
  url text NOT NULL,
  status_code integer,
  title text,
  meta_description text,
  h1 text,
  schema jsonb,
  images_without_alt integer NOT NULL DEFAULT 0,
  internal_links_count integer NOT NULL DEFAULT 0,
  external_links_count integer NOT NULL DEFAULT 0,
  word_count integer NOT NULL DEFAULT 0,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_pages_audit_idx ON public.audit_pages(audit_id);
CREATE INDEX audit_pages_tenant_idx ON public.audit_pages(tenant_id);

ALTER TABLE public.audit_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_pages member select" ON public.audit_pages FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "audit_pages operator write" ON public.audit_pages FOR ALL
  USING (has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (has_tenant_min_role(tenant_id, 'operator'::app_role));

-- extend pages
ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS meta_description text,
  ADD COLUMN IF NOT EXISTS h1 text,
  ADD COLUMN IF NOT EXISTS status_code integer,
  ADD COLUMN IF NOT EXISTS images_without_alt integer;
