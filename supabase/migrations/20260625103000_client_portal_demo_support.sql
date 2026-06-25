-- Client portal demo support for environments that were created from a partial schema.
-- Keeps the authenticated /client dashboard loadable and gives demo tenants reports/pages/focus data.

alter table public.tenants
  add column if not exists portal_token text unique,
  add column if not exists portal_token_created_at timestamptz;

create index if not exists idx_tenants_portal_token
  on public.tenants (portal_token)
  where portal_token is not null;

create table if not exists public.wordpress_page_updates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  execution_artifact_id uuid,
  snapshot_id uuid,
  wordpress_connection_id uuid,
  wp_post_id bigint not null,
  status text not null default 'applied' check (status in ('pending', 'applied', 'failed')),
  applied_at timestamptz,
  applied_by uuid,
  update_source text not null default 'leadlayer_update',
  fields_updated jsonb not null default '[]'::jsonb,
  error_message text,
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wpu_tenant_id on public.wordpress_page_updates(tenant_id);

create table if not exists public.wordpress_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  publishing_bundle_id uuid,
  wordpress_connection_id uuid,
  execution_artifact_id uuid,
  wp_post_id bigint,
  wp_post_type text not null default 'page',
  wp_status text not null default 'draft',
  wp_edit_link text,
  wp_preview_link text,
  target_slug text,
  title text,
  status text not null default 'created' check (status in ('created','failed','needs_review','approved_for_publish','published')),
  seo_meta_status text check (seo_meta_status in ('pushed_yoast', 'pushed_rankmath', 'manual_required', 'skipped')),
  meta_title text,
  meta_description text,
  publish_source text check (publish_source in ('leadlayer_publish', 'operator_manual')),
  published_at timestamptz,
  published_by uuid,
  published_url text,
  publication_notes text,
  approved_at timestamptz,
  approved_by uuid,
  approval_notes text,
  review_notes text,
  publish_safety_checks jsonb default '{}'::jsonb,
  error_message text,
  raw_response jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wordpress_drafts_tenant on public.wordpress_drafts (tenant_id);
create index if not exists idx_wordpress_drafts_tenant_status on public.wordpress_drafts (tenant_id, status);

create table if not exists public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  growth_goal_id uuid references public.growth_goals(id) on delete set null,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'ready_for_review', 'approved', 'sent', 'archived')),
  lead_summary jsonb not null default '{}'::jsonb,
  execution_summary jsonb not null default '{}'::jsonb,
  wordpress_summary jsonb not null default '{}'::jsonb,
  goal_progress_summary jsonb not null default '{}'::jsonb,
  next_actions jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  narrative text,
  share_token text unique,
  share_token_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_reports_period_chk check (period_end >= period_start)
);

create index if not exists idx_monthly_reports_tenant on public.monthly_reports (tenant_id);
create index if not exists idx_monthly_reports_tenant_period on public.monthly_reports (tenant_id, period_start desc);
create index if not exists idx_monthly_reports_tenant_status on public.monthly_reports (tenant_id, status);

create table if not exists public.monthly_execution_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  growth_goal_id uuid references public.growth_goals(id) on delete set null,
  monthly_report_id uuid references public.monthly_reports(id) on delete set null,
  period_start date not null,
  period_end date not null,
  package_tier text not null default 'growth' check (package_tier in ('starter', 'growth', 'pro')),
  status text not null default 'draft' check (status in ('draft', 'ready_for_review', 'approved', 'in_execution', 'completed', 'archived')),
  lead_gap_summary jsonb not null default '{}'::jsonb,
  selected_actions jsonb not null default '[]'::jsonb,
  rationale text,
  expected_impact jsonb not null default '{}'::jsonb,
  required_inputs jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_execution_plans_period_chk check (period_end >= period_start)
);

create index if not exists idx_monthly_execution_plans_tenant on public.monthly_execution_plans (tenant_id);
create index if not exists idx_monthly_execution_plans_tenant_period on public.monthly_execution_plans (tenant_id, period_start desc);
create index if not exists idx_monthly_execution_plans_tenant_status on public.monthly_execution_plans (tenant_id, status);
