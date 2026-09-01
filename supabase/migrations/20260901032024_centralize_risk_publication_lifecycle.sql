begin;

create or replace function public.begin_risk_forecast_snapshot(
  _snapshot_id uuid,
  _base_date date,
  _scheduled_for timestamptz,
  _stale_before timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _existing public.risk_forecast_snapshot_runs%rowtype;
  _reclaimed integer;
begin
  if _snapshot_id is null
    or _base_date is null
    or _scheduled_for is null
    or _stale_before is null
    or _stale_before >= now()
  then
    raise exception using errcode = '22023', message = 'invalid_risk_snapshot_identity';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('local_fwi:lifecycle', 0));

  delete from public.risk_forecast_staging as staged
  using public.risk_forecast_snapshot_runs as run
  where staged.snapshot_id = run.snapshot_id
    and run.status <> 'active';

  select * into _existing
  from public.risk_forecast_snapshot_runs
  where snapshot_id = _snapshot_id;

  if found then
    if _existing.base_date <> _base_date
      or _existing.scheduled_for <> _scheduled_for
      or _existing.status <> 'active'
    then
      raise exception using errcode = '22023', message = 'risk_snapshot_identity_conflict';
    end if;
    update public.risk_forecast_snapshot_runs
    set heartbeat_at = now()
    where snapshot_id = _snapshot_id;
  else
    insert into public.risk_forecast_snapshot_runs (
      snapshot_id, base_date, scheduled_for
    ) values (_snapshot_id, _base_date, _scheduled_for);
  end if;

  with stale as materialized (
    select snapshot_id
    from public.risk_forecast_snapshot_runs
    where status = 'active'
      and heartbeat_at < _stale_before
      and snapshot_id <> _snapshot_id
    for update
  ), deleted as (
    delete from public.risk_forecast_staging as staged
    using stale
    where staged.snapshot_id = stale.snapshot_id
  ), discarded as (
    update public.risk_forecast_snapshot_runs as run
    set status = 'discarded', finished_at = now()
    from stale
    where run.snapshot_id = stale.snapshot_id
    returning run.snapshot_id
  )
  select count(*)::integer into _reclaimed from discarded;

  return _reclaimed;
end;
$$;

create function public.stage_risk_forecast_batch(
  _snapshot_id uuid,
  _rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _status text;
  _staged integer;
begin
  if _snapshot_id is null or jsonb_typeof(_rows) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_risk_snapshot_batch';
  end if;

  select status into _status
  from public.risk_forecast_snapshot_runs
  where snapshot_id = _snapshot_id
  for update;
  if not found or _status <> 'active' then
    raise exception using errcode = '22023', message = 'risk_snapshot_not_active';
  end if;

  insert into public.risk_forecast_staging (
    snapshot_id, commune_id, forecast_date, horizon_days, fwi,
    danger_level, fuel_limited, components
  )
  select
    _snapshot_id, row.commune_id, row.forecast_date, row.horizon_days,
    row.fwi, row.danger_level, coalesce(row.fuel_limited, false), row.components
  from jsonb_to_recordset(_rows) as row(
    commune_id uuid,
    forecast_date date,
    horizon_days integer,
    fwi double precision,
    danger_level integer,
    fuel_limited boolean,
    components jsonb
  )
  on conflict (snapshot_id, commune_id, forecast_date, horizon_days)
  do update set
    fwi = excluded.fwi,
    danger_level = excluded.danger_level,
    fuel_limited = excluded.fuel_limited,
    components = excluded.components,
    staged_at = now();
  get diagnostics _staged = row_count;

  update public.risk_forecast_snapshot_runs
  set heartbeat_at = now()
  where snapshot_id = _snapshot_id and status = 'active';
  if not found then
    raise exception using errcode = '22023', message = 'risk_snapshot_not_active';
  end if;

  return _staged;
end;
$$;

create function public.discard_risk_forecast_snapshot(
  _snapshot_id uuid,
  _base_date date,
  _scheduled_for timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  _run public.risk_forecast_snapshot_runs%rowtype;
begin
  if _snapshot_id is null or _base_date is null or _scheduled_for is null then
    raise exception using errcode = '22023', message = 'invalid_risk_snapshot_identity';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('local_fwi:publication', 0));

  if exists (
    select 1 from public.risk_publications where snapshot_id = _snapshot_id
  ) then
    return false;
  end if;

  select * into _run
  from public.risk_forecast_snapshot_runs
  where snapshot_id = _snapshot_id
  for update;
  if not found
    or _run.base_date <> _base_date
    or _run.scheduled_for <> _scheduled_for
  then
    raise exception using errcode = '22023', message = 'risk_snapshot_identity_conflict';
  end if;
  if _run.status <> 'active' then
    return false;
  end if;

  delete from public.risk_forecast_staging where snapshot_id = _snapshot_id;
  update public.risk_forecast_snapshot_runs
  set status = 'discarded', heartbeat_at = now(), finished_at = now()
  where snapshot_id = _snapshot_id and status = 'active';
  return found;
end;
$$;

alter function public.publish_risk_forecast_snapshot(uuid, date, timestamptz)
  security definer;

revoke all privileges on table public.risk_forecasts
  from public, anon, authenticated, service_role;
grant select on table public.risk_forecasts to service_role;

revoke all privileges on table public.risk_forecast_staging
  from public, anon, authenticated, service_role;
revoke all privileges on table public.risk_forecast_snapshot_runs
  from public, anon, authenticated, service_role;
revoke all privileges on table public.risk_publications
  from public, anon, authenticated, service_role;
grant select on table public.risk_publications to service_role;
revoke all privileges on table public.risk_publication_checkpoint
  from public, anon, authenticated, service_role;
grant select on table public.risk_publication_checkpoint
  to anon, authenticated, service_role;

revoke all on function public.stage_risk_forecast_batch(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.discard_risk_forecast_snapshot(uuid, date, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.stage_risk_forecast_batch(uuid, jsonb)
  to service_role;
grant execute on function public.discard_risk_forecast_snapshot(uuid, date, timestamptz)
  to service_role;

commit;

-- Rollback restores service table DML, drops stage/discard RPCs, and returns begin/publish to invoker security.
