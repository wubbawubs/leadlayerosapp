
-- Revoke from PUBLIC (default grant) on SECURITY DEFINER helpers
revoke execute on function public.is_tenant_member(uuid) from public;
revoke execute on function public.has_tenant_role(uuid, app_role) from public;
revoke execute on function public.has_tenant_min_role(uuid, app_role) from public;
revoke execute on function public.handle_new_user() from public;

-- Re-grant to authenticated for the helpers (RLS needs them in user context)
grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.has_tenant_role(uuid, app_role) to authenticated;
grant execute on function public.has_tenant_min_role(uuid, app_role) to authenticated;
