ALTER TABLE public.business_profile_suggestions
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'evidence_based',
  ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_use_in_proposals boolean NOT NULL DEFAULT true;

ALTER TABLE public.business_profile_suggestions
  DROP CONSTRAINT IF EXISTS business_profile_suggestions_source_type_check;
ALTER TABLE public.business_profile_suggestions
  ADD CONSTRAINT business_profile_suggestions_source_type_check
  CHECK (source_type IN ('evidence_based','inferred','recommended','missing'));

CREATE INDEX IF NOT EXISTS idx_bps_tenant_status_sourcetype
  ON public.business_profile_suggestions (tenant_id, status, source_type);