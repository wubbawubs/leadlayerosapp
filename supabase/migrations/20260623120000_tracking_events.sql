-- ================================================================
-- Tracking events — pixel-captured visitor analytics
-- ================================================================
-- Powers CTA conversion rates, click-through rates, and traffic
-- trends in the client dashboard. Written by the public
-- /api/public/track endpoint via service_role (RLS-bypassing); the
-- write policy below is defense-in-depth for any direct access.
--
-- Volume note: raw event rows, no rollup. Fine for low-traffic B2B.
-- Add a daily rollup table if a tenant's event volume grows large.
-- ================================================================

create type public.tracking_event_type as enum ('pageview', 'cta_impression', 'cta_click');

create table public.tracking_events (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  event_type    public.tracking_event_type not null,
  cta_id        text,          -- value of data-ll-cta; null for pageview
  page_path     text,          -- pathname only (no query/PII), low cardinality
  session_id    text,          -- client-generated; unique visitors + lead attribution
  referrer_host text,          -- referrer hostname only
  utm           jsonb,         -- {source, medium, campaign, term, content}
  created_at    timestamptz not null default now()
);

create index tracking_events_tenant_time on public.tracking_events(tenant_id, created_at desc);
create index tracking_events_tenant_cta  on public.tracking_events(tenant_id, cta_id, event_type, created_at desc);
create index tracking_events_session     on public.tracking_events(tenant_id, session_id);

alter table public.tracking_events enable row level security;

create policy "tracking_events member select" on public.tracking_events for select
  using (public.is_tenant_member(tenant_id));

create policy "tracking_events operator write" on public.tracking_events for all
  using (public.has_tenant_min_role(tenant_id, 'operator'))
  with check (public.has_tenant_min_role(tenant_id, 'operator'));
