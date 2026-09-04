create or replace function public.resolve_fire(
  _cluster uuid,
  _state text,
  _reason text default null,
  _note text default null,
  _expected_updated_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  previous public.fire_clusters;
begin
  if not public.has_any_role(actor, array['operator','admin']::public.app_role[]) then
    raise insufficient_privilege using message = 'operator_role_required';
  end if;

  if _state not in ('unconfirmed','active','contained_guess','extinguished','false_positive') then
    raise invalid_parameter_value using message = 'invalid_fire_state';
  end if;

  if _state = 'false_positive' and _reason is null then
    raise invalid_parameter_value using message = 'resolution_reason_required';
  end if;

  if _state <> 'false_positive' and _reason is not null then
    raise invalid_parameter_value using message = 'resolution_reason_not_applicable';
  end if;

  select * into previous from public.fire_clusters where id = _cluster for update;
  if not found then
    raise no_data_found using message = 'fire_not_found';
  end if;

  -- Two operators work the same fire on a busy day; the second must see the first's change.
  if _expected_updated_at is not null and previous.updated_at <> _expected_updated_at then
    raise integrity_constraint_violation using message = 'stale_write';
  end if;

  update public.fire_clusters
  set
    state = _state,
    resolution_reason = _reason,
    resolution_note = _note,
    resolved_at = case
      when _state in ('extinguished','false_positive') then now() else null end,
    resolved_by = case
      when _state in ('extinguished','false_positive') then actor else null end,
    updated_at = now()
  where id = _cluster;

  perform public.record_admin_audit(
    'fires',
    'fire.resolve',
    'fire_clusters',
    _cluster::text,
    jsonb_build_object('state', previous.state, 'resolution_reason', previous.resolution_reason),
    jsonb_build_object('state', _state, 'resolution_reason', _reason),
    _note
  );
end;
$$;

revoke execute on function public.resolve_fire(uuid, text, text, text, timestamptz)
  from public, anon;
grant execute on function public.resolve_fire(uuid, text, text, text, timestamptz)
  to authenticated, service_role;
