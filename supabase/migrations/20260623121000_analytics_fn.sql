-- ================================================================
-- get_tenant_analytics — single-call dashboard analytics
-- ================================================================
-- Aggregates tracking_events + leads for one tenant over _days into a
-- JSON blob: daily trend, per-CTA funnel (impressions→clicks→conversions
-- with CTR + conversion rate), source breakdown, and totals.
--
-- SECURITY DEFINER + execute revoked from anon/authenticated: only the
-- server (service_role) calls it, after resolving the tenant from the
-- authenticated user. Keeps heavy aggregation in Postgres, not the Worker.
-- ================================================================

create or replace function public.get_tenant_analytics(_tenant_id uuid, _days int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  since as (select (now() - make_interval(days => greatest(_days, 1))) as ts),
  ev as (
    select * from public.tracking_events
    where tenant_id = _tenant_id and created_at >= (select ts from since)
  ),
  ld as (
    select * from public.leads
    where tenant_id = _tenant_id and created_at >= (select ts from since)
  ),
  days as (
    select generate_series(
      date_trunc('day', (select ts from since)),
      date_trunc('day', now()),
      interval '1 day'
    )::date as d
  ),
  pv_by_day as (
    select date_trunc('day', created_at)::date as d, count(*) c
    from ev where event_type = 'pageview' group by 1
  ),
  conv_by_day as (
    select date_trunc('day', created_at)::date as d, count(*) c
    from ld group by 1
  ),
  trend as (
    select jsonb_agg(jsonb_build_object(
      'date', days.d,
      'pageviews', coalesce(pv.c, 0),
      'conversions', coalesce(cv.c, 0)
    ) order by days.d) j
    from days
    left join pv_by_day pv on pv.d = days.d
    left join conv_by_day cv on cv.d = days.d
  ),
  cta_imp  as (select cta_id, count(*) c from ev where event_type = 'cta_impression' and cta_id is not null group by 1),
  cta_clk  as (select cta_id, count(*) c from ev where event_type = 'cta_click' and cta_id is not null group by 1),
  cta_conv as (select (attribution->>'cta') as cta_id, count(*) c from ld where (attribution->>'cta') is not null group by 1),
  cta_keys as (
    select cta_id from cta_imp
    union select cta_id from cta_clk
    union select cta_id from cta_conv
  ),
  ctas as (
    select jsonb_agg(jsonb_build_object(
      'cta', k.cta_id,
      'impressions', coalesce(i.c, 0),
      'clicks', coalesce(cl.c, 0),
      'conversions', coalesce(cv.c, 0),
      'ctr', case when coalesce(i.c, 0) > 0 then round((coalesce(cl.c, 0)::numeric / i.c) * 100, 1) else 0 end,
      'conversionRate', case when coalesce(cl.c, 0) > 0 then round((coalesce(cv.c, 0)::numeric / cl.c) * 100, 1) else 0 end
    ) order by coalesce(cl.c, 0) desc) j
    from cta_keys k
    left join cta_imp i on i.cta_id = k.cta_id
    left join cta_clk cl on cl.cta_id = k.cta_id
    left join cta_conv cv on cv.cta_id = k.cta_id
  ),
  sources as (
    select jsonb_agg(jsonb_build_object('source', coalesce(source, 'unknown'), 'conversions', c) order by c desc) j
    from (select source, count(*) c from ld group by 1) s
  ),
  totals as (
    select
      (select count(*) from ev where event_type = 'pageview') as pageviews,
      (select count(distinct session_id) from ev where session_id is not null) as sessions,
      (select count(*) from ld) as conversions
  )
  select jsonb_build_object(
    'rangeDays', greatest(_days, 1),
    'trend', coalesce((select j from trend), '[]'::jsonb),
    'ctas', coalesce((select j from ctas), '[]'::jsonb),
    'sources', coalesce((select j from sources), '[]'::jsonb),
    'totals', jsonb_build_object(
      'pageviews', (select pageviews from totals),
      'sessions', (select sessions from totals),
      'conversions', (select conversions from totals),
      'conversionRate', case when (select sessions from totals) > 0
        then round(((select conversions from totals)::numeric / (select sessions from totals)) * 100, 1) else 0 end
    )
  );
$$;

revoke execute on function public.get_tenant_analytics(uuid, int) from public, anon, authenticated;
