-- Basic Lead Ingestion Webhook V1
-- Table: lead_ingestion_sources
--
-- Stores named public webhook keys per tenant.
-- The public_key is the ONLY thing exposed in the public POST endpoint.
-- tenant_id is NEVER in the public URL or response.

CREATE TABLE public.lead_ingestion_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_connection_id uuid REFERENCES public.site_connections(id) ON DELETE SET NULL,
  name text NOT NULL,
  source_type text NOT NULL DEFAULT 'form_webhook',
  public_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  allowed_origins text[] NOT NULL DEFAULT '{}',
  default_source text NOT NULL DEFAULT 'form',
  default_status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_ingestion_sources_source_type_chk
    CHECK (source_type IN ('form_webhook', 'wordpress_form', 'manual', 'other')),
  CONSTRAINT lead_ingestion_sources_status_chk
    CHECK (status IN ('active', 'disabled', 'revoked'))
);

CREATE INDEX idx_lead_ingestion_sources_tenant
  ON public.lead_ingestion_sources (tenant_id);
CREATE INDEX idx_lead_ingestion_sources_public_key
  ON public.lead_ingestion_sources (public_key)
  WHERE status = 'active';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_ingestion_sources TO authenticated;
GRANT ALL ON public.lead_ingestion_sources TO service_role;

ALTER TABLE public.lead_ingestion_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_ingestion_sources member select"
  ON public.lead_ingestion_sources FOR SELECT
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "lead_ingestion_sources operator write"
  ON public.lead_ingestion_sources FOR ALL
  USING (public.has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (public.has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER lead_ingestion_sources_set_updated_at
  BEFORE UPDATE ON public.lead_ingestion_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
