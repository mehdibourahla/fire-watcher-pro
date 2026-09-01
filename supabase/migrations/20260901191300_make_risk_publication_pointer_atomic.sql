create table public.risk_publications (
  snapshot_id uuid primary key,
  base_date date not null,
  scheduled_for timestamptz not null unique,
  published_at timestamptz not null,
  row_count integer not null check (row_count > 0)
);

create table public.risk_publication_checkpoint (
  key text primary key check (key = 'local_fwi'),
  snapshot_id uuid not null references public.risk_publications(snapshot_id),
  base_date date not null,
  scheduled_for timestamptz not null,
  published_at timestamptz not null,
  coverage_status text not null default 'complete'
    check (coverage_status = 'complete')
);

create table public.risk_forecast_snapshot_runs (
  snapshot_id uuid primary key,
  base_date date not null,
  scheduled_for timestamptz not null,
  status text not null default 'active'
    check (status in ('active', 'promoted', 'discarded')),
  created_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  finished_at timestamptz
);

create index risk_forecast_snapshot_runs_stale_active_idx
  on public.risk_forecast_snapshot_runs (heartbeat_at, snapshot_id)
  where status = 'active';

alter table public.risk_forecasts
  add column snapshot_id uuid references public.risk_publications(snapshot_id);

create index risk_forecasts_snapshot_horizon_date_commune_idx
  on public.risk_forecasts (
    snapshot_id,
    horizon_days,
    forecast_date,
    commune_id
  )
  where snapshot_id is not null;

drop index if exists public.risk_forecast_staging_age_idx;

alter table public.risk_publications enable row level security;
alter table public.risk_publication_checkpoint enable row level security;
alter table public.risk_forecast_snapshot_runs enable row level security;

revoke all on public.risk_publications from public, anon, authenticated;
revoke all on public.risk_forecast_snapshot_runs from public, anon, authenticated;
revoke all on public.risk_publication_checkpoint from public, anon, authenticated;

grant select, insert on public.risk_publications to service_role;
grant select, insert, update, delete on public.risk_forecast_snapshot_runs to service_role;
grant select, insert, update on public.risk_publication_checkpoint to service_role;
grant select on public.risk_publication_checkpoint to anon, authenticated;

create policy "published risk checkpoint is public"
  on public.risk_publication_checkpoint
  for select
  to anon, authenticated
  using (true);

drop function public.publish_risk_forecast_snapshot(uuid);

create function public.begin_risk_forecast_snapshot(
  _snapshot_id uuid,
  _base_date date,
  _scheduled_for timestamptz,
  _stale_before timestamptz
)
returns integer
language plpgsql
security invoker
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

