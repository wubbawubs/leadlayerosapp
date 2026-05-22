
create table public.business_profile_analyzer_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  stage text not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bp_analyzer_jobs_tenant_status_idx
  on public.business_profile_analyzer_jobs (tenant_id, status, created_at desc);

create index bp_analyzer_jobs_creator_idx
  on public.business_profile_analyzer_jobs (created_by, created_at desc);

create trigger bp_analyzer_jobs_set_updated_at
  before update on public.business_profile_analyzer_jobs
  for each row execute function public.set_updated_at();

alter table public.business_profile_analyzer_jobs enable row level security;

create policy "bp_analyzer_jobs member select"
  on public.business_profile_analyzer_jobs
  for select
  using (public.is_tenant_member(tenant_id));

create policy "bp_analyzer_jobs operator insert"
  on public.business_profile_analyzer_jobs
  for insert
  with check (
    public.has_tenant_min_role(tenant_id, 'operator'::app_role)
    and created_by = auth.uid()
  );
