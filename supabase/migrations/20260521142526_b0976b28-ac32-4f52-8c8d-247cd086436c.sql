
-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists pgcrypto;
create extension if not exists vector;

-- ============================================================
-- ENUMS
-- ============================================================
create type app_role as enum ('owner', 'operator', 'client_approver', 'client_viewer');
create type geo_code as enum ('NL', 'US');
create type vertical_code as enum ('healthcare', 'legal', 'insurance', 'home_services', 'b2b', 'consulting', 'other');
create type lead_status as enum ('new', 'qualified', 'junk', 'won', 'lost');
create type issue_severity as enum ('low', 'medium', 'high', 'critical');
create type action_type as enum ('publish_page', 'fix_seo', 'gbp_post', 'review_respond', 'create_page');
create type approval_state as enum ('pending', 'approved', 'rejected', 'auto_approved');
create type workflow_state as enum ('queued', 'running', 'awaiting_approval', 'publishing', 'verifying', 'done', 'failed', 'rolled_back');
create type onboarding_status as enum ('started', 'wp_probe_failed', 'wp_probe_ok', 'tenant_created', 'expired');
create type connection_type as enum ('wordpress', 'gbp', 'gsc', 'ga4');
create type connection_status as enum ('pending', 'connected', 'error', 'revoked');
create type change_status as enum ('proposed', 'approved', 'published', 'rejected', 'rolled_back');

-- ============================================================
-- TIMESTAMP HELPER
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- PROFILES (1:1 with auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- TENANCY
-- ============================================================
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  geo geo_code not null,
  vertical vertical_code not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tenants_set_updated_at before update on public.tenants for each row execute function public.set_updated_at();

create table public.memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);
create index memberships_tenant_idx on public.memberships(tenant_id);

-- ============================================================
-- SECURITY DEFINER HELPERS (avoid RLS recursion)
-- ============================================================
create or replace function public.is_tenant_member(_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where tenant_id = _tenant_id and user_id = auth.uid()
  );
$$;

create or replace function public.has_tenant_role(_tenant_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where tenant_id = _tenant_id and user_id = auth.uid() and role = _role
  );
$$;

create or replace function public.has_tenant_min_role(_tenant_id uuid, _min_role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- order: owner > operator > client_approver > client_viewer
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = _tenant_id and m.user_id = auth.uid()
    and (
      case m.role
        when 'owner' then 4
        when 'operator' then 3
        when 'client_approver' then 2
        when 'client_viewer' then 1
      end
    ) >= (
      case _min_role
        when 'owner' then 4
        when 'operator' then 3
        when 'client_approver' then 2
        when 'client_viewer' then 1
      end
    )
  );
$$;

-- protect_last_owner trigger
create or replace function public.protect_last_owner()
returns trigger
language plpgsql
as $$
declare
  remaining int;
  target_tenant uuid;
begin
  if (tg_op = 'DELETE') then
    target_tenant := old.tenant_id;
    if old.role <> 'owner' then return old; end if;
  elsif (tg_op = 'UPDATE') then
    target_tenant := old.tenant_id;
    if old.role <> 'owner' or new.role = 'owner' then return new; end if;
  end if;

  select count(*) into remaining
  from public.memberships
  where tenant_id = target_tenant and role = 'owner'
    and not (user_id = old.user_id);

  if remaining < 1 then
    raise exception 'Cannot remove or demote the last owner of tenant %', target_tenant;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger memberships_protect_last_owner
  before update or delete on public.memberships
  for each row execute function public.protect_last_owner();

-- ============================================================
-- ONBOARDING
-- ============================================================
create table public.onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_url text,
  geo geo_code,
  vertical vertical_code,
  status onboarding_status not null default 'started',
  wp_probe_result jsonb,
  tenant_id uuid references public.tenants(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);
create index onboarding_user_idx on public.onboarding_sessions(user_id, status);

-- ============================================================
-- SITE CONNECTIONS
-- ============================================================
create table public.site_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type connection_type not null,
  status connection_status not null default 'pending',
  base_url text,
  external_account_id text,
  last_probe_at timestamptz,
  probe_result jsonb,
  created_at timestamptz not null default now()
);
create index site_connections_tenant_idx on public.site_connections(tenant_id, type);

-- ============================================================
-- SECRETS VAULT (AES-GCM at application layer)
-- ============================================================
create table public.tenant_secrets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  value_encrypted text not null,
  encryption_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);
create trigger tenant_secrets_set_updated_at before update on public.tenant_secrets for each row execute function public.set_updated_at();

