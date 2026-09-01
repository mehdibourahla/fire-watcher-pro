begin;

lock table public.broadcast_audit in access exclusive mode;
lock table public.broadcast_settings in access exclusive mode;

do $$
begin
  if exists (
    select 1
    from public.broadcast_audit
    where not (
      (action in ('enabled', 'disabled')
        and reason = 'admin_toggle'
        and actor_id is not null)
      or
      (action in ('published', 'suppressed') and actor_id is null)
    )
  ) then
    raise exception 'broadcast_audit contains rows with invalid action attribution';
  end if;
end;
$$;

alter table public.broadcast_audit
  add constraint broadcast_audit_action_actor_valid
  check (
    (action in ('enabled', 'disabled')
      and reason = 'admin_toggle'
      and actor_id is not null)
    or
    (action in ('published', 'suppressed') and actor_id is null)
  );

drop function public.set_broadcast_enabled(boolean);

create function public.set_broadcast_enabled(_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _actor uuid := auth.uid();
  _current boolean;
  _updated_at timestamptz;
begin
  if _enabled is null then
    raise exception using errcode = '22004', message = 'enabled_required';
  end if;

  if _actor is null or not public.has_role(_actor, 'admin') then
    raise exception using errcode = '42501', message = 'admin_role_required';
  end if;

  select enabled, updated_at
  into strict _current, _updated_at
  from public.broadcast_settings
  where id = true
  for update;

  if _current = _enabled then
    return jsonb_build_object(
      'changed', false,
      'enabled', _current,
      'updated_at', _updated_at
    );
  end if;

  update public.broadcast_settings
  set enabled = _enabled,
      updated_at = now()
  where id = true
  returning updated_at into _updated_at;

  insert into public.broadcast_audit (action, reason, actor_id)
  values (
    case when _enabled then 'enabled' else 'disabled' end,
    'admin_toggle',
    _actor
  );

  return jsonb_build_object(
    'changed', true,
    'enabled', _enabled,
    'updated_at', _updated_at
  );
end;
$$;

revoke all privileges on table public.broadcast_audit
  from public, anon, authenticated, service_role;
grant select on table public.broadcast_audit to authenticated, service_role;
grant insert (
  action,
  reason,
  kind,
  cluster_id,
  onm_vigilance_id,
  phase,
  severity,
  commune_codes,
  payload
) on table public.broadcast_audit to service_role;

revoke all on function public.set_broadcast_enabled(boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_broadcast_enabled(boolean)
  to authenticated;

commit;

