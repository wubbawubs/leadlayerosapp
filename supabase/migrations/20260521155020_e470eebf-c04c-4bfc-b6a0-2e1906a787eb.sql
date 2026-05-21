alter table public.site_connections
  add column if not exists username text;

create unique index if not exists site_connections_tenant_type_url_uniq
  on public.site_connections (tenant_id, type, base_url)
  where base_url is not null;
