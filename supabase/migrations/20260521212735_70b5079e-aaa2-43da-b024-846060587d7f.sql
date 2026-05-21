ALTER TABLE public.business_profiles_v2
  ADD COLUMN IF NOT EXISTS confidence_reasons jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Helpful index for suggestion dedupe lookups
CREATE INDEX IF NOT EXISTS idx_bps_tenant_field_status
  ON public.business_profile_suggestions (tenant_id, field_path, status);

CREATE INDEX IF NOT EXISTS idx_bpf_tenant_field_type
  ON public.business_profile_feedback (tenant_id, field_path, feedback_type);