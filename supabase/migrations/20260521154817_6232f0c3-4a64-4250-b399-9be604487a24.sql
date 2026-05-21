-- Plan tier enum
do $$ begin
  create type public.plan_tier as enum ('free','starter','pro','enterprise');
exception when duplicate_object then null; end $$;

-- Add plan column to tenants
alter table public.tenants
  add column if not exists plan public.plan_tier not null default 'free';

-- Lookup table
create table if not exists public.subscription_plans (
  tier public.plan_tier primary key,
  display_name text not null,
  max_sites int not null,
  max_pages int not null,
  monthly_ai_credits int not null,
  monthly_leads int not null,
  price_eur_monthly int not null default 0,
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscription_plans enable row level security;

drop policy if exists "subscription_plans public read" on public.subscription_plans;
create policy "subscription_plans public read"
  on public.subscription_plans for select
  to authenticated, anon
  using (true);

-- Seed defaults
insert into public.subscription_plans (tier, display_name, max_sites, max_pages, monthly_ai_credits, monthly_leads, price_eur_monthly, features) values
  ('free','Free',1,10,5000,10,0,'{"diagnostic":true,"auto_apply":false,"reviews":false}'),
  ('starter','Starter',3,100,50000,100,49,'{"diagnostic":true,"auto_apply":true,"reviews":false}'),
  ('pro','Pro',10,1000,250000,1000,149,'{"diagnostic":true,"auto_apply":true,"reviews":true}'),
  ('enterprise','Enterprise',999,99999,2000000,99999,499,'{"diagnostic":true,"auto_apply":true,"reviews":true,"priority_support":true}')
on conflict (tier) do nothing;

-- updated_at trigger
drop trigger if exists set_subscription_plans_updated_at on public.subscription_plans;
create trigger set_subscription_plans_updated_at
  before update on public.subscription_plans
  for each row execute function public.set_updated_at();