create function public.publish_risk_forecast_snapshot(
  _snapshot_id uuid,
  _base_date date,
  _scheduled_for timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  _run public.risk_forecast_snapshot_runs%rowtype;
  _publication public.risk_publications%rowtype;
  _current_scheduled_for timestamptz;
  _expected_communes integer;
  _staged_rows integer;
  _promoted_rows integer;
  _published_at timestamptz;
begin
  if _snapshot_id is null or _base_date is null or _scheduled_for is null then
    raise exception using errcode = '22023', message = 'invalid_risk_snapshot_identity';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('local_fwi:publication', 0));

  select * into _publication
  from public.risk_publications
  where snapshot_id = _snapshot_id;
  if found then
    if _publication.base_date <> _base_date
      or _publication.scheduled_for <> _scheduled_for
    then
      raise exception using errcode = '22023', message = 'risk_snapshot_identity_conflict';
    end if;
    return jsonb_build_object(
      'status', 'promoted',
      'rows', _publication.row_count,
      'snapshot_id', _publication.snapshot_id,
      'base_date', _publication.base_date,
      'published_at', _publication.published_at
    );
  end if;

  select * into _run
  from public.risk_forecast_snapshot_runs
  where snapshot_id = _snapshot_id
  for update;
  if not found
    or _run.status <> 'active'
    or _run.base_date <> _base_date
    or _run.scheduled_for <> _scheduled_for
  then
    raise exception using errcode = '22023', message = 'risk_snapshot_not_active';
  end if;

  select scheduled_for into _current_scheduled_for
  from public.risk_publication_checkpoint
  where key = 'local_fwi'
  for update;

  if _current_scheduled_for is not null
    and _scheduled_for <= _current_scheduled_for
  then
    delete from public.risk_forecast_staging where snapshot_id = _snapshot_id;
    update public.risk_forecast_snapshot_runs
    set status = 'discarded', heartbeat_at = now(), finished_at = now()
    where snapshot_id = _snapshot_id;
    return jsonb_build_object(
      'status', 'superseded',
      'rows', 0,
      'snapshot_id', _snapshot_id,
      'base_date', _base_date,
      'published_at', null
    );
  end if;

  select count(*)::integer into _expected_communes
  from public.admin_units where level = 'commune';
  select count(*)::integer into _staged_rows
  from public.risk_forecast_staging where snapshot_id = _snapshot_id;

  if _expected_communes = 0
    or _staged_rows <> _expected_communes * 6
    or exists (
      select 1
      from public.risk_forecast_staging as staged
      left join public.admin_units as unit
        on unit.id = staged.commune_id and unit.level = 'commune'
      where staged.snapshot_id = _snapshot_id
        and (
          unit.id is null
          or staged.forecast_date <> _base_date + staged.horizon_days
        )
    )
  then
    raise exception using errcode = 'P0001', message = 'incomplete_risk_snapshot';
  end if;

  _published_at := clock_timestamp();
  insert into public.risk_publications (
    snapshot_id, base_date, scheduled_for, published_at, row_count
  ) values (
    _snapshot_id, _base_date, _scheduled_for, _published_at, _staged_rows
  );

  insert into public.risk_forecasts (
    commune_id, forecast_date, horizon_days, source, fwi,
    danger_level, fuel_limited, components, snapshot_id
  )
  select
    staged.commune_id, staged.forecast_date, staged.horizon_days,
    'local_fwi', staged.fwi, staged.danger_level, staged.fuel_limited,
    staged.components, _snapshot_id
  from public.risk_forecast_staging as staged
  where staged.snapshot_id = _snapshot_id
  order by staged.commune_id, staged.forecast_date, staged.horizon_days
  on conflict (commune_id, forecast_date, horizon_days, source)
  do update set
    fwi = excluded.fwi,
    danger_level = excluded.danger_level,
    fuel_limited = excluded.fuel_limited,
    components = excluded.components,
    snapshot_id = excluded.snapshot_id;
  get diagnostics _promoted_rows = row_count;

  insert into public.risk_publication_checkpoint (
    key, snapshot_id, base_date, scheduled_for, published_at, coverage_status
  ) values (
    'local_fwi', _snapshot_id, _base_date, _scheduled_for,
    _published_at, 'complete'
  )
  on conflict (key) do update set
    snapshot_id = excluded.snapshot_id,
    base_date = excluded.base_date,
    scheduled_for = excluded.scheduled_for,
    published_at = excluded.published_at,
    coverage_status = excluded.coverage_status
  where public.risk_publication_checkpoint.scheduled_for < excluded.scheduled_for;

  delete from public.risk_forecast_staging where snapshot_id = _snapshot_id;
  update public.risk_forecast_snapshot_runs
  set status = 'promoted', heartbeat_at = now(), finished_at = now()
  where snapshot_id = _snapshot_id;

  return jsonb_build_object(
    'status', 'promoted',
    'rows', _promoted_rows,
    'snapshot_id', _snapshot_id,
    'base_date', _base_date,
    'published_at', _published_at
  );
end;
$$;

revoke all on function public.begin_risk_forecast_snapshot(uuid, date, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.publish_risk_forecast_snapshot(uuid, date, timestamptz)
  from public, anon, authenticated;
grant execute on function public.begin_risk_forecast_snapshot(uuid, date, timestamptz, timestamptz)
  to service_role;
grant execute on function public.publish_risk_forecast_snapshot(uuid, date, timestamptz)
  to service_role;

-- Rollback: drop both new RPCs and control tables, remove risk_forecasts.snapshot_id,
-- recreate the prior uuid-only promotion RPC and staging age index.
