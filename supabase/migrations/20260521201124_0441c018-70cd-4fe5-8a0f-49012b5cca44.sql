
-- ============= ENUMS =============
do $$ begin
  create type public.page_type as enum ('homepage','service','blog','location','contact','landing','category','about','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.page_intent as enum ('informational','commercial','local','trust','conversion','navigational');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.commercial_priority as enum ('low','medium','high');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.quality_verdict as enum ('publishable','needs_review','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.brand_voice_job_status as enum ('queued','running','done','failed');
exception when duplicate_object then null; end $$;

-- ============= business_profiles =============
create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique,
  business_name text,
  industry text,
  primary_offer text,
  secondary_offers jsonb not null default '[]'::jsonb,
  target_audience jsonb not null default '[]'::jsonb,
  service_areas jsonb not null default '[]'::jsonb,
  unique_value_proposition text,
  main_promise text,
  proof_points jsonb not null default '[]'::jsonb,
  avoid_claims jsonb not null default '[]'::jsonb,
  preferred_cta text,
  tone_preference text,
  language text not null default 'nl',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.business_profiles enable row level security;

create policy "business_profiles member select" on public.business_profiles
  for select using (public.is_tenant_member(tenant_id));
create policy "business_profiles operator write" on public.business_profiles
  for all using (public.has_tenant_min_role(tenant_id,'operator'))
  with check (public.has_tenant_min_role(tenant_id,'operator'));

create trigger business_profiles_set_updated_at
  before update on public.business_profiles
  for each row execute function public.set_updated_at();

-- ============= brand_voice_profiles =============
create table if not exists public.brand_voice_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique,
  tone_summary text,
  writing_style jsonb not null default '{}'::jsonb,
  preferred_words jsonb not null default '[]'::jsonb,
  forbidden_words jsonb not null default '[]'::jsonb,
  example_phrases jsonb not null default '[]'::jsonb,
  reading_level text,
  language text not null default 'nl',
  source_urls jsonb not null default '[]'::jsonb,
  job_status public.brand_voice_job_status not null default 'queued',
  job_error text,
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.brand_voice_profiles enable row level security;

create policy "brand_voice_profiles member select" on public.brand_voice_profiles
  for select using (public.is_tenant_member(tenant_id));
create policy "brand_voice_profiles operator write" on public.brand_voice_profiles
  for all using (public.has_tenant_min_role(tenant_id,'operator'))
  with check (public.has_tenant_min_role(tenant_id,'operator'));

create trigger brand_voice_profiles_set_updated_at
  before update on public.brand_voice_profiles
  for each row execute function public.set_updated_at();

-- ============= page_intelligence =============
create table if not exists public.page_intelligence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  page_id uuid,
  audit_page_id uuid,
  page_type public.page_type not null default 'other',
  intent public.page_intent not null default 'informational',
  commercial_priority public.commercial_priority not null default 'medium',
  target_keyword text,
  target_audience text,
  desired_action text,
  funnel_stage text,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists page_intelligence_audit_page_id_idx
  on public.page_intelligence(audit_page_id);
create index if not exists page_intelligence_page_id_idx
  on public.page_intelligence(page_id);
create unique index if not exists page_intelligence_audit_page_uniq
  on public.page_intelligence(audit_page_id) where audit_page_id is not null;

alter table public.page_intelligence enable row level security;

create policy "page_intelligence member select" on public.page_intelligence
  for select using (public.is_tenant_member(tenant_id));
create policy "page_intelligence operator write" on public.page_intelligence
  for all using (public.has_tenant_min_role(tenant_id,'operator'))
  with check (public.has_tenant_min_role(tenant_id,'operator'));

create trigger page_intelligence_set_updated_at
  before update on public.page_intelligence
  for each row execute function public.set_updated_at();

-- ============= proposal_quality_checks =============
create table if not exists public.proposal_quality_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  proposal_id uuid not null unique,
  brand_fit_score numeric(3,1),
  seo_fit_score numeric(3,1),
  commercial_fit_score numeric(3,1),
  clarity_score numeric(3,1),
  quality_score numeric(3,1),
  risk_flags jsonb not null default '[]'::jsonb,
  verdict public.quality_verdict not null default 'needs_review',
  publishable boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.proposal_quality_checks enable row level security;

create policy "proposal_quality_checks member select" on public.proposal_quality_checks
  for select using (public.is_tenant_member(tenant_id));
create policy "proposal_quality_checks operator write" on public.proposal_quality_checks
  for all using (public.has_tenant_min_role(tenant_id,'operator'))
  with check (public.has_tenant_min_role(tenant_id,'operator'));