create table public.secret_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_id uuid,
  actor_type text not null,
  action text not null,
  secret_key text not null,
  created_at timestamptz not null default now()
);
create index secret_audit_tenant_idx on public.secret_audit_log(tenant_id, created_at desc);

-- ============================================================
-- MASTER PLAN + MONTHLY
-- ============================================================
create table public.master_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  icp jsonb not null default '{}'::jsonb,
  services jsonb not null default '[]'::jsonb,
  target_keywords jsonb not null default '[]'::jsonb,
  content_pillars jsonb not null default '[]'::jsonb,
  capacity_hours_per_month int default 8,
  ai_credits_per_month int default 100000,
  updated_at timestamptz not null default now()
);
create trigger master_plans_set_updated_at before update on public.master_plans for each row execute function public.set_updated_at();

create table public.monthly_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_month date not null,
  priorities jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  generated_at timestamptz not null default now(),
  unique (tenant_id, period_month)
);

-- ============================================================
-- PAGES + CHANGES
-- ============================================================
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  site_connection_id uuid references public.site_connections(id) on delete set null,
  wp_post_id bigint,
  url text not null,
  title text,
  template text,
  last_audited_at timestamptz,
  health_score int,
  created_at timestamptz not null default now()
);
create index pages_tenant_idx on public.pages(tenant_id);

create table public.page_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  html text,
  meta jsonb,
  screenshot_path text,
  created_at timestamptz not null default now()
);
create index page_snapshots_page_idx on public.page_snapshots(page_id, created_at desc);

create table public.change_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  page_id uuid references public.pages(id) on delete cascade,
  action_type action_type not null,
  risk_level text not null default 'low',
  requires_approval boolean not null default true,
  rollback_strategy text not null default 'snapshot_restore',
  status change_status not null default 'proposed',
  created_at timestamptz not null default now()
);
create index change_groups_tenant_idx on public.change_groups(tenant_id, status);

create table public.changes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  change_group_id uuid not null references public.change_groups(id) on delete cascade,
  field text not null,
  diff jsonb not null,
  before_snapshot_id uuid references public.page_snapshots(id),
  after_snapshot_id uuid references public.page_snapshots(id),
  created_at timestamptz not null default now()
);
create index changes_group_idx on public.changes(change_group_id);

-- ============================================================
-- WP WRITE OPS
-- ============================================================
create table public.wp_write_operations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  change_group_id uuid references public.change_groups(id) on delete set null,
  wp_post_id bigint,
  operation text not null,
  request jsonb not null,
  response jsonb,
  http_status int,
  status text not null default 'pending',
  error text,
  created_at timestamptz not null default now()
);
create index wp_write_ops_tenant_idx on public.wp_write_operations(tenant_id, created_at desc);

-- ============================================================
-- AUDITS / ISSUES / HEALTH
-- ============================================================
create table public.scans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  engine text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
);
create index scans_tenant_idx on public.scans(tenant_id, started_at desc);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  scan_id uuid references public.scans(id) on delete cascade,
  page_id uuid references public.pages(id) on delete set null,
  code text not null,
  severity issue_severity not null,
  title text not null,
  details jsonb,
  resolved_at timestamptz
);
create index issues_tenant_open_idx on public.issues(tenant_id) where resolved_at is null;

create table public.health_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category text not null,
  score int not null,
  measured_at timestamptz not null default now()
);
create index health_scores_tenant_idx on public.health_scores(tenant_id, measured_at desc);

-- ============================================================
-- LEADS
-- ============================================================
create table public.raw_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  lead_id uuid
);
create index raw_events_tenant_unproc_idx on public.raw_events(tenant_id, received_at) where processed_at is null;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  page_id uuid references public.pages(id) on delete set null,
  source text,
  status lead_status not null default 'new',
  name text,
  email text,
  phone text,
  payload jsonb,
  attribution jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger leads_set_updated_at before update on public.leads for each row execute function public.set_updated_at();
create index leads_tenant_idx on public.leads(tenant_id, created_at desc);

create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index lead_events_lead_idx on public.lead_events(lead_id, created_at desc);

-- ============================================================
-- WORKFLOW RUNS (UI mirror of pg-boss)
-- ============================================================
create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  job_name text not null,
  state workflow_state not null default 'queued',
  payload jsonb,
  result jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index workflow_runs_tenant_idx on public.workflow_runs(tenant_id, created_at desc);

