create or replace function public.create_tenant_with_owner(
  p_name text,
  p_geo geo_code,
  p_vertical vertical_code
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  insert into public.tenants (name, geo, vertical)
  values (p_name, p_geo, p_vertical)
  returning id into v_tenant_id;

  insert into public.memberships (user_id, tenant_id, role)
  values (v_user_id, v_tenant_id, 'owner');

  return v_tenant_id;
end;
$$;

revoke execute on function public.create_tenant_with_owner(text, geo_code, vertical_code) from public, anon;
grant execute on function public.create_tenant_with_owner(text, geo_code, vertical_code) to authenticated;