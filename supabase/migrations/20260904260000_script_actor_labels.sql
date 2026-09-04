-- retire-out-of-area-clusters already writes false_positive with no cause at all; naming it
-- makes the script's intent visible in the data instead of only in the script.
alter table public.fire_clusters
  drop constraint if exists fire_clusters_resolution_reason_check;

alter table public.fire_clusters
  add constraint fire_clusters_resolution_reason_check
  check (resolution_reason is null or resolution_reason in
    ('flare','glint','industry','agri_burn','out_of_area','other'));

create or replace function public.resolve_fire(
  _cluster uuid,
  _state text,
  _reason text default null,
  _note text default null,
  _expected_updated_at timestamptz default null,
  _actor_label text default null
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
  -- Scheduled jobs resolve fires too and run without a session, so a null actor names its job.
  if actor is null then
    if _actor_label is null then
      raise insufficient_privilege using message = 'actor_label_required';
    end if;
  elsif not public.has_any_role(
    actor, array['operator','admin']::public.app_role[]
  ) then
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
    _note,
    _actor_label
  );
end;
$$;

drop function if exists public.resolve_fire(uuid, text, text, text, timestamptz);

revoke execute on function public.resolve_fire(uuid, text, text, text, timestamptz, text)
  from public, anon;
grant execute on function public.resolve_fire(uuid, text, text, text, timestamptz, text)
  to authenticated, service_role;
