
-- Convert enum columns to text + CHECK to allow expanded values
ALTER TABLE public.page_intelligence
  ALTER COLUMN page_type DROP DEFAULT,
  ALTER COLUMN page_type TYPE text USING page_type::text,
  ALTER COLUMN page_type SET DEFAULT 'other',
  ALTER COLUMN intent DROP DEFAULT,
  ALTER COLUMN intent TYPE text USING intent::text,
  ALTER COLUMN intent SET DEFAULT 'informational',
  ALTER COLUMN commercial_priority DROP DEFAULT,
  ALTER COLUMN commercial_priority TYPE text USING commercial_priority::text,
  ALTER COLUMN commercial_priority SET DEFAULT 'medium';

ALTER TABLE public.page_intelligence
  ADD CONSTRAINT page_intelligence_page_type_chk
    CHECK (page_type IN ('homepage','service','location','blog','contact','about','faq','pricing','case_study','legal','landing','category','other')),
  ADD CONSTRAINT page_intelligence_intent_chk
    CHECK (intent IN ('informational','commercial','local','trust','conversion','support','navigational')),
  ADD CONSTRAINT page_intelligence_priority_chk
    CHECK (commercial_priority IN ('low','medium','high','critical'));

-- New columns
ALTER TABLE public.page_intelligence
  ADD COLUMN IF NOT EXISTS audit_id uuid REFERENCES public.audits(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS page_url text,
  ADD COLUMN IF NOT EXISTS seo_role text,
  ADD COLUMN IF NOT EXISTS primary_topic text,
  ADD COLUMN IF NOT EXISTS content_summary text,
  ADD COLUMN IF NOT EXISTS recommended_cta text,
  ADD COLUMN IF NOT EXISTS relevant_strategy_angle text,
  ADD COLUMN IF NOT EXISTS local_relevance jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS missing_page_context jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS confidence numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS model_used text,
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.page_intelligence
  ADD CONSTRAINT page_intelligence_seo_role_chk
    CHECK (seo_role IS NULL OR seo_role IN ('rank_target','supporting_content','conversion_page','trust_page','navigation_page'));

-- Unique per (tenant, page)
CREATE UNIQUE INDEX IF NOT EXISTS page_intelligence_tenant_page_uidx
  ON public.page_intelligence (tenant_id, page_id)
  WHERE page_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS page_intelligence_tenant_audit_idx
  ON public.page_intelligence (tenant_id, audit_id);
CREATE INDEX IF NOT EXISTS page_intelligence_tenant_priority_idx
  ON public.page_intelligence (tenant_id, commercial_priority);
CREATE INDEX IF NOT EXISTS page_intelligence_tenant_type_idx
  ON public.page_intelligence (tenant_id, page_type);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS page_intelligence_touch ON public.page_intelligence;
CREATE TRIGGER page_intelligence_touch
BEFORE UPDATE ON public.page_intelligence
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
