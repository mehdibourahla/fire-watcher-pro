begin;

lock table public.broadcast_audit in access exclusive mode;
lock table public.broadcast_settings in access exclusive mode;
lock table public.authority_warnings in access exclusive mode;

do $$
begin
  if exists (
    select 1
    from public.authority_warnings
    where source !~ '[^[:space:]]'
       or body !~ '[^[:space:]]'
  ) then
    raise exception 'authority_warnings contains blank source or body rows';
  end if;
end;
$$;

alter table public.authority_warnings
  add constraint authority_warnings_source_nonblank
    check (source ~ '[^[:space:]]'),
  add constraint authority_warnings_body_nonblank
    check (body ~ '[^[:space:]]');

alter table public.broadcast_audit
  add column actor_id uuid;

alter table public.broadcast_audit
  drop constraint broadcast_audit_action_check,
  add constraint broadcast_audit_action_check
    check (action in ('published', 'suppressed', 'enabled', 'disabled'));

drop policy if exists "admins toggle broadcast settings"
  on public.broadcast_settings;

drop policy if exists "admins insert authority warnings"
  on public.authority_warnings;
create policy "admins insert attributed authority warnings"
  on public.authority_warnings
  for insert to authenticated
  with check (
    public.has_role(auth.uid(), 'admin')
    and created_by = auth.uid()
  );

create function public.set_broadcast_enabled(_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  _actor uuid := auth.uid();
  _current boolean;
begin
  if _enabled is null then
    raise exception using errcode = '22004', message = 'enabled_required';
  end if;

  if _actor is null or not public.has_role(_actor, 'admin') then
    raise exception using errcode = '42501', message = 'admin_role_required';
  end if;

  select enabled
  into strict _current
  from public.broadcast_settings
  where id = true
  for update;

  if _current = _enabled then
    return false;
  end if;

  update public.broadcast_settings
  set enabled = _enabled,
      updated_at = now()
  where id = true;

  insert into public.broadcast_audit (action, reason, actor_id)
  values (
    case when _enabled then 'enabled' else 'disabled' end,
    'admin_toggle',
    _actor
  );

  return true;
end;
$$;

revoke all privileges on table public.broadcast_settings
  from public, anon, authenticated, service_role;
grant select on table public.broadcast_settings to authenticated, service_role;

revoke all privileges on table public.broadcast_audit
  from public, anon, authenticated, service_role;
grant select on table public.broadcast_audit to authenticated, service_role;
grant insert on table public.broadcast_audit to service_role;

revoke all privileges on table public.authority_warnings
  from public, anon, authenticated, service_role;
grant select (id, source, body, severity, created_at)
  on table public.authority_warnings to anon, authenticated;
grant insert (source, received_via, body, severity, wilaya_id, created_by)
  on table public.authority_warnings to authenticated;
grant select on table public.authority_warnings to service_role;

revoke all on function public.set_broadcast_enabled(boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_broadcast_enabled(boolean)
  to authenticated;

commit;

-- Rollback restores the prior grants and policies, then drops the RPC, constraints, and actor_id.
