alter table public.risk_forecasts
  drop constraint risk_forecasts_commune_id_forecast_date_horizon_days_source_key;

create unique index risk_forecasts_snapshot_identity_idx
  on public.risk_forecasts (
    snapshot_id,
    commune_id,
    forecast_date,
    horizon_days,
    source
  )
  where snapshot_id is not null;

create unique index risk_forecasts_legacy_identity_idx
  on public.risk_forecasts (
    commune_id,
    forecast_date,
    horizon_days,
    source
  )
  where snapshot_id is null;

create function public.reject_published_risk_forecast_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.snapshot_id is not null then
    raise exception using
      errcode = '55000',
      message = 'published_risk_forecast_is_immutable';
  end if;
  return old;
end;
$$;

create trigger reject_published_risk_forecast_mutation
before update or delete on public.risk_forecasts
for each row
execute function public.reject_published_risk_forecast_mutation();

revoke all on function public.reject_published_risk_forecast_mutation()
  from public, anon, authenticated, service_role;

create or replace function public.publish_risk_forecast_snapshot(
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
    danger_level, fuel_limited, components, snapshot_id
  )
  select
    staged.commune_id, staged.forecast_date, staged.horizon_days,
    'local_fwi', staged.fwi, staged.danger_level, staged.fuel_limited,
    staged.components, _snapshot_id
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

-- Irreversible after more than one generation is published: rollback must first
-- choose and delete historical generations, then restore the legacy unique key.