-- ============================================================
-- RLS — ENABLE ON EVERY TABLE
-- ============================================================
alter table public.profiles            enable row level security;
alter table public.tenants             enable row level security;
alter table public.memberships         enable row level security;
alter table public.onboarding_sessions enable row level security;
alter table public.site_connections    enable row level security;
alter table public.tenant_secrets      enable row level security;
alter table public.secret_audit_log    enable row level security;
alter table public.master_plans        enable row level security;
alter table public.monthly_plans       enable row level security;
alter table public.pages               enable row level security;
alter table public.page_snapshots      enable row level security;
alter table public.change_groups       enable row level security;
alter table public.changes             enable row level security;
alter table public.wp_write_operations enable row level security;
alter table public.scans               enable row level security;
alter table public.issues              enable row level security;
alter table public.health_scores       enable row level security;
alter table public.raw_events          enable row level security;
alter table public.leads               enable row level security;
alter table public.lead_events         enable row level security;
alter table public.workflow_runs       enable row level security;

-- ============================================================
-- POLICIES — profiles
-- ============================================================
create policy "profiles self select" on public.profiles for select using (auth.uid() = id);
create policy "profiles self update" on public.profiles for update using (auth.uid() = id);

-- POLICIES — tenants
create policy "tenants member select" on public.tenants for select using (public.is_tenant_member(id));
create policy "tenants owner update"  on public.tenants for update using (public.has_tenant_role(id, 'owner'));
create policy "tenants owner delete"  on public.tenants for delete using (public.has_tenant_role(id, 'owner'));
-- INSERT done via server-fn that also seeds owner membership (no anon insert here)

-- POLICIES — memberships
create policy "memberships self select"   on public.memberships for select using (user_id = auth.uid() or public.is_tenant_member(tenant_id));
create policy "memberships owner manage"  on public.memberships for all
  using (public.has_tenant_role(tenant_id, 'owner'))
  with check (public.has_tenant_role(tenant_id, 'owner'));

-- POLICIES — onboarding_sessions (per-user, pre-tenant)
create policy "onboarding self all" on public.onboarding_sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- POLICIES — site_connections
create policy "site_connections member select" on public.site_connections for select using (public.is_tenant_member(tenant_id));
create policy "site_connections operator write" on public.site_connections for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- POLICIES — tenant_secrets (no read for clients — only server-fn via service role)
-- Members can see that a key exists (no value)? We keep it locked: no policies → only service role.
-- (RLS enabled but no policies = deny all for authenticated.)

-- POLICIES — secret_audit_log (read-only for members)
create policy "secret_audit member select" on public.secret_audit_log for select using (public.is_tenant_member(tenant_id));

-- POLICIES — master_plans
create policy "master_plans member select"  on public.master_plans for select using (public.is_tenant_member(tenant_id));
create policy "master_plans operator write" on public.master_plans for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- POLICIES — monthly_plans
create policy "monthly_plans member select"  on public.monthly_plans for select using (public.is_tenant_member(tenant_id));
create policy "monthly_plans operator write" on public.monthly_plans for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- POLICIES — pages
create policy "pages member select"  on public.pages for select using (public.is_tenant_member(tenant_id));
create policy "pages operator write" on public.pages for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- POLICIES — page_snapshots (read-only for members; writes via worker/service-role)
create policy "page_snapshots member select" on public.page_snapshots for select using (public.is_tenant_member(tenant_id));

-- POLICIES — change_groups
create policy "change_groups member select"  on public.change_groups for select using (public.is_tenant_member(tenant_id));
create policy "change_groups approver write" on public.change_groups for update
  using (public.has_tenant_min_role(tenant_id, 'client_approver'))
  with check (public.has_tenant_min_role(tenant_id, 'client_approver'));

-- POLICIES — changes
create policy "changes member select" on public.changes for select using (public.is_tenant_member(tenant_id));

-- POLICIES — wp_write_operations (read-only for members)
create policy "wp_write_ops member select" on public.wp_write_operations for select using (public.is_tenant_member(tenant_id));

-- POLICIES — scans / issues / health_scores
create policy "scans member select"         on public.scans         for select using (public.is_tenant_member(tenant_id));
create policy "issues member select"        on public.issues        for select using (public.is_tenant_member(tenant_id));
create policy "health_scores member select" on public.health_scores for select using (public.is_tenant_member(tenant_id));

-- POLICIES — raw_events (read-only for members)
create policy "raw_events member select" on public.raw_events for select using (public.is_tenant_member(tenant_id));

-- POLICIES — leads
create policy "leads member select"  on public.leads for select using (public.is_tenant_member(tenant_id));
create policy "leads operator write" on public.leads for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- POLICIES — lead_events (read-only for members)
create policy "lead_events member select" on public.lead_events for select using (public.is_tenant_member(tenant_id));

-- POLICIES — workflow_runs (read-only for members)
create policy "workflow_runs member select" on public.workflow_runs for select using (public.is_tenant_member(tenant_id));
