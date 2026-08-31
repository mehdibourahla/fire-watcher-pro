-- Milestone 1A: versioned source contracts, private immutable run history,
-- atomic checkpoints, and one server-derived public health projection.

create table public.source_contracts (
  key text primary key,
  version integer not null check (version > 0),
  label text not null,
  family text not null check (
    family in (
      'fire_detection',
      'detection_processing',
      'official_warnings',
      'fire_danger',
      'broadcast_delivery',
      'reference_enrichment'
    )
  ),
  criticality text not null check (
    criticality in ('critical', 'supporting', 'optional')
  ),
  freshness_basis text not null check (
    freshness_basis in (
      'last_success_at',
      'upstream_published_at',
      'data_through',
      'published_at'
    )
  ),
  cadence_minutes integer not null check (cadence_minutes > 0),
  warning_after_minutes integer not null check (warning_after_minutes > 0),
  stale_after_minutes integer not null check (
    stale_after_minutes > warning_after_minutes
  ),
  max_fallback_age_minutes integer check (max_fallback_age_minutes > 0),
  expected_coverage jsonb not null default '{}'::jsonb,
  parser_version text not null,
  dependency_keys text[] not null default '{}',
  licence text not null,
  attribution text not null,
  owner text not null,
  runbook_url text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.source_checkpoints (
  contract_key text primary key references public.source_contracts(key),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  upstream_published_at timestamptz,
  data_from timestamptz,
  data_through timestamptz,
  validated_at timestamptz,
  published_at timestamptz,
  replay_cursor jsonb,
  consecutive_failures integer not null default 0 check (
    consecutive_failures >= 0
  ),
  schema_fingerprint text,
  records_accepted integer not null default 0 check (records_accepted >= 0),
  records_expected integer check (records_expected >= 0),
  coverage_status text not null default 'unknown' check (
    coverage_status in ('complete', 'partial', 'unknown')
  ),
  fallback_contract_key text references public.source_contracts(key),
  last_public_reason_code text check (
    last_public_reason_code is null
    or last_public_reason_code in (
      'credentials_missing',
      'upstream_unreachable',
      'schema_invalid',
      'data_delayed',
      'coverage_partial',
      'dependency_failed',
      'delivery_failed',
      'disabled',
      'internal_error'
    )
  ),
  updated_at timestamptz not null default now()
);

create index source_checkpoints_fallback_idx
  on public.source_checkpoints (fallback_contract_key)
  where fallback_contract_key is not null;

create table public.source_runs (
  id uuid primary key default gen_random_uuid(),
  contract_key text not null references public.source_contracts(key),
  contract_version integer not null check (contract_version > 0),
  trigger_kind text not null check (
    trigger_kind in ('scheduled', 'manual', 'replay', 'dependency', 'migration')
  ),
  idempotency_key text,
  scheduled_for timestamptz not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  outcome text not null check (
    outcome in ('running', 'succeeded', 'partial', 'failed', 'skipped')
  ),
  upstream_published_at timestamptz,
  data_from timestamptz,
  data_through timestamptz,
  validated_at timestamptz,
  published_at timestamptz,
  records_seen integer not null default 0 check (records_seen >= 0),
  records_inserted integer not null default 0 check (records_inserted >= 0),
  records_updated integer not null default 0 check (records_updated >= 0),
  records_rejected integer not null default 0 check (records_rejected >= 0),
  records_expected integer check (records_expected >= 0),
  coverage_status text not null default 'unknown' check (
    coverage_status in ('complete', 'partial', 'unknown')
  ),
  quality_checks jsonb not null default '{}'::jsonb,
  public_reason_code text check (
    public_reason_code is null
    or public_reason_code in (
      'credentials_missing',
      'upstream_unreachable',
      'schema_invalid',
      'data_delayed',
      'coverage_partial',
      'dependency_failed',
      'delivery_failed',
      'disabled',
      'internal_error'
    )
  ),
  private_diagnostic text,
  created_at timestamptz not null default now(),
  check (finished_at is null or finished_at >= started_at)
);

create index source_runs_contract_started_idx
  on public.source_runs (contract_key, started_at desc);

create unique index source_runs_idempotency_idx
  on public.source_runs (idempotency_key)
  where idempotency_key is not null;

alter table public.source_contracts enable row level security;
alter table public.source_checkpoints enable row level security;
alter table public.source_runs enable row level security;

-- The project has broad historical default privileges for new public tables.
-- Reset them before adding the deliberately narrow grants below.
revoke all on public.source_contracts
  from anon, authenticated, service_role;
revoke all on public.source_checkpoints
  from anon, authenticated, service_role;
revoke all on public.source_runs
  from anon, authenticated, service_role;

create policy "public reads source contract facts"
  on public.source_contracts
  for select
  to anon, authenticated
  using (true);

create policy "public reads source checkpoint facts"
  on public.source_checkpoints
  for select
  to anon, authenticated
  using (true);

grant select on public.source_contracts to service_role;
grant select, insert, update on public.source_checkpoints to service_role;
grant select, insert on public.source_runs to service_role;

insert into public.source_contracts (
  key,
  version,
  label,
  family,
  criticality,
  freshness_basis,
  cadence_minutes,
  warning_after_minutes,
  stale_after_minutes,
  max_fallback_age_minutes,
  expected_coverage,
  parser_version,
  dependency_keys,
  licence,
  attribution,
  owner
)
values
  (
    'firms',
    1,
    'NASA FIRMS (VIIRS/MODIS)',
    'fire_detection',
    'critical',
    'last_success_at',
    10,
    15,
    25,
    null,
    '{"kind":"successful_poll","minimum_feeds":1}'::jsonb,
    'firms-csv-v1',
    '{}',
    'NASA FIRMS terms of use',
    'NASA FIRMS',
    'Nadhir maintainers'
  ),
  (
    'fci',
    1,
    'EUMETSAT MTG FCI',
    'fire_detection',
    'critical',
    'upstream_published_at',
    10,
    45,
    60,
    null,
    '{"kind":"upstream_slot"}'::jsonb,
    'fci-wfs-v1',
    '{}',
    'EUMETSAT data policy',
    'EUMETSAT MTG FCI',
    'Nadhir maintainers'
  ),
  (
    'onm',
    1,
    'ONM vigilance (Météo Algérie)',
    'official_warnings',
    'critical',
    'last_success_at',
    10,
    20,
    45,
    null,
    '{"kind":"successful_poll"}'::jsonb,
    'onm-cap-v1',
    '{}',
    'Source terms apply',
    'Office National de la Météorologie',
    'Nadhir maintainers'
  ),
  (
    'persistent_screen',
    1,
    'Persistent industrial heat-source screen',
    'detection_processing',
    'critical',
    'last_success_at',
    10,
    15,
    25,
    null,
    '{"kind":"non_empty_registry"}'::jsonb,
    'persistent-screen-v1',
    array['firms', 'fci'],
    'CC-BY-4.0',
    'Nadhir, derived from NASA FIRMS',
    'Nadhir maintainers'
  ),
  (
    'fusion',
    1,
    'Detection fusion',
    'detection_processing',
    'critical',
    'last_success_at',
    10,
    15,
    25,
    null,
    '{"kind":"successful_stage"}'::jsonb,
    'fusion-v1',
    array['persistent_screen', 'geo'],
    'CC-BY-4.0',
    'Nadhir',
    'Nadhir maintainers'
  ),
  (
    'openmeteo_wind',
    1,
    'Open-Meteo wind enrichment',
    'detection_processing',
    'optional',
    'last_success_at',
    10,
    30,
    60,
    null,
    '{"kind":"live_cluster_coverage"}'::jsonb,
    'openmeteo-wind-v1',
    array['fusion'],
    'CC-BY-4.0',
    'Open-Meteo',
    'Nadhir maintainers'
  ),
  (
    'local_fwi',
    1,
    'Fire Weather Index (computed from Open-Meteo)',
    'fire_danger',
    'critical',
    'data_through',
    1440,
    1920,
    2880,
    null,
    '{"kind":"matrix","communes":1536,"horizons":6,"records":9216}'::jsonb,
    'cffdrs-fwi-v1',
    array['geo'],
    'CC-BY-4.0',
    'Nadhir, computed from Open-Meteo',
    'Nadhir maintainers'
  ),
  (
    'effis',
    1,
    'EFFIS / GWIS danger comparator',
    'fire_danger',
    'supporting',
    'data_through',
    1440,
    2160,
    4320,
    null,
    '{"kind":"commune_coverage"}'::jsonb,
    'effis-wms-v1',
    array['geo'],
    'Copernicus data policy',
    'EFFIS / GWIS',
    'Nadhir maintainers'
  ),
  (
    'broadcast_publish',
    1,
    'Broadcast publication',
    'broadcast_delivery',
    'critical',
    'last_success_at',
    10,
    15,
    25,
    null,
    '{"kind":"successful_stage"}'::jsonb,
    'broadcast-publish-v1',
    array['fusion', 'onm'],
    'CC-BY-4.0',
    'Nadhir',
    'Nadhir maintainers'
  ),
  (
    'broadcast_delivery',
    1,
    'Broadcast delivery',
    'broadcast_delivery',
    'critical',
    'last_success_at',
    10,
    15,
    25,
    null,
    '{"kind":"attempted_backlog"}'::jsonb,
    'broadcast-delivery-v1',
    array['broadcast_publish'],
    'CC-BY-4.0',
    'Nadhir',
    'Nadhir maintainers'
  ),
  (
    'geo',
    1,
    'Administrative boundaries and settlements',
    'reference_enrichment',
    'critical',
    'published_at',
    43200,
    44640,
    86400,
    null,
    '{"kind":"seeded_reference"}'::jsonb,
    'osm-geo-v1',
    '{}',
    'ODbL-1.0',
    'OpenStreetMap contributors',
    'Nadhir maintainers'
  );

insert into public.source_checkpoints (contract_key)
select key from public.source_contracts;

create or replace function public.record_source_run(
  _contract_key text,
  _trigger_kind text,
  _idempotency_key text,
  _scheduled_for timestamptz,
  _started_at timestamptz,
  _finished_at timestamptz,
  _outcome text,
  _upstream_published_at timestamptz,
  _data_from timestamptz,
  _data_through timestamptz,
  _validated_at timestamptz,
  _published_at timestamptz,
  _records_seen integer,
  _records_inserted integer,
  _records_updated integer,
  _records_rejected integer,
  _records_expected integer,
  _coverage_status text,
  _quality_checks jsonb,
  _public_reason_code text,
  _private_diagnostic text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  _contract_version integer;
  _run_id uuid;
begin
  select version
  into _contract_version
  from public.source_contracts
  where key = _contract_key;

  if _contract_version is null then
    raise exception 'unknown source contract: %', _contract_key;
  end if;

  insert into public.source_runs (
    contract_key,
    contract_version,
    trigger_kind,
    idempotency_key,
    scheduled_for,
    started_at,
    finished_at,
    outcome,
    upstream_published_at,
    data_from,
    data_through,
    validated_at,
    published_at,
    records_seen,
    records_inserted,
    records_updated,
    records_rejected,
    records_expected,
    coverage_status,
    quality_checks,
    public_reason_code,
    private_diagnostic
  )
  values (
    _contract_key,
    _contract_version,
    _trigger_kind,
    _idempotency_key,
    _scheduled_for,
    _started_at,
    _finished_at,
    _outcome,
    _upstream_published_at,
    _data_from,
    _data_through,
    _validated_at,
    _published_at,
    coalesce(_records_seen, 0),
    coalesce(_records_inserted, 0),
    coalesce(_records_updated, 0),
    coalesce(_records_rejected, 0),
    _records_expected,
    _coverage_status,
    coalesce(_quality_checks, '{}'::jsonb),
    _public_reason_code,
    _private_diagnostic
  )
  on conflict (idempotency_key) where idempotency_key is not null
  do nothing
  returning id into _run_id;

  if _run_id is null then
    select id
    into _run_id
    from public.source_runs
    where idempotency_key = _idempotency_key;

    return _run_id;
  end if;

  insert into public.source_checkpoints (
    contract_key,
    last_attempt_at,
    last_success_at,
    upstream_published_at,
    data_from,
    data_through,
    validated_at,
    published_at,
    consecutive_failures,
    records_accepted,
    records_expected,
    coverage_status,
    last_public_reason_code,
    updated_at
  )
  values (
    _contract_key,
    coalesce(_finished_at, _started_at),
    case
      when _outcome = 'succeeded' then coalesce(_validated_at, _finished_at)
      else null
    end,
    case when _outcome = 'succeeded' then _upstream_published_at else null end,
    case when _outcome = 'succeeded' then _data_from else null end,
    case when _outcome = 'succeeded' then _data_through else null end,
    case when _outcome = 'succeeded' then _validated_at else null end,
    case when _outcome = 'succeeded' then _published_at else null end,
    case when _outcome in ('failed', 'partial') then 1 else 0 end,
    greatest(coalesce(_records_seen, 0) - coalesce(_records_rejected, 0), 0),
    _records_expected,
    _coverage_status,
    case when _outcome = 'succeeded' then null else _public_reason_code end,
    now()
  )
  on conflict (contract_key) do update
  set
    last_attempt_at = excluded.last_attempt_at,
    last_success_at = case
      when _outcome = 'succeeded' then excluded.last_success_at
      else public.source_checkpoints.last_success_at
    end,
    upstream_published_at = case
      when _outcome = 'succeeded' then coalesce(
        excluded.upstream_published_at,
        public.source_checkpoints.upstream_published_at
      )
      else public.source_checkpoints.upstream_published_at
    end,
    data_from = case
      when _outcome = 'succeeded' then coalesce(
        excluded.data_from,
        public.source_checkpoints.data_from
      )
      else public.source_checkpoints.data_from
    end,
    data_through = case
      when _outcome = 'succeeded' then coalesce(
        excluded.data_through,
        public.source_checkpoints.data_through
      )
      else public.source_checkpoints.data_through
    end,
    validated_at = case
      when _outcome = 'succeeded' then excluded.validated_at
      else public.source_checkpoints.validated_at
    end,
    published_at = case
      when _outcome = 'succeeded' then excluded.published_at
      else public.source_checkpoints.published_at
    end,
    consecutive_failures = case
      when _outcome = 'succeeded' then 0
      when _outcome in ('failed', 'partial')
        then public.source_checkpoints.consecutive_failures + 1
      else public.source_checkpoints.consecutive_failures
    end,
    records_accepted = excluded.records_accepted,
    records_expected = excluded.records_expected,
    coverage_status = excluded.coverage_status,
    last_public_reason_code = case
      when _outcome = 'succeeded' then null
      else excluded.last_public_reason_code
    end,
    updated_at = now();

  return _run_id;
end;
$$;

revoke all on function public.record_source_run(
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  integer,
  integer,
  integer,
  integer,
  integer,
  text,
  jsonb,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.record_source_run(
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  integer,
  integer,
  integer,
  integer,
  integer,
  text,
  jsonb,
  text,
  text
) to service_role;

-- Backfill the mutable checkpoint from the legacy status row. This is only an
-- initial bridge; the application switches to record_source_run in this release.
update public.source_checkpoints as checkpoint
set
  last_attempt_at = legacy.updated_at,
  last_success_at = legacy.last_ok_at,
  upstream_published_at = case
    when checkpoint.contract_key = 'fci' then legacy.last_ok_at
    else checkpoint.upstream_published_at
  end,
  data_through = case
    when checkpoint.contract_key in ('local_fwi', 'effis') then legacy.last_ok_at
    else checkpoint.data_through
  end,
  validated_at = legacy.last_ok_at,
  published_at = legacy.last_ok_at,
  consecutive_failures = case when legacy.status = 'ok' then 0 else 1 end,
  coverage_status = case when legacy.status = 'ok' then 'complete' else 'unknown' end,
  last_public_reason_code = case
    when legacy.status = 'ok' then null
    when legacy.note ilike '%not configured%' then 'credentials_missing'
    else 'internal_error'
  end,
  updated_at = legacy.updated_at
from (
  select
    case name
      when 'screen' then 'persistent_screen'
      when 'openmeteo' then 'openmeteo_wind'
      when 'broadcast' then 'broadcast_delivery'
      else name
    end as contract_key,
    status,
    last_ok_at,
    note,
    updated_at
  from public.data_sources
) as legacy
where checkpoint.contract_key = legacy.contract_key;

with legacy_runs as (
  select
    run.*,
    case run.source
      when 'screen' then 'persistent_screen'
      when 'openmeteo' then 'openmeteo_wind'
      when 'broadcast' then 'broadcast_publish'
      when 'delivery' then 'broadcast_delivery'
      else run.source
    end as contract_key
  from public.ingest_runs as run
)
insert into public.source_runs (
  id,
  contract_key,
  contract_version,
  trigger_kind,
  idempotency_key,
  scheduled_for,
  started_at,
  finished_at,
  outcome,
  validated_at,
  published_at,
  records_seen,
  records_inserted,
  coverage_status,
  quality_checks,
  public_reason_code,
  private_diagnostic,
  created_at
)
select
  legacy.id,
  legacy.contract_key,
  contract.version,
  'migration',
  'legacy:' || legacy.id::text,
  legacy.started_at,
  legacy.started_at,
  legacy.finished_at,
  case legacy.status
    when 'running' then 'running'
    when 'ok' then 'succeeded'
    else 'failed'
  end,
  case when legacy.status = 'ok' then legacy.finished_at else null end,
  case when legacy.status = 'ok' then legacy.finished_at else null end,
  legacy.records_in,
  legacy.records_new,
  case when legacy.status = 'ok' then 'complete' else 'unknown' end,
  '{"migrated_from":"ingest_runs"}'::jsonb,
  case when legacy.status = 'failed' then 'internal_error' else null end,
  legacy.error,
  legacy.started_at
from legacy_runs as legacy
join public.source_contracts as contract on contract.key = legacy.contract_key
on conflict (id) do nothing;

-- Existing code is still live for the short schema-before-code deploy window.
-- Mirror only old writes forward; the new application never writes back.
create or replace function private.sync_legacy_source_checkpoint()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  _contract_key text;
begin
  _contract_key := case new.name
    when 'screen' then 'persistent_screen'
    when 'openmeteo' then 'openmeteo_wind'
    when 'broadcast' then 'broadcast_delivery'
    else new.name
  end;

  if not exists (
    select 1 from public.source_contracts where key = _contract_key
  ) then
    return new;
  end if;

  insert into public.source_checkpoints (
    contract_key,
    last_attempt_at,
    last_success_at,
    upstream_published_at,
    data_through,
    validated_at,
    published_at,
    consecutive_failures,
    coverage_status,
    last_public_reason_code,
    updated_at
  )
  values (
    _contract_key,
    new.updated_at,
    new.last_ok_at,
    case when _contract_key = 'fci' then new.last_ok_at else null end,
    case when _contract_key in ('local_fwi', 'effis') then new.last_ok_at else null end,
    new.last_ok_at,
    new.last_ok_at,
    case when new.status = 'ok' then 0 else 1 end,
    case when new.status = 'ok' then 'complete' else 'unknown' end,
    case
      when new.status = 'ok' then null
      when new.note ilike '%not configured%' then 'credentials_missing'
      else 'internal_error'
    end,
    new.updated_at
  )
  on conflict (contract_key) do update
  set
    last_attempt_at = excluded.last_attempt_at,
    last_success_at = coalesce(excluded.last_success_at, public.source_checkpoints.last_success_at),
    upstream_published_at = coalesce(
      excluded.upstream_published_at,
      public.source_checkpoints.upstream_published_at
    ),
    data_through = coalesce(excluded.data_through, public.source_checkpoints.data_through),
    validated_at = coalesce(excluded.validated_at, public.source_checkpoints.validated_at),
    published_at = coalesce(excluded.published_at, public.source_checkpoints.published_at),
    consecutive_failures = excluded.consecutive_failures,
    coverage_status = excluded.coverage_status,
    last_public_reason_code = excluded.last_public_reason_code,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

revoke all on function private.sync_legacy_source_checkpoint()
  from public, anon, authenticated, service_role;

create trigger sync_legacy_source_checkpoint
after insert or update on public.data_sources
for each row execute function private.sync_legacy_source_checkpoint();

create view public.source_health
with (security_invoker = true)
as
with facts as (
  select
    contract.key,
    contract.label,
    contract.family,
    contract.criticality,
    contract.enabled,
    contract.freshness_basis,
    contract.warning_after_minutes,
    contract.stale_after_minutes,
    checkpoint.last_attempt_at,
    checkpoint.last_success_at,
    checkpoint.published_at,
    checkpoint.coverage_status,
    checkpoint.records_accepted,
    checkpoint.records_expected,
    checkpoint.fallback_contract_key,
    checkpoint.last_public_reason_code as public_reason_code,
    checkpoint.consecutive_failures,
    case contract.freshness_basis
      when 'last_success_at' then checkpoint.last_success_at
      when 'upstream_published_at' then checkpoint.upstream_published_at
      when 'data_through' then checkpoint.data_through
      when 'published_at' then checkpoint.published_at
    end as valid_at
  from public.source_contracts as contract
  left join public.source_checkpoints as checkpoint
    on checkpoint.contract_key = contract.key
), aged as (
  select
    facts.*,
    case
      when valid_at is null then null
      else greatest(floor(extract(epoch from (now() - valid_at)) / 60), 0)::integer
    end as age_minutes
  from facts
)
select
  key,
  label,
  family,
  criticality,
  case
    when not enabled or public_reason_code = 'disabled' then 'paused'
    when valid_at is null then 'unavailable'
    when age_minutes > stale_after_minutes then 'stale'
    when age_minutes > warning_after_minutes then 'delayed'
    when consecutive_failures > 0
      or coverage_status = 'partial'
      or fallback_contract_key is not null then 'degraded'
    else 'healthy'
  end as state,
  freshness_basis,
  valid_at,
  last_attempt_at,
  last_success_at,
  published_at,
  age_minutes,
  warning_after_minutes,
  stale_after_minutes,
  coverage_status,
  records_accepted,
  records_expected,
  fallback_contract_key,
  public_reason_code
from aged;

revoke all on public.source_health
  from anon, authenticated, service_role;

grant select (
  key,
  label,
  family,
  criticality,
  enabled,
  freshness_basis,
  warning_after_minutes,
  stale_after_minutes
) on public.source_contracts to anon, authenticated;

grant select (
  contract_key,
  last_attempt_at,
  last_success_at,
  upstream_published_at,
  data_through,
  published_at,
  consecutive_failures,
  records_accepted,
  records_expected,
  coverage_status,
  fallback_contract_key,
  last_public_reason_code
) on public.source_checkpoints to anon, authenticated;

grant select on public.source_health to anon, authenticated, service_role;

drop policy if exists "public read ingest_runs" on public.ingest_runs;
revoke all on public.ingest_runs from anon, authenticated;
