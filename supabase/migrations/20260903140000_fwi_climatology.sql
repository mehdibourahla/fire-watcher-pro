create table public.fwi_climatology (
  commune_id uuid not null references public.admin_units(id) on delete cascade,
  month smallint not null check (month between 4 and 10),
  day smallint not null check (day between 1 and 31),
  breakpoints real[] not null,
  built_at timestamptz not null default now(),
  primary key (commune_id, month, day)
);

alter table public.fwi_climatology enable row level security;

create policy "public read fwi_climatology"
  on public.fwi_climatology for select
  to anon, authenticated
  using (true);

alter table public.risk_forecast_staging
  add column fwi_percentile smallint check (fwi_percentile between 0 and 100);

alter table public.risk_forecasts
  add column fwi_percentile smallint check (fwi_percentile between 0 and 100);

create or replace function public.stage_risk_forecast_batch(
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
    danger_level, fuel_limited, components, fwi_percentile
  )
  select
    _snapshot_id, row.commune_id, row.forecast_date, row.horizon_days,
    row.fwi, row.danger_level, coalesce(row.fuel_limited, false), row.components,
    row.fwi_percentile
  from jsonb_to_recordset(_rows) as row(
    commune_id uuid,
    forecast_date date,
    horizon_days integer,
    fwi double precision,
    danger_level integer,
    fuel_limited boolean,
    components jsonb,
    fwi_percentile smallint
  )
  on conflict (snapshot_id, commune_id, forecast_date, horizon_days)
  do update set
    fwi = excluded.fwi,
    danger_level = excluded.danger_level,
    fuel_limited = excluded.fuel_limited,
    components = excluded.components,
    fwi_percentile = excluded.fwi_percentile,
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

create or replace function public.publish_risk_forecast_snapshot(
  _snapshot_id uuid,
  _base_date date,
  _scheduled_for timestamptz
)
returns jsonb
language plpgsql
security definer
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
  _data_through timestamptz;
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
  _data_through := (_base_date::text || 'T00:00:00Z')::timestamptz;

  insert into public.risk_publications (
    snapshot_id, base_date, scheduled_for, published_at, row_count
  ) values (
    _snapshot_id, _base_date, _scheduled_for, _published_at, _staged_rows
  );

  insert into public.risk_forecasts (
    commune_id, forecast_date, horizon_days, source, fwi,
    danger_level, fuel_limited, components, snapshot_id, fwi_percentile
  )
  select
    staged.commune_id, staged.forecast_date, staged.horizon_days,
    'local_fwi', staged.fwi, staged.danger_level, staged.fuel_limited,
    staged.components, _snapshot_id, staged.fwi_percentile
  from public.risk_forecast_staging as staged
  where staged.snapshot_id = _snapshot_id
  order by staged.commune_id, staged.forecast_date, staged.horizon_days;
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

  insert into public.source_checkpoints (
    contract_key,
    last_scheduled_for,
    last_attempt_at,
    last_success_at,
    data_through,
    validated_at,
    published_at,
    consecutive_failures,
    records_accepted,
    records_expected,
    coverage_status,
    fallback_contract_key,
    last_public_reason_code,
    updated_at
  ) values (
    'local_fwi',
    _scheduled_for,
    _published_at,
    _published_at,
    _data_through,
    _published_at,
    _published_at,
    0,
    _promoted_rows,
    _expected_communes * 6,
    'complete',
    null,
    null,
    now()
  )
  on conflict (contract_key) do update set
    last_scheduled_for = greatest(
      public.source_checkpoints.last_scheduled_for,
      excluded.last_scheduled_for
    ),
    last_attempt_at = greatest(
      public.source_checkpoints.last_attempt_at,
      excluded.last_attempt_at
    ),
    last_success_at = greatest(
      public.source_checkpoints.last_success_at,
      excluded.last_success_at
    ),
    data_through = greatest(
      public.source_checkpoints.data_through,
      excluded.data_through
    ),
    validated_at = greatest(
      public.source_checkpoints.validated_at,
      excluded.validated_at
    ),
    published_at = greatest(
      public.source_checkpoints.published_at,
      excluded.published_at
    ),
    consecutive_failures = case
      when excluded.last_scheduled_for >= coalesce(
        public.source_checkpoints.last_scheduled_for,
        '-infinity'::timestamptz
      )
        then 0
      else public.source_checkpoints.consecutive_failures
    end,
    records_accepted = case
      when excluded.last_scheduled_for >= coalesce(
        public.source_checkpoints.last_scheduled_for,
        '-infinity'::timestamptz
      )
        then excluded.records_accepted
      else public.source_checkpoints.records_accepted
    end,
    records_expected = case
      when excluded.last_scheduled_for >= coalesce(
        public.source_checkpoints.last_scheduled_for,
        '-infinity'::timestamptz
      )
        then excluded.records_expected
      else public.source_checkpoints.records_expected
    end,
    coverage_status = case
      when excluded.last_scheduled_for >= coalesce(
        public.source_checkpoints.last_scheduled_for,
        '-infinity'::timestamptz
      )
        then excluded.coverage_status
      else public.source_checkpoints.coverage_status
    end,
    fallback_contract_key = case
      when excluded.last_scheduled_for >= coalesce(
        public.source_checkpoints.last_scheduled_for,
        '-infinity'::timestamptz
      )
        then null
      else public.source_checkpoints.fallback_contract_key
    end,
    last_public_reason_code = case
      when excluded.last_scheduled_for >= coalesce(
        public.source_checkpoints.last_scheduled_for,
        '-infinity'::timestamptz
      )
        then null
      else public.source_checkpoints.last_public_reason_code
    end,
    updated_at = now();

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

-- CREATE OR REPLACE cannot change a RETURNS TABLE function's column set in place
drop function if exists public.current_risk_forecasts();

create function public.current_risk_forecasts()
returns table (
  id uuid,
  commune_id uuid,
  forecast_date date,
  horizon_days integer,
  source text,
  fwi double precision,
  danger_level integer,
  fuel_limited boolean,
  components jsonb,
  created_at timestamptz,
  snapshot_id uuid,
  fwi_percentile smallint,
  commune_code text,
  name_en text,
  name_ar text,
  name_fr text,
  admin_level text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    forecast.id,
    forecast.commune_id,
    forecast.forecast_date,
    forecast.horizon_days,
    forecast.source,
    forecast.fwi,
    forecast.danger_level,
    forecast.fuel_limited,
    forecast.components,
    forecast.created_at,
    forecast.snapshot_id,
    forecast.fwi_percentile,
    unit.code,
    unit.name_en,
    unit.name_ar,
    unit.name_fr,
    unit.level
  from public.risk_publication_checkpoint as checkpoint
  join public.risk_forecasts as forecast
    on forecast.snapshot_id = checkpoint.snapshot_id
    and forecast.source = 'local_fwi'
  join public.admin_units as unit
    on unit.id = forecast.commune_id
    and unit.level = 'commune'
  where checkpoint.key = 'local_fwi'
    and checkpoint.coverage_status = 'complete'
    and checkpoint.published_at is not null
$$;

revoke all on function public.current_risk_forecasts()
  from public, anon, authenticated, service_role;
grant execute on function public.current_risk_forecasts()
  to anon, authenticated, service_role;
