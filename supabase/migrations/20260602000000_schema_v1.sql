-- ================================================================
-- LeadLayer OS — Production Schema v1
-- Consolidated clean migration. Replaces all Lovable-era migrations.
-- ================================================================

-- ================================================================
-- EXTENSIONS
-- ================================================================
create extension if not exists pgcrypto;
create extension if not exists vector;
create extension if not exists pg_stat_statements;

-- ================================================================
-- ENUMS
-- ================================================================
create type public.app_role as enum ('owner', 'operator', 'client_approver', 'client_viewer');
create type public.geo_code as enum ('NL', 'US');
create type public.vertical_code as enum ('healthcare', 'legal', 'insurance', 'home_services', 'b2b', 'consulting', 'other');
create type public.lead_status as enum ('new', 'qualified', 'junk', 'won', 'lost');
create type public.issue_severity as enum ('low', 'medium', 'high', 'critical');
create type public.action_type as enum ('publish_page', 'fix_seo', 'gbp_post', 'review_respond', 'create_page');
create type public.approval_state as enum ('pending', 'approved', 'rejected', 'auto_approved');
create type public.workflow_state as enum ('queued', 'running', 'awaiting_approval', 'publishing', 'verifying', 'done', 'failed', 'rolled_back');
create type public.onboarding_status as enum ('started', 'wp_probe_failed', 'wp_probe_ok', 'tenant_created', 'expired');
create type public.connection_type as enum ('wordpress', 'wordpress_com', 'gbp', 'gsc', 'ga4');
create type public.connection_status as enum ('pending', 'connected', 'error', 'revoked');
create type public.change_status as enum ('proposed', 'approved', 'published', 'rejected', 'rolled_back');
create type public.plan_tier as enum ('free', 'starter', 'pro', 'enterprise');
create type public.audit_status as enum ('queued', 'running', 'succeeded', 'failed');
create type public.proposal_status as enum ('draft', 'approved', 'rejected', 'partial', 'needs_context');
create type public.proposal_type as enum ('meta_description', 'alt_text', 'schema', 'title', 'h1', 'other');
create type public.brand_voice_job_status as enum ('queued', 'running', 'done', 'failed');
create type public.tone_profile_status as enum ('draft', 'approved', 'locked');
create type public.tone_job_status as enum ('queued', 'running', 'done', 'failed');
create type public.tone_sample_source as enum ('homepage', 'service', 'blog', 'about', 'contact', 'manual_paste', 'approved_proposal', 'other');
create type public.tone_feedback_type as enum ('approved', 'rejected', 'edited', 'manual_good', 'manual_bad');

-- ================================================================
-- UTILITY FUNCTIONS
-- ================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ================================================================
-- PROFILES (1:1 with auth.users)
-- ================================================================
create table public.profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
create policy "profiles self select" on public.profiles for select using (auth.uid() = id);
create policy "profiles self update" on public.profiles for update using (auth.uid() = id);

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

