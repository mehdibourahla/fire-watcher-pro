-- The pipeline keeps calling publish/discard directly; these are the operator-facing
-- wrappers that check a role and leave a record.
create or replace function public.operator_publish_risk_snapshot(
  _snapshot_id uuid,
  _base_date date,
  _scheduled_for timestamptz,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  outcome jsonb;
begin
  if not public.has_any_role(actor, array['operator','admin']::public.app_role[]) then
    raise insufficient_privilege using message = 'operator_role_required';
  end if;

  outcome := public.publish_risk_forecast_snapshot(
    _snapshot_id, _base_date, _scheduled_for
  );

  perform public.record_admin_audit(
    'risk',
    'risk.publish',
    'risk_forecast_snapshot_runs',
    _snapshot_id::text,
    null,
    jsonb_build_object('base_date', _base_date, 'outcome', outcome),
    _reason
  );

  return outcome;
end;
$$;

create or replace function public.operator_discard_risk_snapshot(
  _snapshot_id uuid,
  _base_date date,
  _scheduled_for timestamptz,
  _reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  discarded boolean;
begin
  if not public.has_any_role(actor, array['operator','admin']::public.app_role[]) then
    raise insufficient_privilege using message = 'operator_role_required';
  end if;

  if _reason is null or char_length(btrim(_reason)) = 0 then
    raise invalid_parameter_value using message = 'reason_required';
  end if;

  discarded := public.discard_risk_forecast_snapshot(
    _snapshot_id, _base_date, _scheduled_for
  );

  perform public.record_admin_audit(
    'risk',
    'risk.discard',
    'risk_forecast_snapshot_runs',
    _snapshot_id::text,
    jsonb_build_object('base_date', _base_date),
    jsonb_build_object('discarded', discarded),
    btrim(_reason)
  );

  return discarded;
end;
$$;

create or replace function public.operator_edit_incident(
  _id uuid,
  _patch jsonb,
  _reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  previous public.official_incidents;
begin
  if not public.has_any_role(
    actor, array['incident_editor','operator','admin']::public.app_role[]
  ) then
    raise insufficient_privilege using message = 'incident_role_required';
  end if;

  select * into previous from public.official_incidents where id = _id;
  if not found then
    raise no_data_found using message = 'incident_not_found';
  end if;

  perform public.bump_official_incident(_id, _patch);

  perform public.record_admin_audit(
    'incidents',
    'incident.edit',
    'official_incidents',
    _id::text,
    to_jsonb(previous) - 'raw' ,
    _patch,
    _reason
  );
end;
$$;

revoke execute on function public.operator_publish_risk_snapshot(uuid, date, timestamptz, text)
  from public, anon;
grant execute on function public.operator_publish_risk_snapshot(uuid, date, timestamptz, text)
  to authenticated;

revoke execute on function public.operator_discard_risk_snapshot(uuid, date, timestamptz, text)
  from public, anon;
grant execute on function public.operator_discard_risk_snapshot(uuid, date, timestamptz, text)
  to authenticated;

revoke execute on function public.operator_edit_incident(uuid, jsonb, text)
  from public, anon;
grant execute on function public.operator_edit_incident(uuid, jsonb, text)
  to authenticated;
