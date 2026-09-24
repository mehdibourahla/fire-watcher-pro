drop function public.set_broadcast_enabled(boolean);
create function public.set_broadcast_enabled(_enabled boolean,_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
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

  -- reason stays 'admin_toggle' for the action/actor invariant; the operator's words ride in payload
  insert into public.broadcast_audit (action, reason, actor_id, payload)
  values (
    case when _enabled then 'enabled' else 'disabled' end,
    'admin_toggle',
    _actor,
    case when nullif(btrim(_note),'') is null then null else jsonb_build_object('note', btrim(_note)) end
  );

  return jsonb_build_object(
    'changed', true,
    'enabled', _enabled,
    'updated_at', _updated_at
  );
end;
$$;
revoke all on function public.set_broadcast_enabled(boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.set_broadcast_enabled(boolean,text) to authenticated;

create or replace view public.admin_audit_timeline with (security_invoker=true) as
 select a.id, a.at, a.actor_user_id, a.actor_kind, a.actor_label, a.domain, a.action, a.target_table, a.target_id, a.reason
   from public.admin_audit a
union all
 select b.id, b.at, b.actor_id as actor_user_id,
    case when b.actor_id is null then 'system'::text else 'user'::text end as actor_kind,
    case when b.actor_id is null then 'broadcast-pipeline'::text else null::text end as actor_label,
    'broadcasts'::text as domain,
    'broadcast.'::text || b.action as action,
    'broadcast_audit'::text as target_table,
    b.cluster_id::text as target_id,
    coalesce(b.payload->>'note', b.reason) as reason
   from public.broadcast_audit b;
