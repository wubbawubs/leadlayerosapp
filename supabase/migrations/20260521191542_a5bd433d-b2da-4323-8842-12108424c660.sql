
-- Enums
DO $$ BEGIN
  CREATE TYPE public.proposal_status AS ENUM ('draft','approved','rejected','partial');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.proposal_type AS ENUM ('meta_description','alt_text','schema','title','h1','other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Groups
CREATE TABLE IF NOT EXISTS public.fix_proposal_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  audit_id uuid NOT NULL,
  page_id uuid NULL,
  audit_page_id uuid NULL,
  theme text NOT NULL,
  status public.proposal_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fpg_audit ON public.fix_proposal_groups(audit_id);
CREATE INDEX IF NOT EXISTS idx_fpg_tenant ON public.fix_proposal_groups(tenant_id);

ALTER TABLE public.fix_proposal_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fpg member select" ON public.fix_proposal_groups
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "fpg operator write" ON public.fix_proposal_groups
  FOR ALL USING (public.has_tenant_min_role(tenant_id,'operator'::app_role))
  WITH CHECK (public.has_tenant_min_role(tenant_id,'operator'::app_role));

-- Proposals
CREATE TABLE IF NOT EXISTS public.fix_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  group_id uuid NOT NULL REFERENCES public.fix_proposal_groups(id) ON DELETE CASCADE,
  audit_page_id uuid NULL,
  page_id uuid NULL,
  issue_code text NOT NULL,
  proposal_type public.proposal_type NOT NULL,
  before jsonb NOT NULL DEFAULT '{}'::jsonb,
  after jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale text NOT NULL DEFAULT '',
  confidence numeric(3,2) NOT NULL DEFAULT 0.5,
  status public.proposal_status NOT NULL DEFAULT 'draft',
  decided_at timestamptz NULL,
  decided_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fp_group ON public.fix_proposals(group_id);
CREATE INDEX IF NOT EXISTS idx_fp_tenant ON public.fix_proposals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fp_status ON public.fix_proposals(status);

ALTER TABLE public.fix_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fp member select" ON public.fix_proposals
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "fp operator write" ON public.fix_proposals
  FOR ALL USING (public.has_tenant_min_role(tenant_id,'operator'::app_role))
  WITH CHECK (public.has_tenant_min_role(tenant_id,'operator'::app_role));
