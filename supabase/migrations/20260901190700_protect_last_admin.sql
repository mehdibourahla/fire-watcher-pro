begin;

create or replace function public.prevent_last_admin_removal()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  admin_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.user_roles.admin', 0)
  );

  select count(*)::integer
  into admin_count
  from public.user_roles
  where role = 'admin'::public.app_role;

  if admin_count <= 1 then
    raise exception using
      errcode = 'P0001',
      message = 'last_admin_required';
  end if;

  return old;
end;
$$;

revoke execute on function public.prevent_last_admin_removal() from public;
revoke execute on function public.prevent_last_admin_removal() from anon;
revoke execute on function public.prevent_last_admin_removal() from authenticated;
revoke execute on function public.prevent_last_admin_removal() from service_role;

create trigger user_roles_preserve_last_admin_delete
before delete on public.user_roles
for each row
when (old.role = 'admin'::public.app_role)
execute function public.prevent_last_admin_removal();

create trigger user_roles_preserve_last_admin_demotion
before update of role on public.user_roles
for each row
when (
  old.role = 'admin'::public.app_role
  and new.role <> 'admin'::public.app_role
)
execute function public.prevent_last_admin_removal();

revoke all on table public.user_roles from anon;
revoke all on table public.user_roles from authenticated;
grant select, insert, delete on table public.user_roles to authenticated;
revoke truncate on table public.user_roles from service_role;

commit;
