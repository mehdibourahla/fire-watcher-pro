create table public.risk_forecast_staging (
  snapshot_id uuid not null,
  commune_id uuid not null references public.admin_units(id) on delete cascade,
  forecast_date date not null,
  horizon_days integer not null check (horizon_days between 0 and 5),
  fwi double precision not null,
  danger_level integer not null check (danger_level between 1 and 5),
  fuel_limited boolean not null default false,
  components jsonb,
  staged_at timestamptz not null default now(),
  primary key (snapshot_id, commune_id, forecast_date, horizon_days)
);

create index risk_forecast_staging_commune_idx
  on public.risk_forecast_staging (commune_id);

create index risk_forecast_staging_age_idx
  on public.risk_forecast_staging (staged_at);

alter table public.risk_forecast_staging enable row level security;

revoke all on public.risk_forecast_staging from public, anon, authenticated;
grant select, insert, update, delete on public.risk_forecast_staging to service_role;

create function public.publish_risk_forecast_snapshot(_snapshot_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  _base_date date;
  _expected_communes integer;
  _staged_rows integer;
  _promoted_rows integer;
begin
  select min(staged.forecast_date)
  into _base_date
  from public.risk_forecast_staging as staged
  where staged.snapshot_id = _snapshot_id
    and staged.horizon_days = 0;

  if _base_date is null then
    return 0;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('local_fwi:' || _base_date::text, 0)
  );

  select count(*)::integer
  into _expected_communes
  from public.admin_units
  where level = 'commune';

  select count(*)::integer
  into _staged_rows
  from public.risk_forecast_staging
  where snapshot_id = _snapshot_id;

  if _expected_communes = 0
    or _staged_rows <> _expected_communes * 6
    or exists (
      select 1
      from public.risk_forecast_staging as staged
      left join public.admin_units as unit
        on unit.id = staged.commune_id
        and unit.level = 'commune'
      where staged.snapshot_id = _snapshot_id
        and (
          unit.id is null
          or staged.forecast_date <> _base_date + staged.horizon_days
        )
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'incomplete_risk_snapshot';
  end if;

  insert into public.risk_forecasts (
    commune_id,
    forecast_date,
    horizon_days,
    source,
    fwi,
    danger_level,
    fuel_limited,
    components
  )
  select
    staged.commune_id,
    staged.forecast_date,
    staged.horizon_days,
    'local_fwi',
    staged.fwi,
    staged.danger_level,
    staged.fuel_limited,
    staged.components
  from public.risk_forecast_staging as staged
  where staged.snapshot_id = _snapshot_id
  order by staged.commune_id, staged.forecast_date, staged.horizon_days
  on conflict (commune_id, forecast_date, horizon_days, source)
  do update set
    fwi = excluded.fwi,
    danger_level = excluded.danger_level,
    fuel_limited = excluded.fuel_limited,
    components = excluded.components;

  get diagnostics _promoted_rows = row_count;

  delete from public.risk_forecast_staging
  where snapshot_id = _snapshot_id;

  return _promoted_rows;
end;
$$;

revoke all on function public.publish_risk_forecast_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.publish_risk_forecast_snapshot(uuid)
  to service_role;

-- Rollback: drop the function, indexes, and staging table; published forecasts are unchanged.