-- ================================================================
-- TENANTS
-- ================================================================
create table public.tenants (
  id                      uuid        primary key default gen_random_uuid(),
  name                    text        not null,
  geo                     geo_code    not null,
  vertical                vertical_code not null,
  status                  text        not null default 'active',
  plan                    plan_tier   not null default 'free',
  portal_token            text        unique,
  portal_token_created_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_tenants_portal_token on public.tenants (portal_token) where portal_token is not null;
create trigger tenants_set_updated_at before update on public.tenants for each row execute function public.set_updated_at();
alter table public.tenants enable row level security;

-- ================================================================
-- MEMBERSHIPS
-- ================================================================
create table public.memberships (
  user_id    uuid      not null references auth.users(id) on delete cascade,
  tenant_id  uuid      not null references public.tenants(id) on delete cascade,
  role       app_role  not null,
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);

create index memberships_tenant_idx on public.memberships(tenant_id);
alter table public.memberships enable row level security;

create or replace function public.protect_last_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  remaining    int;
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

-- ================================================================
-- RLS HELPER FUNCTIONS (security definer — avoid RLS recursion)
-- ================================================================
create or replace function public.is_tenant_member(_tenant_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where tenant_id = _tenant_id and user_id = auth.uid()
  );
$$;

create or replace function public.has_tenant_role(_tenant_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where tenant_id = _tenant_id and user_id = auth.uid() and role = _role
  );
$$;

create or replace function public.has_tenant_min_role(_tenant_id uuid, _min_role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = _tenant_id and m.user_id = auth.uid()
    and (
      case m.role
        when 'owner'          then 4
        when 'operator'       then 3
        when 'client_approver' then 2
        when 'client_viewer'  then 1
      end
    ) >= (
      case _min_role
        when 'owner'          then 4
        when 'operator'       then 3
        when 'client_approver' then 2
        when 'client_viewer'  then 1
      end
    )
  );
$$;

-- Revoke from public/anon, grant only to authenticated
revoke execute on function public.is_tenant_member(uuid) from public, anon;
revoke execute on function public.has_tenant_role(uuid, app_role) from public, anon;
revoke execute on function public.has_tenant_min_role(uuid, app_role) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.has_tenant_role(uuid, app_role) to authenticated;
grant execute on function public.has_tenant_min_role(uuid, app_role) to authenticated;

-- Membership policies
create policy "memberships self select"  on public.memberships for select
  using (user_id = auth.uid() or public.is_tenant_member(tenant_id));
create policy "memberships owner manage" on public.memberships for all
  using (public.has_tenant_role(tenant_id, 'owner'))
  with check (public.has_tenant_role(tenant_id, 'owner'));

-- Tenant policies
create policy "tenants member select" on public.tenants for select using (public.is_tenant_member(id));
create policy "tenants owner update"  on public.tenants for update using (public.has_tenant_role(id, 'owner'));
create policy "tenants owner delete"  on public.tenants for delete using (public.has_tenant_role(id, 'owner'));

create or replace function public.create_tenant_with_owner(
  p_name     text,
  p_geo      geo_code,
  p_vertical vertical_code
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_user_id   uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;

  insert into public.tenants (name, geo, vertical)
  values (p_name, p_geo, p_vertical)
  returning id into v_tenant_id;

  insert into public.memberships (user_id, tenant_id, role)
  values (v_user_id, v_tenant_id, 'owner');

  return v_tenant_id;
end;
$$;

revoke execute on function public.create_tenant_with_owner(text, geo_code, vertical_code) from public, anon;
grant  execute on function public.create_tenant_with_owner(text, geo_code, vertical_code) to authenticated;

-- ================================================================
-- SUBSCRIPTION PLANS
-- ================================================================
create table public.subscription_plans (
  tier                 plan_tier   primary key,
  display_name         text        not null,
  max_sites            int         not null,
  max_pages            int         not null,
  monthly_ai_credits   int         not null,
  monthly_leads        int         not null,
  price_eur_monthly    int         not null default 0,
  features             jsonb       not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger subscription_plans_set_updated_at
  before update on public.subscription_plans
  for each row execute function public.set_updated_at();

alter table public.subscription_plans enable row level security;
create policy "subscription_plans public read" on public.subscription_plans
  for select to authenticated, anon using (true);

insert into public.subscription_plans
  (tier, display_name, max_sites, max_pages, monthly_ai_credits, monthly_leads, price_eur_monthly, features)
values
  ('free',       'Free',       1,   10,    5000,    10,    0,   '{"diagnostic":true,"auto_apply":false,"reviews":false}'),
  ('starter',    'Starter',    3,   100,   50000,   100,   49,  '{"diagnostic":true,"auto_apply":true,"reviews":false}'),
  ('pro',        'Pro',        10,  1000,  250000,  1000,  149, '{"diagnostic":true,"auto_apply":true,"reviews":true}'),
  ('enterprise', 'Enterprise', 999, 99999, 2000000, 99999, 499, '{"diagnostic":true,"auto_apply":true,"reviews":true,"priority_support":true}')
on conflict (tier) do nothing;

-- ================================================================
-- ONBOARDING SESSIONS
-- ================================================================
create table public.onboarding_sessions (
  id               uuid             primary key default gen_random_uuid(),
  user_id          uuid             not null references auth.users(id) on delete cascade,
  site_url         text,
  geo              geo_code,
  vertical         vertical_code,
  status           onboarding_status not null default 'started',
  wp_probe_result  jsonb,
  tenant_id        uuid             references public.tenants(id) on delete set null,
  created_at       timestamptz      not null default now(),
  expires_at       timestamptz      not null default (now() + interval '14 days')
);

create index onboarding_user_idx on public.onboarding_sessions(user_id, status);
alter table public.onboarding_sessions enable row level security;
create policy "onboarding self all" on public.onboarding_sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ================================================================
-- SITE CONNECTIONS
-- ================================================================
create table public.site_connections (
  id                   uuid              primary key default gen_random_uuid(),
  tenant_id            uuid              not null references public.tenants(id) on delete cascade,
  type                 connection_type   not null,
  status               connection_status not null default 'pending',
  base_url             text,
  username             text,
  external_account_id  text,
  last_probe_at        timestamptz,
  probe_result         jsonb,
  created_at           timestamptz       not null default now()
);

create index site_connections_tenant_idx on public.site_connections(tenant_id, type);
create unique index site_connections_tenant_type_url_uniq
  on public.site_connections (tenant_id, type, base_url)
  where base_url is not null;

alter table public.site_connections enable row level security;
create policy "site_connections member select"    on public.site_connections for select using (public.is_tenant_member(tenant_id));
create policy "site_connections operator write"   on public.site_connections for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- SECRETS VAULT
-- ================================================================
create table public.tenant_secrets (
  id                 uuid        primary key default gen_random_uuid(),
  tenant_id          uuid        not null references public.tenants(id) on delete cascade,
  key                text        not null,
  value_encrypted    text        not null,
  encryption_version int         not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, key)
);

create trigger tenant_secrets_set_updated_at
  before update on public.tenant_secrets for each row execute function public.set_updated_at();
alter table public.tenant_secrets enable row level security;
-- No policies: only service_role can access. RLS enabled + no policies = deny all for authenticated.

create table public.secret_audit_log (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  actor_id    uuid,
  actor_type  text        not null,
  action      text        not null,
  secret_key  text        not null,
  created_at  timestamptz not null default now()
);

create index secret_audit_tenant_idx on public.secret_audit_log(tenant_id, created_at desc);
alter table public.secret_audit_log enable row level security;
create policy "secret_audit member select" on public.secret_audit_log
  for select using (public.is_tenant_member(tenant_id));

-- ================================================================
-- GROWTH GOALS
-- ================================================================
create table public.growth_goals (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references public.tenants(id) on delete cascade,
  title               text,
  target_type         text        not null default 'clients',
  target_count        numeric,
  current_count       numeric,
  timeframe_months    integer,
  lead_value          numeric,
  close_rate          numeric,
  required_leads      numeric,
  service_focus       jsonb       not null default '[]'::jsonb,
  locations           jsonb       not null default '[]'::jsonb,
  good_fit_leads      jsonb       not null default '[]'::jsonb,
  bad_fit_leads       jsonb       not null default '[]'::jsonb,
  capacity_notes      text,
  tracking_notes      text,
  tier                text        check (tier in ('foundation', 'growth', 'authority')),
  notification_email  text,
  notify_on_lead      boolean     not null default false,
  next_call_at        timestamptz,
  call_cadence        text        check (call_cadence in ('monthly', 'quarterly', 'biweekly')),
  status              text        not null default 'draft',
  confidence          numeric,
  source              text        not null default 'operator',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index growth_goals_tenant_status_idx  on public.growth_goals (tenant_id, status);
create index growth_goals_tenant_created_idx on public.growth_goals (tenant_id, created_at desc);
create unique index growth_goals_one_active_per_tenant on public.growth_goals (tenant_id) where status = 'active';

create trigger growth_goals_set_updated_at
  before update on public.growth_goals for each row execute function public.set_updated_at();
alter table public.growth_goals enable row level security;
create policy "growth_goals member select"  on public.growth_goals for select using (public.is_tenant_member(tenant_id));
create policy "growth_goals operator write" on public.growth_goals for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- MASTER PLANS + ITEMS
-- ================================================================
create table public.master_plans (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references public.tenants(id) on delete cascade,
  growth_goal_id    uuid        references public.growth_goals(id) on delete set null,
  status            text        not null default 'draft'
    constraint master_plans_status_check check (status in ('draft', 'active', 'archived')),
  summary           text,
  strategy_summary  text,
  lead_math         jsonb       not null default '{}'::jsonb,
  main_constraints  jsonb       not null default '[]'::jsonb,
  generated_from    jsonb       not null default '{}'::jsonb,
  missing_context   jsonb       not null default '[]'::jsonb,
  confidence        numeric,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index master_plans_tenant_status_idx  on public.master_plans(tenant_id, status);
create index master_plans_tenant_created_idx on public.master_plans(tenant_id, created_at desc);
create unique index master_plans_one_active_per_tenant on public.master_plans(tenant_id) where status = 'active';

create trigger master_plans_set_updated_at
  before update on public.master_plans for each row execute function public.set_updated_at();
alter table public.master_plans enable row level security;
create policy "master_plans member select"  on public.master_plans for select using (public.is_tenant_member(tenant_id));
create policy "master_plans operator write" on public.master_plans for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.masterplan_items (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references public.tenants(id) on delete cascade,
  master_plan_id   uuid        not null references public.master_plans(id) on delete cascade,
  linked_goal_id   uuid        references public.growth_goals(id) on delete set null,
  type             text        not null
    constraint masterplan_items_type_check check (type in ('tracking','service_page','location_page','website_fix','gbp','review','content','conversion','reporting')),
  title            text        not null,
  description      text,
  reason           text,
  priority         text        not null default 'medium'
    constraint masterplan_items_priority_check check (priority in ('low','medium','high','critical')),
  status           text        not null default 'proposed'
    constraint masterplan_items_status_check check (status in ('proposed','approved','in_progress','done','skipped')),
  effort           text        default 'medium'
    constraint masterplan_items_effort_check check (effort in ('low','medium','high')),
  expected_impact  text        default 'medium'
    constraint masterplan_items_impact_check check (expected_impact in ('low','medium','high')),
  source           text        default 'ai'
    constraint masterplan_items_source_check check (source in ('goal','audit','business_profile','page_intelligence','ai','operator')),
  linked_page_id   uuid,
  linked_audit_id  uuid,
  linked_issue_id  text,
  metadata         jsonb       not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index masterplan_items_plan_idx     on public.masterplan_items(tenant_id, master_plan_id);
create index masterplan_items_priority_idx on public.masterplan_items(tenant_id, priority);
create index masterplan_items_status_idx   on public.masterplan_items(tenant_id, status);
create index masterplan_items_type_idx     on public.masterplan_items(tenant_id, type);

create trigger masterplan_items_set_updated_at
  before update on public.masterplan_items for each row execute function public.set_updated_at();
alter table public.masterplan_items enable row level security;
create policy "masterplan_items member select"  on public.masterplan_items for select using (public.is_tenant_member(tenant_id));
create policy "masterplan_items operator write" on public.masterplan_items for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- MARKET INTELLIGENCE
-- ================================================================
create table public.market_scans (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references public.tenants(id) on delete cascade,
  site_id             uuid,
  growth_goal_id      uuid        references public.growth_goals(id) on delete set null,
  status              text        not null default 'draft'
    constraint market_scans_status_chk check (status in ('draft','pending','running','completed','failed','stale')),
  language            text        default 'en',
  country             text,
  region              text,
  vertical            text,
  services            jsonb       not null default '[]'::jsonb,
  locations           jsonb       not null default '[]'::jsonb,
  source              text        not null default 'manual'
    constraint market_scans_source_chk check (source in ('manual','dataforseo','import','synthetic_fixture')),
  scan_started_at     timestamptz,
  scan_completed_at   timestamptz,
  summary             jsonb       not null default '{}'::jsonb,
  confidence          numeric,
  error_message       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_market_scans_tenant_status  on public.market_scans (tenant_id, status);
create index idx_market_scans_tenant_created on public.market_scans (tenant_id, created_at desc);
create index idx_market_scans_tenant_goal    on public.market_scans (tenant_id, growth_goal_id);

create trigger market_scans_set_updated_at
  before update on public.market_scans for each row execute function public.set_updated_at();
alter table public.market_scans enable row level security;
create policy "market_scans member select"  on public.market_scans for select using (public.is_tenant_member(tenant_id));
create policy "market_scans operator write" on public.market_scans for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.market_keywords (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references public.tenants(id) on delete cascade,
  market_scan_id      uuid        not null references public.market_scans(id) on delete cascade,
  service             text,
  location            text,
  keyword             text        not null,
  normalized_keyword  text,
  intent              text
    constraint market_keywords_intent_chk check (intent is null or intent in ('emergency','service','commercial','informational','comparison','branded','unknown')),
  volume              integer,
  difficulty          numeric,
  competition         numeric,
  cpc                 numeric,
  source              text        not null default 'manual',
  confidence          numeric,
  raw                 jsonb       not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create index idx_market_keywords_tenant_scan     on public.market_keywords (tenant_id, market_scan_id);
create index idx_market_keywords_tenant_service  on public.market_keywords (tenant_id, service);
create index idx_market_keywords_tenant_location on public.market_keywords (tenant_id, location);
create index idx_market_keywords_tenant_keyword  on public.market_keywords (tenant_id, keyword);
create index idx_market_keywords_tenant_intent   on public.market_keywords (tenant_id, intent);

alter table public.market_keywords enable row level security;
create policy "market_keywords member select"  on public.market_keywords for select using (public.is_tenant_member(tenant_id));
create policy "market_keywords operator write" on public.market_keywords for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.market_demand_clusters (
  id                      uuid        primary key default gen_random_uuid(),
  tenant_id               uuid        not null references public.tenants(id) on delete cascade,
  market_scan_id          uuid        not null references public.market_scans(id) on delete cascade,
  cluster_name            text        not null,
  service                 text,
  location                text,
  intent                  text,
  total_volume            integer,
  keyword_count           integer,
  average_difficulty      numeric,
  average_competition     numeric,
  opportunity_score       numeric,
  priority                text
    constraint market_demand_clusters_priority_chk check (priority is null or priority in ('low','medium','high','critical')),
  reasoning               jsonb       not null default '[]'::jsonb,
  representative_keywords jsonb       not null default '[]'::jsonb,
  created_at              timestamptz not null default now()
);

create index idx_market_clusters_tenant_scan     on public.market_demand_clusters (tenant_id, market_scan_id);
create index idx_market_clusters_tenant_service  on public.market_demand_clusters (tenant_id, service);
create index idx_market_clusters_tenant_location on public.market_demand_clusters (tenant_id, location);
create index idx_market_clusters_tenant_priority on public.market_demand_clusters (tenant_id, priority);
create index idx_market_clusters_tenant_opp      on public.market_demand_clusters (tenant_id, opportunity_score);

alter table public.market_demand_clusters enable row level security;
create policy "market_clusters member select"  on public.market_demand_clusters for select using (public.is_tenant_member(tenant_id));
create policy "market_clusters operator write" on public.market_demand_clusters for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- COMPETITOR INTELLIGENCE
-- ================================================================
create table public.competitor_scans (
  id                       uuid        primary key default gen_random_uuid(),
  tenant_id                uuid        not null references public.tenants(id) on delete cascade,
  growth_goal_id           uuid        references public.growth_goals(id) on delete set null,
  market_scan_id           uuid        references public.market_scans(id) on delete set null,
  status                   text        not null default 'draft',
  source                   text        default 'dataforseo+firecrawl',
  clusters_scanned         integer,
  serp_results_collected   integer,
  scan_started_at          timestamptz,
  scan_completed_at        timestamptz,
  error_message            text,
  summary                  jsonb       not null default '{}'::jsonb,
  confidence               numeric,
  partial                  boolean     not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index competitor_scans_tenant_status_idx  on public.competitor_scans(tenant_id, status);
create index competitor_scans_tenant_created_idx on public.competitor_scans(tenant_id, created_at desc);
create index competitor_scans_tenant_goal_idx    on public.competitor_scans(tenant_id, growth_goal_id);

create trigger competitor_scans_set_updated_at
  before update on public.competitor_scans for each row execute function public.set_updated_at();
alter table public.competitor_scans enable row level security;
create policy "competitor_scans member select"  on public.competitor_scans for select using (public.is_tenant_member(tenant_id));
create policy "competitor_scans operator write" on public.competitor_scans for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.competitors (
  id                        uuid        primary key default gen_random_uuid(),
  tenant_id                 uuid        not null references public.tenants(id) on delete cascade,
  competitor_scan_id        uuid        not null references public.competitor_scans(id) on delete cascade,
  domain                    text        not null,
  display_name              text,
  is_self                   boolean     not null default false,
  serp_appearance_count     integer     not null default 0,
  clusters_appeared_in      jsonb       not null default '[]'::jsonb,
  gbp_name                  text,
  gbp_rating                numeric,
  gbp_review_count          integer,
  gbp_category              text,
  service_pages_count       integer,
  location_pages_count      integer,
  service_pages_sample      jsonb       not null default '[]'::jsonb,
  location_pages_sample     jsonb       not null default '[]'::jsonb,
  trust_signals             jsonb       not null default '{}'::jsonb,
  competitor_score          numeric,
  score_breakdown           jsonb       not null default '{}'::jsonb,
  score_confidence          numeric,
  data_completeness         numeric,
  error_message             text,
  raw_homepage              jsonb       not null default '{}'::jsonb,
  raw_map                   jsonb       not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index competitors_tenant_scan_idx   on public.competitors(tenant_id, competitor_scan_id);
create index competitors_tenant_domain_idx on public.competitors(tenant_id, domain);
create index competitors_tenant_is_self_idx on public.competitors(tenant_id, is_self);
create index competitors_tenant_score_idx  on public.competitors(tenant_id, competitor_score);

create trigger competitors_set_updated_at
  before update on public.competitors for each row execute function public.set_updated_at();
alter table public.competitors enable row level security;
create policy "competitors member select"  on public.competitors for select using (public.is_tenant_member(tenant_id));
create policy "competitors operator write" on public.competitors for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.competitor_serp_results (
  id                        uuid        primary key default gen_random_uuid(),
  tenant_id                 uuid        not null references public.tenants(id) on delete cascade,
  competitor_scan_id        uuid        not null references public.competitor_scans(id) on delete cascade,
  competitor_id             uuid        references public.competitors(id) on delete set null,
  cluster_key               text,
  keyword                   text,
  location                  text,
  rank                      integer,
  url                       text,
  domain                    text,
  title                     text,
  snippet                   text,
  is_local_pack             boolean     not null default false,
  local_pack_name           text,
  local_pack_rating         numeric,
  local_pack_review_count   integer,
  raw                       jsonb       not null default '{}'::jsonb,
  created_at                timestamptz not null default now()
);

create index competitor_serp_tenant_scan_idx    on public.competitor_serp_results(tenant_id, competitor_scan_id);
create index competitor_serp_tenant_keyword_idx on public.competitor_serp_results(tenant_id, keyword);
create index competitor_serp_tenant_domain_idx  on public.competitor_serp_results(tenant_id, domain);
create index competitor_serp_tenant_pack_idx    on public.competitor_serp_results(tenant_id, is_local_pack);

alter table public.competitor_serp_results enable row level security;
create policy "competitor_serp member select"  on public.competitor_serp_results for select using (public.is_tenant_member(tenant_id));
create policy "competitor_serp operator write" on public.competitor_serp_results for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- GBP PROFILES
-- ================================================================
create table public.gbp_profiles (
  id                      uuid        primary key default gen_random_uuid(),
  tenant_id               uuid        not null references public.tenants(id) on delete cascade,
  site_id                 uuid,
  growth_goal_id          uuid        references public.growth_goals(id) on delete set null,
  status                  text        not null default 'not_connected'
    constraint gbp_profiles_status_chk check (status in ('not_connected','connected','manual_review','reviewed','unavailable')),
  source                  text        not null default 'manual'
    constraint gbp_profiles_source_chk check (source in ('manual','google_api','import','operator_review')),
  business_name           text,
  profile_url             text,
  primary_category        text,
  secondary_categories    jsonb       not null default '[]'::jsonb,
  rating                  numeric,
  review_count            integer,
  review_velocity         jsonb       not null default '{}'::jsonb,
  services                jsonb       not null default '[]'::jsonb,
  service_area            jsonb       not null default '[]'::jsonb,
  address                 text,
  phone                   text,
  website_url             text,
  photos_status           text        default 'unknown'
    constraint gbp_profiles_photos_chk check (photos_status in ('unknown','missing','weak','ok','strong')),
  posts_status            text        default 'unknown'
    constraint gbp_profiles_posts_chk check (posts_status in ('unknown','inactive','occasional','active')),
  nap_consistency         text        default 'unknown'
    constraint gbp_profiles_nap_chk check (nap_consistency in ('unknown','inconsistent','partial','consistent')),
  completeness_score      numeric,
  trust_score             numeric,
  local_visibility_score  numeric,
  gaps                    jsonb       not null default '[]'::jsonb,
  recommendations         jsonb       not null default '[]'::jsonb,
  notes                   text,
  last_reviewed_at        timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index gbp_profiles_tenant_goal_idx    on public.gbp_profiles (tenant_id, growth_goal_id);
create index gbp_profiles_tenant_status_idx  on public.gbp_profiles (tenant_id, status);
create index gbp_profiles_tenant_created_idx on public.gbp_profiles (tenant_id, created_at desc);

create trigger gbp_profiles_set_updated_at
  before update on public.gbp_profiles for each row execute function public.set_updated_at();
alter table public.gbp_profiles enable row level security;
create policy "gbp_profiles member select"  on public.gbp_profiles for select using (public.is_tenant_member(tenant_id));
create policy "gbp_profiles operator write" on public.gbp_profiles for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- BUSINESS PROFILE (v1 kept for backward compat)
-- ================================================================
create table public.business_profiles (
  id                    uuid        primary key default gen_random_uuid(),
  tenant_id             uuid        not null unique references public.tenants(id) on delete cascade,
  business_name         text,
  industry              text,
  primary_offer         text,
  secondary_offers      jsonb       not null default '[]'::jsonb,
  target_audience       jsonb       not null default '[]'::jsonb,
  service_areas         jsonb       not null default '[]'::jsonb,
  unique_value_proposition text,
  main_promise          text,
  proof_points          jsonb       not null default '[]'::jsonb,
  avoid_claims          jsonb       not null default '[]'::jsonb,
  preferred_cta         text,
  tone_preference       text,
  language              text        not null default 'nl',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger business_profiles_set_updated_at
  before update on public.business_profiles for each row execute function public.set_updated_at();
alter table public.business_profiles enable row level security;
create policy "business_profiles member select"  on public.business_profiles for select using (public.is_tenant_member(tenant_id));
create policy "business_profiles operator write" on public.business_profiles for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- BUSINESS PROFILE V2
-- ================================================================
create table public.business_profiles_v2 (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null unique references public.tenants(id) on delete cascade,
  status              text        not null default 'draft',
  confidence_score    numeric     not null default 0,
  confidence_reasons  jsonb       not null default '{}'::jsonb,
  business_identity   jsonb       not null default '{}'::jsonb,
  offer_profile       jsonb       not null default '{}'::jsonb,
  icp_profile         jsonb       not null default '{}'::jsonb,
  location_profile    jsonb       not null default '{}'::jsonb,
  conversion_profile  jsonb       not null default '{}'::jsonb,
  proof_profile       jsonb       not null default '{}'::jsonb,
  claim_guardrails    jsonb       not null default '{}'::jsonb,
  strategy_angles     jsonb       not null default '[]'::jsonb,
  missing_context     jsonb       not null default '[]'::jsonb,
  source_map          jsonb       not null default '{}'::jsonb,
  confidence_map      jsonb       not null default '{}'::jsonb,
  locked_fields       jsonb       not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger bpv2_set_updated_at
  before update on public.business_profiles_v2 for each row execute function public.set_updated_at();
alter table public.business_profiles_v2 enable row level security;
create policy "bpv2 member select"  on public.business_profiles_v2 for select using (public.is_tenant_member(tenant_id));
create policy "bpv2 operator write" on public.business_profiles_v2 for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.business_profile_suggestions (
  id                    uuid        primary key default gen_random_uuid(),
  tenant_id             uuid        not null references public.tenants(id) on delete cascade,
  business_profile_id   uuid        references public.business_profiles_v2(id) on delete cascade,
  section               text        not null,
  field_path            text        not null,
  suggested_value       jsonb       not null,
  current_value         jsonb,
  source_evidence       jsonb       not null default '[]'::jsonb,
  confidence            numeric     not null default 0,
  rationale             text,
  status                text        not null default 'pending',
  source_type           text        not null default 'evidence_based'
    constraint business_profile_suggestions_source_type_check
      check (source_type in ('evidence_based','inferred','recommended','missing')),
  requires_review       boolean     not null default false,
  can_use_in_proposals  boolean     not null default true,
  created_at            timestamptz not null default now(),
  decided_at            timestamptz,
  decided_by            uuid        references auth.users(id)
);

create index bps_tenant_status_idx           on public.business_profile_suggestions(tenant_id, status);
create index idx_bps_tenant_field_status      on public.business_profile_suggestions (tenant_id, field_path, status);
create index idx_bps_tenant_status_sourcetype on public.business_profile_suggestions (tenant_id, status, source_type);

alter table public.business_profile_suggestions enable row level security;
create policy "bps member select"  on public.business_profile_suggestions for select using (public.is_tenant_member(tenant_id));
create policy "bps operator write" on public.business_profile_suggestions for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.business_profile_feedback (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references public.tenants(id) on delete cascade,
  suggestion_id   uuid        references public.business_profile_suggestions(id) on delete set null,
  feedback_type   text        not null,
  field_path      text,
  before_value    jsonb,
  after_value     jsonb,
  reason          text,
  created_at      timestamptz not null default now(),
  created_by      uuid        references auth.users(id)
);

create index idx_bpf_tenant_field_type on public.business_profile_feedback (tenant_id, field_path, feedback_type);

alter table public.business_profile_feedback enable row level security;
create policy "bpf member select"  on public.business_profile_feedback for select using (public.is_tenant_member(tenant_id));
create policy "bpf operator write" on public.business_profile_feedback for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.business_profile_analyzer_jobs (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references public.tenants(id) on delete cascade,
  created_by    uuid        references auth.users(id) on delete set null,
  status        text        not null default 'queued'
    check (status in ('queued','running','succeeded','failed')),
  stage         text        not null default 'queued',
  started_at    timestamptz,
  finished_at   timestamptz,
  result        jsonb       not null default '{}'::jsonb,
  error_message text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index bp_analyzer_jobs_tenant_status_idx on public.business_profile_analyzer_jobs (tenant_id, status, created_at desc);
create index bp_analyzer_jobs_creator_idx       on public.business_profile_analyzer_jobs (created_by, created_at desc);

create trigger bp_analyzer_jobs_set_updated_at
  before update on public.business_profile_analyzer_jobs for each row execute function public.set_updated_at();
alter table public.business_profile_analyzer_jobs enable row level security;
create policy "bp_analyzer_jobs member select"  on public.business_profile_analyzer_jobs for select using (public.is_tenant_member(tenant_id));
create policy "bp_analyzer_jobs operator insert" on public.business_profile_analyzer_jobs for insert
  with check (public.has_tenant_min_role(tenant_id, 'operator') and created_by = auth.uid());

-- ================================================================
-- BRAND VOICE (v1)
-- ================================================================
create table public.brand_voice_profiles (
  id              uuid                    primary key default gen_random_uuid(),
  tenant_id       uuid                    not null unique references public.tenants(id) on delete cascade,
  tone_summary    text,
  writing_style   jsonb                   not null default '{}'::jsonb,
  preferred_words jsonb                   not null default '[]'::jsonb,
  forbidden_words jsonb                   not null default '[]'::jsonb,
  example_phrases jsonb                   not null default '[]'::jsonb,
  reading_level   text,
  language        text                    not null default 'nl',
  source_urls     jsonb                   not null default '[]'::jsonb,
  job_status      brand_voice_job_status  not null default 'queued',
  job_error       text,
  analyzed_at     timestamptz,
  created_at      timestamptz             not null default now(),
  updated_at      timestamptz             not null default now()
);

create trigger brand_voice_profiles_set_updated_at
  before update on public.brand_voice_profiles for each row execute function public.set_updated_at();
alter table public.brand_voice_profiles enable row level security;
create policy "brand_voice_profiles member select"  on public.brand_voice_profiles for select using (public.is_tenant_member(tenant_id));
create policy "brand_voice_profiles operator write" on public.brand_voice_profiles for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- TONE PROFILES
-- ================================================================
create table public.tone_profiles (
  id               uuid                  primary key default gen_random_uuid(),
  tenant_id        uuid                  not null unique references public.tenants(id) on delete cascade,
  status           tone_profile_status   not null default 'draft',
  language         text                  not null default 'nl',
  locale           text                  not null default 'nl-NL',
  profile          jsonb                 not null default '{}'::jsonb,
  locked_fields    jsonb                 not null default '[]'::jsonb,
  confidence_score numeric,
  source_summary   jsonb                 not null default '{}'::jsonb,
  job_status       tone_job_status       not null default 'queued',
  job_error        text,
  analyzed_at      timestamptz,
  created_at       timestamptz           not null default now(),
  updated_at       timestamptz           not null default now()
);

create trigger tone_profiles_set_updated_at
  before update on public.tone_profiles for each row execute function public.set_updated_at();
alter table public.tone_profiles enable row level security;
create policy "tone_profiles member select"  on public.tone_profiles for select using (public.is_tenant_member(tenant_id));
create policy "tone_profiles operator write" on public.tone_profiles for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.tone_profile_samples (
  id               uuid                primary key default gen_random_uuid(),
  tenant_id        uuid                not null references public.tenants(id) on delete cascade,
  tone_profile_id  uuid                not null references public.tone_profiles(id) on delete cascade,
  source_type      tone_sample_source  not null,
  source_url       text,
  text             text                not null,
  quality_score    numeric,
  weight           numeric             not null default 1,
  analysis         jsonb               not null default '{}'::jsonb,
  created_at       timestamptz         not null default now()
);

create index tone_profile_samples_profile_idx on public.tone_profile_samples(tone_profile_id);
alter table public.tone_profile_samples enable row level security;
create policy "tone_profile_samples member select"  on public.tone_profile_samples for select using (public.is_tenant_member(tenant_id));
create policy "tone_profile_samples operator write" on public.tone_profile_samples for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.tone_feedback_examples (
  id               uuid                primary key default gen_random_uuid(),
  tenant_id        uuid                not null references public.tenants(id) on delete cascade,
  tone_profile_id  uuid                references public.tone_profiles(id) on delete set null,
  example_type     tone_feedback_type  not null,
  before_text      text,
  after_text       text,
  reason           text,
  proposal_id      uuid,
  created_at       timestamptz         not null default now()
);

create index tone_feedback_examples_profile_idx on public.tone_feedback_examples(tone_profile_id);
create index tone_feedback_examples_tenant_idx  on public.tone_feedback_examples(tenant_id);
alter table public.tone_feedback_examples enable row level security;
create policy "tone_feedback_examples member select"  on public.tone_feedback_examples for select using (public.is_tenant_member(tenant_id));
create policy "tone_feedback_examples operator write" on public.tone_feedback_examples for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- PAGES & SNAPSHOTS
-- ================================================================
create table public.pages (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null references public.tenants(id) on delete cascade,
  site_connection_id   uuid        references public.site_connections(id) on delete set null,
  wp_post_id           bigint,
  url                  text        not null,
  title                text,
  template             text,
  meta_description     text,
  h1                   text,
  status_code          integer,
  images_without_alt   integer,
  last_audited_at      timestamptz,
  health_score         int,
  created_at           timestamptz not null default now()
);

create index pages_tenant_idx on public.pages(tenant_id);
create unique index pages_tenant_url_uniq on public.pages(tenant_id, url);

alter table public.pages enable row level security;
create policy "pages member select"  on public.pages for select using (public.is_tenant_member(tenant_id));
create policy "pages operator write" on public.pages for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.page_snapshots (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  page_id     uuid        not null references public.pages(id) on delete cascade,
  html        text,
  meta        jsonb,
  screenshot_path text,
  created_at  timestamptz not null default now()
);

create index page_snapshots_page_idx on public.page_snapshots(page_id, created_at desc);
alter table public.page_snapshots enable row level security;
create policy "page_snapshots member select" on public.page_snapshots for select using (public.is_tenant_member(tenant_id));

-- ================================================================
-- SCANS / ISSUES / HEALTH
-- ================================================================
create table public.scans (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  engine      text        not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text        not null default 'running'
);

create index scans_tenant_idx on public.scans(tenant_id, started_at desc);
alter table public.scans enable row level security;
create policy "scans member select" on public.scans for select using (public.is_tenant_member(tenant_id));

create table public.issues (
  id           uuid           primary key default gen_random_uuid(),
  tenant_id    uuid           not null references public.tenants(id) on delete cascade,
  scan_id      uuid           references public.scans(id) on delete cascade,
  page_id      uuid           references public.pages(id) on delete set null,
  code         text           not null,
  severity     issue_severity not null,
  title        text           not null,
  details      jsonb,
  resolved_at  timestamptz
);

create index issues_tenant_open_idx on public.issues(tenant_id) where resolved_at is null;
alter table public.issues enable row level security;
create policy "issues member select" on public.issues for select using (public.is_tenant_member(tenant_id));

create table public.health_scores (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references public.tenants(id) on delete cascade,
  category     text        not null,
  score        int         not null,
  measured_at  timestamptz not null default now()
);

create index health_scores_tenant_idx on public.health_scores(tenant_id, measured_at desc);
alter table public.health_scores enable row level security;
create policy "health_scores member select" on public.health_scores for select using (public.is_tenant_member(tenant_id));

-- ================================================================
-- AUDITS
-- ================================================================
create table public.audits (
  id                  uuid         primary key default gen_random_uuid(),
  tenant_id           uuid         not null references public.tenants(id) on delete cascade,
  site_connection_id  uuid         not null references public.site_connections(id) on delete cascade,
  status              audit_status not null default 'queued',
  started_at          timestamptz,
  finished_at         timestamptz,
  pages_count         integer      not null default 0,
  summary             jsonb        not null default '{}'::jsonb,
  error               text,
  created_at          timestamptz  not null default now()
);

create index audits_tenant_site_idx on public.audits(tenant_id, site_connection_id, created_at desc);
alter table public.audits enable row level security;
create policy "audits member select"  on public.audits for select using (public.is_tenant_member(tenant_id));
create policy "audits operator write" on public.audits for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.audit_pages (
  id                    uuid        primary key default gen_random_uuid(),
  audit_id              uuid        not null references public.audits(id) on delete cascade,
  tenant_id             uuid        not null references public.tenants(id) on delete cascade,
  page_id               uuid        references public.pages(id) on delete set null,
  url                   text        not null,
  status_code           integer,
  title                 text,
  meta_description      text,
  h1                    text,
  schema                jsonb,
  images_without_alt    integer     not null default 0,
  internal_links_count  integer     not null default 0,
  external_links_count  integer     not null default 0,
  word_count            integer     not null default 0,
  issues                jsonb       not null default '[]'::jsonb,
  fetched_at            timestamptz not null default now()
);

create index audit_pages_audit_idx  on public.audit_pages(audit_id);
create index audit_pages_tenant_idx on public.audit_pages(tenant_id);
alter table public.audit_pages enable row level security;
create policy "audit_pages member select"  on public.audit_pages for select using (public.is_tenant_member(tenant_id));
create policy "audit_pages operator write" on public.audit_pages for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- PAGE INTELLIGENCE
-- ================================================================
create table public.page_intelligence (
  id                        uuid        primary key default gen_random_uuid(),
  tenant_id                 uuid        not null references public.tenants(id) on delete cascade,
  page_id                   uuid        references public.pages(id) on delete set null,
  audit_page_id             uuid        references public.audit_pages(id) on delete set null,
  audit_id                  uuid        references public.audits(id) on delete cascade,
  page_url                  text,
  page_type                 text        not null default 'other'
    constraint page_intelligence_page_type_chk
      check (page_type in ('homepage','service','location','blog','contact','about','faq','pricing','case_study','legal','landing','category','other')),
  intent                    text        not null default 'informational'
    constraint page_intelligence_intent_chk
      check (intent in ('informational','commercial','local','trust','conversion','support','navigational')),
  commercial_priority       text        not null default 'medium'
    constraint page_intelligence_priority_chk
      check (commercial_priority in ('low','medium','high','critical')),
  seo_role                  text
    constraint page_intelligence_seo_role_chk
      check (seo_role is null or seo_role in ('rank_target','supporting_content','conversion_page','trust_page','navigation_page')),
  target_keyword            text,
  target_audience           text,
  desired_action            text,
  funnel_stage              text,
  summary                   text,
  primary_topic             text,
  content_summary           text,
  recommended_cta           text,
  relevant_strategy_angle   text,
  local_relevance           jsonb       not null default '{}'::jsonb,
  risk_flags                jsonb       not null default '[]'::jsonb,
  missing_page_context      jsonb       not null default '[]'::jsonb,
  confidence                numeric     not null default 0,
  source_evidence           jsonb       not null default '[]'::jsonb,
  model_used                text,
  analyzed_at               timestamptz not null default now(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint page_intelligence_tenant_page_uniq unique (tenant_id, page_id)
);

create index page_intelligence_audit_page_id_idx  on public.page_intelligence(audit_page_id);
create index page_intelligence_tenant_audit_idx   on public.page_intelligence (tenant_id, audit_id);
create index page_intelligence_tenant_priority_idx on public.page_intelligence (tenant_id, commercial_priority);
create index page_intelligence_tenant_type_idx    on public.page_intelligence (tenant_id, page_type);

create trigger page_intelligence_set_updated_at
  before update on public.page_intelligence for each row execute function public.set_updated_at();
alter table public.page_intelligence enable row level security;
create policy "page_intelligence member select"  on public.page_intelligence for select using (public.is_tenant_member(tenant_id));
create policy "page_intelligence operator write" on public.page_intelligence for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- FIX PROPOSALS
-- ================================================================
create table public.fix_proposal_groups (
  id              uuid             primary key default gen_random_uuid(),
  tenant_id       uuid             not null references public.tenants(id) on delete cascade,
  audit_id        uuid             not null references public.audits(id) on delete cascade,
  page_id         uuid             references public.pages(id) on delete set null,
  audit_page_id   uuid             references public.audit_pages(id) on delete set null,
  theme           text             not null,
  status          proposal_status  not null default 'draft',
  created_at      timestamptz      not null default now()
);

create index idx_fpg_audit  on public.fix_proposal_groups(audit_id);
create index idx_fpg_tenant on public.fix_proposal_groups(tenant_id);
alter table public.fix_proposal_groups enable row level security;
create policy "fpg member select"  on public.fix_proposal_groups for select using (public.is_tenant_member(tenant_id));
create policy "fpg operator write" on public.fix_proposal_groups for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.fix_proposals (
  id              uuid           primary key default gen_random_uuid(),
  tenant_id       uuid           not null references public.tenants(id) on delete cascade,
  group_id        uuid           not null references public.fix_proposal_groups(id) on delete cascade,
  audit_page_id   uuid           references public.audit_pages(id) on delete set null,
  page_id         uuid           references public.pages(id) on delete set null,
  issue_code      text           not null,
  proposal_type   proposal_type  not null,
  before          jsonb          not null default '{}'::jsonb,
  after           jsonb          not null default '{}'::jsonb,
  rationale       text           not null default '',
  confidence      numeric(3,2)   not null default 0.5,
  status          proposal_status not null default 'draft',
  decided_at      timestamptz,
  decided_by      uuid,
  created_at      timestamptz    not null default now()
);

create index idx_fp_group  on public.fix_proposals(group_id);
create index idx_fp_tenant on public.fix_proposals(tenant_id);
create index idx_fp_status on public.fix_proposals(status);
alter table public.fix_proposals enable row level security;
create policy "fp member select"  on public.fix_proposals for select using (public.is_tenant_member(tenant_id));
create policy "fp operator write" on public.fix_proposals for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.proposal_quality_checks (
  id                    uuid        primary key default gen_random_uuid(),
  tenant_id             uuid        not null references public.tenants(id) on delete cascade,
  proposal_id           uuid        not null unique references public.fix_proposals(id) on delete cascade,
  brand_fit_score       numeric(3,1),
  seo_fit_score         numeric(3,1),
  commercial_fit_score  numeric(3,1),
  clarity_score         numeric(3,1),
  quality_score         numeric(3,1),
  risk_flags            jsonb       not null default '[]'::jsonb,
  verdict               text        not null default 'needs_review'
    check (verdict in ('publishable','needs_review','rejected')),
  publishable           boolean     not null default false,
  created_at            timestamptz not null default now()
);

alter table public.proposal_quality_checks enable row level security;
create policy "proposal_quality_checks member select"  on public.proposal_quality_checks for select using (public.is_tenant_member(tenant_id));
create policy "proposal_quality_checks operator write" on public.proposal_quality_checks for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- PROPOSAL V2
-- ================================================================
create table public.proposal_v2 (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null references public.tenants(id) on delete cascade,
  audit_id             uuid        references public.audits(id) on delete cascade,
  page_id              uuid        references public.pages(id) on delete set null,
  issue_id             text,
  action_type          text        not null,
  origin               text        not null default 'audit_issue',
  masterplan_item_id   uuid        references public.masterplan_items(id) on delete set null,
  growth_goal_id       uuid        references public.growth_goals(id) on delete set null,
  proposal_run_id      uuid,
  status               text        not null default 'draft',
  title                text        not null default '',
  summary              text        not null default '',
  reasoning            text        not null default '',
  before               jsonb       not null default '{}'::jsonb,
  after                jsonb       not null default '{}'::jsonb,
  scores               jsonb       not null default '{}'::jsonb,
  context_used         jsonb       not null default '{}'::jsonb,
  keywords_used        jsonb       not null default '[]'::jsonb,
  risk_flags           jsonb       not null default '[]'::jsonb,
  context_snapshot     jsonb       not null default '{}'::jsonb,
  publishable          boolean     not null default false,
  block_reason         text,
  approved_at          timestamptz,
  approved_by          uuid,
  approval_notes       text,
  rejected_at          timestamptz,
  rejected_by          uuid,
  rejection_reason     text,
  model_used           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint proposal_v2_origin_fields_chk check (
    (origin = 'audit_issue' and audit_id is not null and page_id is not null and issue_id is not null)
    or (origin = 'masterplan_item' and masterplan_item_id is not null)
    or (origin = 'manual')
  )
);

create index proposal_v2_audit_page_idx          on public.proposal_v2 (audit_id, page_id);
create index proposal_v2_tenant_idx              on public.proposal_v2 (tenant_id);
create index proposal_v2_run_idx                 on public.proposal_v2 (audit_id, proposal_run_id, created_at desc);
create index proposal_v2_audit_created_idx       on public.proposal_v2 (audit_id, created_at desc);
create index idx_proposal_v2_status_tenant       on public.proposal_v2 (tenant_id, status);
create index idx_proposal_v2_ready_for_publishing on public.proposal_v2 (tenant_id) where status = 'ready_for_publishing';
create index proposal_v2_tenant_masterplan_item_idx on public.proposal_v2 (tenant_id, masterplan_item_id);
create index proposal_v2_tenant_origin_idx       on public.proposal_v2 (tenant_id, origin);

create trigger proposal_v2_set_updated_at
  before update on public.proposal_v2 for each row execute function public.set_updated_at();
alter table public.proposal_v2 enable row level security;
create policy "proposal_v2 member select"  on public.proposal_v2 for select using (public.is_tenant_member(tenant_id));
create policy "proposal_v2 operator write" on public.proposal_v2 for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.proposal_comparisons (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references public.tenants(id) on delete cascade,
  audit_id        uuid        not null references public.audits(id) on delete cascade,
  page_id         uuid        not null references public.pages(id) on delete cascade,
  issue_id        text        not null,
  action_type     text,
  proposal_v1_id  uuid        references public.fix_proposals(id) on delete set null,
  proposal_v2_id  uuid        references public.proposal_v2(id) on delete set null,
  v2_run_id       uuid,
  winner          text        not null default 'unreviewed'
    check (winner in ('unreviewed','v1','v2','both_bad','both_good','needs_edit')),
  reason          text,
  reason_tags     jsonb       not null default '[]'::jsonb,
  score_mismatch  boolean     not null default false,
  notes           text,
  reviewed_at     timestamptz,
  reviewed_by     uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index proposal_comparisons_unique_per_v2
  on public.proposal_comparisons (tenant_id, audit_id, page_id, issue_id, proposal_v2_id)
  nulls not distinct;
create index idx_proposal_comparisons_audit on public.proposal_comparisons (audit_id);
create index idx_proposal_comparisons_tenant on public.proposal_comparisons (tenant_id);
create index idx_proposal_comparisons_run on public.proposal_comparisons (tenant_id, audit_id, v2_run_id);
create index idx_proposal_comparisons_v2  on public.proposal_comparisons (tenant_id, audit_id, proposal_v2_id);

create trigger proposal_comparisons_set_updated_at
  before update on public.proposal_comparisons for each row execute function public.set_updated_at();
alter table public.proposal_comparisons enable row level security;
create policy "proposal_comparisons member select"  on public.proposal_comparisons for select using (public.is_tenant_member(tenant_id));
create policy "proposal_comparisons operator write" on public.proposal_comparisons for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- CHANGE MANAGEMENT
-- ================================================================
create table public.change_groups (
  id                  uuid          primary key default gen_random_uuid(),
  tenant_id           uuid          not null references public.tenants(id) on delete cascade,
  page_id             uuid          references public.pages(id) on delete cascade,
  action_type         action_type   not null,
  risk_level          text          not null default 'low',
  requires_approval   boolean       not null default true,
  rollback_strategy   text          not null default 'snapshot_restore',
  status              change_status not null default 'proposed',
  created_at          timestamptz   not null default now()
);

create index change_groups_tenant_idx on public.change_groups(tenant_id, status);
alter table public.change_groups enable row level security;
create policy "change_groups member select"  on public.change_groups for select using (public.is_tenant_member(tenant_id));
create policy "change_groups approver write" on public.change_groups for update
  using (public.has_tenant_min_role(tenant_id, 'client_approver'))
  with check (public.has_tenant_min_role(tenant_id, 'client_approver'));

create table public.changes (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null references public.tenants(id) on delete cascade,
  change_group_id      uuid        not null references public.change_groups(id) on delete cascade,
  field                text        not null,
  diff                 jsonb       not null,
  before_snapshot_id   uuid        references public.page_snapshots(id),
  after_snapshot_id    uuid        references public.page_snapshots(id),
  created_at           timestamptz not null default now()
);

create index changes_group_idx on public.changes(change_group_id);
alter table public.changes enable row level security;
create policy "changes member select" on public.changes for select using (public.is_tenant_member(tenant_id));

create table public.wp_write_operations (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references public.tenants(id) on delete cascade,
  change_group_id  uuid        references public.change_groups(id) on delete set null,
  wp_post_id       bigint,
  operation        text        not null,
  request          jsonb       not null,
  response         jsonb,
  http_status      int,
  status           text        not null default 'pending',
  error            text,
  created_at       timestamptz not null default now()
);

create index wp_write_ops_tenant_idx on public.wp_write_operations(tenant_id, created_at desc);
alter table public.wp_write_operations enable row level security;
create policy "wp_write_ops member select" on public.wp_write_operations for select using (public.is_tenant_member(tenant_id));

-- ================================================================
-- WORDPRESS INTEGRATION
-- ================================================================
create table public.wordpress_connections (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references public.tenants(id) on delete cascade,
  site_connection_id  uuid        not null unique references public.site_connections(id) on delete cascade,
  site_id             uuid,
  kind                text        not null default 'self_hosted'
    constraint wordpress_connections_kind_chk check (kind in ('self_hosted', 'wordpress_com')),
  base_url            text        not null,
  rest_base_url       text,
  status              text        not null default 'not_connected'
    constraint wordpress_connections_status_chk
      check (status in ('not_connected', 'connected', 'failed', 'needs_review', 'revoked')),
  capabilities        jsonb       not null default '{}'::jsonb,
  last_checked_at     timestamptz,
  error_message       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_wordpress_connections_tenant        on public.wordpress_connections (tenant_id);
create index idx_wordpress_connections_tenant_status on public.wordpress_connections (tenant_id, status);
create index idx_wordpress_connections_site_conn     on public.wordpress_connections (site_connection_id);

create trigger wordpress_connections_set_updated_at
  before update on public.wordpress_connections for each row execute function public.set_updated_at();
alter table public.wordpress_connections enable row level security;
create policy "wordpress_connections member select"  on public.wordpress_connections for select using (public.is_tenant_member(tenant_id));
create policy "wordpress_connections operator write" on public.wordpress_connections for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.wordpress_site_inventory (
  id                        uuid        primary key default gen_random_uuid(),
  tenant_id                 uuid        not null references public.tenants(id) on delete cascade,
  wordpress_connection_id   uuid        not null references public.wordpress_connections(id) on delete cascade,
  site_connection_id        uuid        not null references public.site_connections(id) on delete cascade,
  site_id                   uuid,
  wp_post_id                bigint      not null,
  post_type                 text        not null,
  status                    text,
  title                     text,
  slug                      text,
  link                      text,
  parent_id                 bigint,
  template                  text,
  modified_at               timestamptz,
  content_hash              text,
  raw                       jsonb       not null default '{}'::jsonb,
  mapped_page_role          text,
  last_synced_at            timestamptz not null default now(),
  last_optimized_at         timestamptz,
  last_optimized_by         uuid,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique(wordpress_connection_id, wp_post_id, post_type)
);

create index idx_wp_inventory_tenant_conn   on public.wordpress_site_inventory (tenant_id, wordpress_connection_id);
create index idx_wp_inventory_tenant_type   on public.wordpress_site_inventory (tenant_id, post_type);
create index idx_wp_inventory_tenant_status on public.wordpress_site_inventory (tenant_id, status);
create index idx_wp_inventory_slug          on public.wordpress_site_inventory (wordpress_connection_id, slug);

create trigger wordpress_site_inventory_set_updated_at
  before update on public.wordpress_site_inventory for each row execute function public.set_updated_at();
alter table public.wordpress_site_inventory enable row level security;
create policy "wordpress_site_inventory member select"  on public.wordpress_site_inventory for select using (public.is_tenant_member(tenant_id));
create policy "wordpress_site_inventory operator write" on public.wordpress_site_inventory for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.wordpress_page_mappings (
  id                        uuid        primary key default gen_random_uuid(),
  tenant_id                 uuid        not null references public.tenants(id) on delete cascade,
  wordpress_connection_id   uuid        not null references public.wordpress_connections(id) on delete cascade,
  inventory_id              uuid        references public.wordpress_site_inventory(id) on delete cascade,
  page_intelligence_id      uuid        references public.page_intelligence(id) on delete set null,
  masterplan_item_id        uuid        references public.masterplan_items(id) on delete set null,
  mapping_type              text        not null
    constraint wordpress_page_mappings_type_chk
      check (mapping_type in ('existing_page', 'missing_page', 'candidate_match', 'manual_match')),
  target_service            text,
  target_location           text,
  confidence                numeric     not null default 0,
  reasons                   jsonb       not null default '[]'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index idx_wp_mappings_tenant_conn on public.wordpress_page_mappings (tenant_id, wordpress_connection_id);
create index idx_wp_mappings_type        on public.wordpress_page_mappings (tenant_id, mapping_type);
create index idx_wp_mappings_inventory   on public.wordpress_page_mappings (inventory_id);
create index idx_wp_mappings_masterplan  on public.wordpress_page_mappings (masterplan_item_id);

create trigger wordpress_page_mappings_set_updated_at
  before update on public.wordpress_page_mappings for each row execute function public.set_updated_at();
alter table public.wordpress_page_mappings enable row level security;
create policy "wordpress_page_mappings member select"  on public.wordpress_page_mappings for select using (public.is_tenant_member(tenant_id));
create policy "wordpress_page_mappings operator write" on public.wordpress_page_mappings for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- PAGE OPTIMIZATION SNAPSHOTS (before execution_artifacts — FK dependency)
-- ================================================================
create table public.page_optimization_snapshots (
  id                        uuid        primary key default gen_random_uuid(),
  tenant_id                 uuid        not null references public.tenants(id) on delete cascade,
  wordpress_connection_id   uuid        not null references public.wordpress_connections(id) on delete cascade,
  wp_post_id                bigint      not null,
  wp_post_type              text        not null default 'page',
  wp_status                 text,
  title                     text,
  slug                      text,
  link                      text,
  excerpt                   text,
  raw_content               text,
  rendered_content          text,
  detected_builder          text,
  eligibility_status        text        not null
    check (eligibility_status in ('safe', 'meta_only', 'manual_mode', 'blocked')),
  content_hash              text        not null,
  fetched_at                timestamptz not null default now(),
  created_at                timestamptz not null default now()
);

create index idx_pos_tenant_id on public.page_optimization_snapshots(tenant_id);
create index idx_pos_conn_post  on public.page_optimization_snapshots(wordpress_connection_id, wp_post_id);

alter table public.page_optimization_snapshots enable row level security;
create policy "pos_member_select"   on public.page_optimization_snapshots for select   using (public.is_tenant_member(tenant_id));
create policy "pos_operator_insert" on public.page_optimization_snapshots for insert   with check (public.has_tenant_min_role(tenant_id, 'operator'));
create policy "pos_operator_update" on public.page_optimization_snapshots for update   using (public.has_tenant_min_role(tenant_id, 'operator'));
create policy "pos_operator_delete" on public.page_optimization_snapshots for delete   using (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- EXECUTION ARTIFACTS
-- ================================================================
create table public.execution_artifacts (
  id                    uuid        primary key default gen_random_uuid(),
  tenant_id             uuid        not null references public.tenants(id) on delete cascade,
  masterplan_item_id    uuid        not null references public.masterplan_items(id) on delete cascade,
  growth_goal_id        uuid        references public.growth_goals(id) on delete set null,
  before_snapshot_ref   uuid        references public.page_optimization_snapshots(id) on delete set null,
  artifact_type         text        not null
    constraint execution_artifacts_type_chk
      check (artifact_type in ('page_brief','page_optimization_brief','cta_recommendation','gbp_checklist','tracking_checklist','review_flow','report_brief')),
  status                text        not null default 'draft'
    constraint execution_artifacts_status_chk
      check (status in ('draft', 'needs_review', 'approved', 'rejected')),
  payload               jsonb       not null default '{}'::jsonb,
  quality_gates         jsonb       not null default '{}'::jsonb,
  delivery_readiness    jsonb       not null default '{}'::jsonb,
  risk_flags            jsonb       not null default '[]'::jsonb,
  missing_context       jsonb       not null default '[]'::jsonb,
  generated_from        jsonb       not null default '{}'::jsonb,
  delivery_status       text,
  delivered_at          timestamptz,
  delivered_by          uuid,
  delivered_url         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_execution_artifacts_tenant_item   on public.execution_artifacts (tenant_id, masterplan_item_id);
create index idx_execution_artifacts_tenant_status on public.execution_artifacts (tenant_id, status);
create index idx_execution_artifacts_tenant_type   on public.execution_artifacts (tenant_id, artifact_type);

create trigger execution_artifacts_set_updated_at
  before update on public.execution_artifacts for each row execute function public.set_updated_at();
alter table public.execution_artifacts enable row level security;
create policy "execution_artifacts member select"  on public.execution_artifacts for select using (public.is_tenant_member(tenant_id));
create policy "execution_artifacts operator write" on public.execution_artifacts for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.wordpress_page_updates (
  id                        uuid        primary key default gen_random_uuid(),
  tenant_id                 uuid        not null references public.tenants(id) on delete cascade,
  execution_artifact_id     uuid        references public.execution_artifacts(id) on delete set null,
  snapshot_id               uuid        references public.page_optimization_snapshots(id) on delete set null,
  wordpress_connection_id   uuid        not null references public.wordpress_connections(id) on delete cascade,
  wp_post_id                bigint      not null,
  status                    text        not null default 'applied'
    check (status in ('pending', 'applied', 'failed')),
  applied_at                timestamptz,
  applied_by                uuid,
  update_source             text        not null default 'leadlayer_update',
  fields_updated            jsonb       not null default '[]'::jsonb,
  error_message             text,
  raw_response              jsonb       not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index idx_wpu_tenant_id   on public.wordpress_page_updates(tenant_id);
create index idx_wpu_artifact_id on public.wordpress_page_updates(execution_artifact_id);
create index idx_wpu_snapshot_id on public.wordpress_page_updates(snapshot_id);

create trigger wordpress_page_updates_set_updated_at
  before update on public.wordpress_page_updates for each row execute function public.set_updated_at();
alter table public.wordpress_page_updates enable row level security;
create policy "wpu_member_select"   on public.wordpress_page_updates for select using (public.is_tenant_member(tenant_id));
create policy "wpu_operator_insert" on public.wordpress_page_updates for insert with check (public.has_tenant_min_role(tenant_id, 'operator'));
create policy "wpu_operator_update" on public.wordpress_page_updates for update using (public.has_tenant_min_role(tenant_id, 'operator'));
create policy "wpu_operator_delete" on public.wordpress_page_updates for delete using (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- PUBLISHING PIPELINE
-- ================================================================
create table public.publishing_bundles (
  id                      uuid        primary key default gen_random_uuid(),
  tenant_id               uuid        not null references public.tenants(id) on delete cascade,
  execution_artifact_id   uuid        not null references public.execution_artifacts(id) on delete cascade,
  masterplan_item_id      uuid        references public.masterplan_items(id) on delete set null,
  wordpress_connection_id uuid        references public.wordpress_connections(id) on delete set null,
  status                  text        not null default 'draft_ready'
    constraint publishing_bundles_status_chk
      check (status in ('draft_ready','draft_created','needs_review','approved_for_publish','rejected','failed')),
  bundle_type             text        not null default 'wordpress_page_draft'
    constraint publishing_bundles_type_chk
      check (bundle_type in ('wordpress_page_draft')),
  payload                 jsonb       not null default '{}'::jsonb,
  safety_checks           jsonb       default '{}'::jsonb,
  error_message           text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_publishing_bundles_tenant        on public.publishing_bundles (tenant_id);
create index idx_publishing_bundles_artifact      on public.publishing_bundles (execution_artifact_id);
create index idx_publishing_bundles_tenant_status on public.publishing_bundles (tenant_id, status);

create trigger publishing_bundles_set_updated_at
  before update on public.publishing_bundles for each row execute function public.set_updated_at();
alter table public.publishing_bundles enable row level security;
create policy "publishing_bundles member select"  on public.publishing_bundles for select using (public.is_tenant_member(tenant_id));
create policy "publishing_bundles operator write" on public.publishing_bundles for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.wordpress_drafts (
  id                        uuid        primary key default gen_random_uuid(),
  tenant_id                 uuid        not null references public.tenants(id) on delete cascade,
  publishing_bundle_id      uuid        not null references public.publishing_bundles(id) on delete cascade,
  wordpress_connection_id   uuid        not null references public.wordpress_connections(id) on delete cascade,
  execution_artifact_id     uuid        not null references public.execution_artifacts(id) on delete cascade,
  wp_post_id                bigint,
  wp_post_type              text        not null default 'page',
  wp_status                 text        not null default 'draft',
  wp_edit_link              text,
  wp_preview_link           text,
  target_slug               text,
  title                     text,
  status                    text        not null default 'created'
    constraint wordpress_drafts_status_chk
      check (status in ('created','failed','needs_review','approved_for_publish','published')),
  seo_meta_status           text
    check (seo_meta_status in ('pushed_yoast', 'pushed_rankmath', 'manual_required', 'skipped')),
  meta_title                text,
  meta_description          text,
  publish_source            text
    check (publish_source in ('leadlayer_publish', 'operator_manual')),
  published_at              timestamptz,
  published_by              uuid,
  published_url             text,
  publication_notes         text,
  approved_at               timestamptz,
  approved_by               uuid,
  approval_notes            text,
  review_notes              text,
  publish_safety_checks     jsonb       default '{}'::jsonb,
  error_message             text,
  raw_response              jsonb       default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index idx_wordpress_drafts_tenant        on public.wordpress_drafts (tenant_id);
create index idx_wordpress_drafts_artifact      on public.wordpress_drafts (execution_artifact_id);
create index idx_wordpress_drafts_bundle        on public.wordpress_drafts (publishing_bundle_id);
create index idx_wordpress_drafts_tenant_status on public.wordpress_drafts (tenant_id, status);

create trigger wordpress_drafts_set_updated_at
  before update on public.wordpress_drafts for each row execute function public.set_updated_at();
alter table public.wordpress_drafts enable row level security;
create policy "wordpress_drafts member select"  on public.wordpress_drafts for select using (public.is_tenant_member(tenant_id));
create policy "wordpress_drafts operator write" on public.wordpress_drafts for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- REPORTING
-- ================================================================
create table public.monthly_reports (
  id                      uuid        primary key default gen_random_uuid(),
  tenant_id               uuid        not null references public.tenants(id) on delete cascade,
  growth_goal_id          uuid        references public.growth_goals(id) on delete set null,
  period_start            date        not null,
  period_end              date        not null,
  status                  text        not null default 'draft'
    constraint monthly_reports_status_chk
      check (status in ('draft', 'ready_for_review', 'approved', 'sent', 'archived')),
  lead_summary            jsonb       not null default '{}'::jsonb,
  execution_summary       jsonb       not null default '{}'::jsonb,
  wordpress_summary       jsonb       not null default '{}'::jsonb,
  goal_progress_summary   jsonb       not null default '{}'::jsonb,
  next_actions            jsonb       not null default '[]'::jsonb,
  risks                   jsonb       not null default '[]'::jsonb,
  narrative               text,
  share_token             text        unique,
  share_token_created_at  timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint monthly_reports_period_chk check (period_end >= period_start)
);

create index idx_monthly_reports_tenant        on public.monthly_reports (tenant_id);
create index idx_monthly_reports_tenant_period on public.monthly_reports (tenant_id, period_start desc);
create index idx_monthly_reports_tenant_status on public.monthly_reports (tenant_id, status);

create trigger monthly_reports_set_updated_at
  before update on public.monthly_reports for each row execute function public.set_updated_at();
alter table public.monthly_reports enable row level security;
create policy "monthly_reports member select"  on public.monthly_reports for select using (public.is_tenant_member(tenant_id));
create policy "monthly_reports operator write" on public.monthly_reports for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.monthly_execution_plans (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references public.tenants(id) on delete cascade,
  growth_goal_id      uuid        references public.growth_goals(id) on delete set null,
  monthly_report_id   uuid        references public.monthly_reports(id) on delete set null,
  period_start        date        not null,
  period_end          date        not null,
  package_tier        text        not null default 'growth'
    constraint monthly_execution_plans_tier_chk check (package_tier in ('starter', 'growth', 'pro')),
  status              text        not null default 'draft'
    constraint monthly_execution_plans_status_chk
      check (status in ('draft', 'ready_for_review', 'approved', 'in_execution', 'completed', 'archived')),
  lead_gap_summary    jsonb       not null default '{}'::jsonb,
  selected_actions    jsonb       not null default '[]'::jsonb,
  rationale           text,
  expected_impact     jsonb       not null default '{}'::jsonb,
  required_inputs     jsonb       not null default '[]'::jsonb,
  risks               jsonb       not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint monthly_execution_plans_period_chk check (period_end >= period_start)
);

create index idx_monthly_execution_plans_tenant        on public.monthly_execution_plans (tenant_id);
create index idx_monthly_execution_plans_tenant_period on public.monthly_execution_plans (tenant_id, period_start desc);
create index idx_monthly_execution_plans_tenant_status on public.monthly_execution_plans (tenant_id, status);

create trigger monthly_execution_plans_set_updated_at
  before update on public.monthly_execution_plans for each row execute function public.set_updated_at();
alter table public.monthly_execution_plans enable row level security;
create policy "monthly_execution_plans member select"  on public.monthly_execution_plans for select using (public.is_tenant_member(tenant_id));
create policy "monthly_execution_plans operator write" on public.monthly_execution_plans for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- OPERATIONS (intelligence runs, workflow runs)
-- ================================================================
create table public.intelligence_runs (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references public.tenants(id) on delete cascade,
  site_id         uuid,
  growth_goal_id  uuid        references public.growth_goals(id) on delete set null,
  status          text        not null default 'queued',
  current_stage   text,
  triggered_by    text        not null default 'operator',
  trigger_reason  text,
  stages          jsonb       not null default '{}'::jsonb,
  input_hash      jsonb       not null default '{}'::jsonb,
  output_refs     jsonb       not null default '{}'::jsonb,
  started_at      timestamptz,
  completed_at    timestamptz,
  failed_at       timestamptz,
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_intelligence_runs_tenant_created on public.intelligence_runs (tenant_id, created_at desc);

create trigger intelligence_runs_set_updated_at
  before update on public.intelligence_runs for each row execute function public.set_updated_at();
alter table public.intelligence_runs enable row level security;
create policy "intelligence_runs member select"  on public.intelligence_runs for select using (public.is_tenant_member(tenant_id));
create policy "intelligence_runs operator write" on public.intelligence_runs for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.workflow_runs (
  id          uuid           primary key default gen_random_uuid(),
  tenant_id   uuid           not null references public.tenants(id) on delete cascade,
  job_name    text           not null,
  state       workflow_state not null default 'queued',
  payload     jsonb,
  result      jsonb,
  error       text,
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz    not null default now()
);

create index workflow_runs_tenant_idx on public.workflow_runs(tenant_id, created_at desc);
alter table public.workflow_runs enable row level security;
create policy "workflow_runs member select" on public.workflow_runs for select using (public.is_tenant_member(tenant_id));

-- ================================================================
-- LEADS
-- ================================================================
create table public.raw_events (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references public.tenants(id) on delete cascade,
  source           text        not null,
  payload          jsonb       not null,
  received_at      timestamptz not null default now(),
  processed_at     timestamptz,
  processing_error text,
  lead_id          uuid
);

create index raw_events_tenant_unproc_idx on public.raw_events(tenant_id, received_at) where processed_at is null;
alter table public.raw_events enable row level security;
create policy "raw_events member select" on public.raw_events for select using (public.is_tenant_member(tenant_id));

create table public.leads (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references public.tenants(id) on delete cascade,
  page_id           uuid        references public.pages(id) on delete set null,
  source            text,
  status            lead_status not null default 'new',
  name              text,
  email             text,
  phone             text,
  payload           jsonb,
  attribution       jsonb,
  closed_amount     numeric,
  close_probability numeric
    constraint leads_close_probability_range
      check (close_probability is null or (close_probability >= 0 and close_probability <= 1)),
  closed_at         timestamptz,
  won_notes         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index leads_tenant_idx    on public.leads(tenant_id, created_at desc);
create index leads_tenant_status on public.leads(tenant_id, status);

create trigger leads_set_updated_at
  before update on public.leads for each row execute function public.set_updated_at();
alter table public.leads enable row level security;
create policy "leads member select"  on public.leads for select using (public.is_tenant_member(tenant_id));
create policy "leads operator write" on public.leads for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

create table public.lead_events (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  lead_id     uuid        not null references public.leads(id) on delete cascade,
  event_type  text        not null,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create index lead_events_lead_idx on public.lead_events(lead_id, created_at desc);
alter table public.lead_events enable row level security;
create policy "lead_events member select" on public.lead_events for select using (public.is_tenant_member(tenant_id));

create table public.lead_ingestion_sources (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references public.tenants(id) on delete cascade,
  site_connection_id  uuid        references public.site_connections(id) on delete set null,
  name                text        not null,
  source_type         text        not null default 'form_webhook'
    constraint lead_ingestion_sources_source_type_chk
      check (source_type in ('form_webhook', 'wordpress_form', 'manual', 'other')),
  public_key          text        not null unique,
  status              text        not null default 'active'
    constraint lead_ingestion_sources_status_chk
      check (status in ('active', 'disabled', 'revoked')),
  allowed_origins     text[]      not null default '{}',
  default_source      text        not null default 'form',
  default_status      text        not null default 'new',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_lead_ingestion_sources_tenant     on public.lead_ingestion_sources (tenant_id);
create index idx_lead_ingestion_sources_public_key on public.lead_ingestion_sources (public_key) where status = 'active';

create trigger lead_ingestion_sources_set_updated_at
  before update on public.lead_ingestion_sources for each row execute function public.set_updated_at();
alter table public.lead_ingestion_sources enable row level security;
create policy "lead_ingestion_sources member select"  on public.lead_ingestion_sources for select using (public.is_tenant_member(tenant_id));
create policy "lead_ingestion_sources operator write" on public.lead_ingestion_sources for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));

-- ================================================================
-- GRANTS (service_role needs explicit grants for tables without policies)
-- ================================================================
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
