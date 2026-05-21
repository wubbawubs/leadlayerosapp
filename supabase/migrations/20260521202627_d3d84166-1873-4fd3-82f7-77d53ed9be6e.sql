
-- Enums
CREATE TYPE public.tone_profile_status AS ENUM ('draft', 'approved', 'locked');
CREATE TYPE public.tone_job_status AS ENUM ('queued', 'running', 'done', 'failed');
CREATE TYPE public.tone_sample_source AS ENUM (
  'homepage','service','blog','about','contact','manual_paste','approved_proposal','other'
);
CREATE TYPE public.tone_feedback_type AS ENUM (
  'approved','rejected','edited','manual_good','manual_bad'
);

-- Add needs_context to existing proposal_status enum
ALTER TYPE public.proposal_status ADD VALUE IF NOT EXISTS 'needs_context';

-- tone_profiles
CREATE TABLE public.tone_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE,
  status public.tone_profile_status NOT NULL DEFAULT 'draft',
  language text NOT NULL DEFAULT 'nl',
  locale text NOT NULL DEFAULT 'nl-NL',
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  locked_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence_score numeric,
  source_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  job_status public.tone_job_status NOT NULL DEFAULT 'queued',
  job_error text,
  analyzed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tone_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tone_profiles member select" ON public.tone_profiles
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tone_profiles operator write" ON public.tone_profiles
  FOR ALL USING (public.has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (public.has_tenant_min_role(tenant_id, 'operator'::app_role));

CREATE TRIGGER tone_profiles_set_updated_at
  BEFORE UPDATE ON public.tone_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- tone_profile_samples
CREATE TABLE public.tone_profile_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  tone_profile_id uuid NOT NULL REFERENCES public.tone_profiles(id) ON DELETE CASCADE,
  source_type public.tone_sample_source NOT NULL,
  source_url text,
  text text NOT NULL,
  quality_score numeric,
  weight numeric NOT NULL DEFAULT 1,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tone_profile_samples_profile_idx
  ON public.tone_profile_samples(tone_profile_id);

ALTER TABLE public.tone_profile_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tone_profile_samples member select" ON public.tone_profile_samples
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tone_profile_samples operator write" ON public.tone_profile_samples
  FOR ALL USING (public.has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (public.has_tenant_min_role(tenant_id, 'operator'::app_role));

-- tone_feedback_examples
CREATE TABLE public.tone_feedback_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  tone_profile_id uuid REFERENCES public.tone_profiles(id) ON DELETE SET NULL,
  example_type public.tone_feedback_type NOT NULL,
  before_text text,
  after_text text,
  reason text,
  proposal_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tone_feedback_examples_profile_idx
  ON public.tone_feedback_examples(tone_profile_id);
CREATE INDEX tone_feedback_examples_tenant_idx
  ON public.tone_feedback_examples(tenant_id);

ALTER TABLE public.tone_feedback_examples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tone_feedback_examples member select" ON public.tone_feedback_examples
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tone_feedback_examples operator write" ON public.tone_feedback_examples
  FOR ALL USING (public.has_tenant_min_role(tenant_id, 'operator'::app_role))
  WITH CHECK (public.has_tenant_min_role(tenant_id, 'operator'::app_role));
