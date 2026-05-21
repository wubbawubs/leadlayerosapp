-- Business Profile (Growth Intelligence Profile) — BP-1 foundation

create table if not exists public.business_profiles_v2 (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  status text not null default 'draft',
  confidence_score numeric not null default 0,
  business_identity jsonb not null default '{}'::jsonb,
  offer_profile jsonb not null default '{}'::jsonb,
  icp_profile jsonb not null default '{}'::jsonb,
  location_profile jsonb not null default '{}'::jsonb,
  conversion_profile jsonb not null default '{}'::jsonb,
  proof_profile jsonb not null default '{}'::jsonb,
  claim_guardrails jsonb not null default '{}'::jsonb,
  strategy_angles jsonb not null default '[]'::jsonb,
  missing_context jsonb not null default '[]'::jsonb,
  source_map jsonb not null default '{}'::jsonb,
  confidence_map jsonb not null default '{}'::jsonb,
  locked_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.business_profiles_v2 enable row level security;

create policy "bpv2 member select" on public.business_profiles_v2
  for select using (public.is_tenant_member(tenant_id));
create policy "bpv2 operator write" on public.business_profiles_v2
  for all using (public.has_tenant_min_role(tenant_id, 'operator'::app_role))
  with check (public.has_tenant_min_role(tenant_id, 'operator'::app_role));

create trigger bpv2_updated_at before update on public.business_profiles_v2
  for each row execute function public.set_updated_at();

-- Suggestions
create table if not exists public.business_profile_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  business_profile_id uuid references public.business_profiles_v2(id) on delete cascade,
  section text not null,
  field_path text not null,
  suggested_value jsonb not null,
  current_value jsonb,
  source_evidence jsonb not null default '[]'::jsonb,
  confidence numeric not null default 0,
  rationale text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id)
);

alter table public.business_profile_suggestions enable row level security;

create policy "bps member select" on public.business_profile_suggestions
  for select using (public.is_tenant_member(tenant_id));
create policy "bps operator write" on public.business_profile_suggestions
  for all using (public.has_tenant_min_role(tenant_id, 'operator'::app_role))
  with check (public.has_tenant_min_role(tenant_id, 'operator'::app_role));

create index if not exists bps_tenant_status_idx
  on public.business_profile_suggestions(tenant_id, status);

-- Feedback
create table if not exists public.business_profile_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  suggestion_id uuid references public.business_profile_suggestions(id) on delete set null,
  feedback_type text not null,
  field_path text,
  before_value jsonb,
  after_value jsonb,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

alter table public.business_profile_feedback enable row level security;

create policy "bpf member select" on public.business_profile_feedback
  for select using (public.is_tenant_member(tenant_id));
create policy "bpf operator write" on public.business_profile_feedback
  for all using (public.has_tenant_min_role(tenant_id, 'operator'::app_role))
  with check (public.has_tenant_min_role(tenant_id, 'operator'::app_role));
