create or replace function public.grant_user_role(_user uuid, _role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if not public.has_role(actor, 'admin'::public.app_role) then
    raise insufficient_privilege using message = 'admin_role_required';
  end if;

  insert into public.user_roles (user_id, role)
  values (_user, _role)
  on conflict do nothing;

  if not found then
    return;
  end if;

  perform public.record_admin_audit(
    'people',
    'role.grant',
    'user_roles',
    _user::text,
    null,
    jsonb_build_object('role', _role)
  );
end;
$$;

create or replace function public.revoke_user_role(_user uuid, _role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if not public.has_role(actor, 'admin'::public.app_role) then
    raise insufficient_privilege using message = 'admin_role_required';
  end if;

  delete from public.user_roles where user_id = _user and role = _role;

  if not found then
    return;
  end if;

  perform public.record_admin_audit(
    'people',
    'role.revoke',
    'user_roles',
    _user::text,
    jsonb_build_object('role', _role),
    null
  );
end;
$$;

revoke execute on function public.grant_user_role(uuid, public.app_role)
  from public, anon, service_role;
grant execute on function public.grant_user_role(uuid, public.app_role) to authenticated;

revoke execute on function public.revoke_user_role(uuid, public.app_role)
  from public, anon, service_role;
grant execute on function public.revoke_user_role(uuid, public.app_role) to authenticated;

-- Reads stay open to admins through "own roles or admin read"; writes now have to go
-- through the functions above so a grant cannot happen without an audit row.
drop policy if exists "admins manage roles" on public.user_roles;
