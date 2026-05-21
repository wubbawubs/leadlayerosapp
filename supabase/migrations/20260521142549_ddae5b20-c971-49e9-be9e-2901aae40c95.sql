
-- Fix mutable search_path warnings
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

create or replace function public.protect_last_owner()
returns trigger
language plpgsql
set search_path = public
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

-- Revoke execute from anon on SECURITY DEFINER helpers — only authenticated users use them via RLS
revoke execute on function public.is_tenant_member(uuid)         from anon;
revoke execute on function public.has_tenant_role(uuid, app_role) from anon;
revoke execute on function public.has_tenant_min_role(uuid, app_role) from anon;
revoke execute on function public.handle_new_user() from anon, authenticated;
