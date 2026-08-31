-- Milestone 2: durable per-contract jobs, one active lease per contract,
-- bounded retries, recorded gaps, replay, and independent schedulers.

alter table public.source_contracts
  add column schedule_enabled boolean not null default true,
  add column schedule_offset_minutes integer not null default 0
    check (schedule_offset_minutes >= 0),
  add column execution_target text not null default 'cloudflare'
    check (execution_target in ('cloudflare', 'github')),
  add column lease_seconds integer not null default 120
    check (lease_seconds between 30 and 3600),
  add column max_attempts integer not null default 3
    check (max_attempts between 1 and 10),
  add column retry_base_seconds integer not null default 30
    check (retry_base_seconds between 1 and 3600),
  add column retry_window_minutes integer not null default 30
    check (retry_window_minutes > 0),
  add column overlap_minutes integer not null default 0
    check (overlap_minutes >= 0),
  add column replay_capability text not null default 'none'
    check (replay_capability in ('none', 'interval')),
  add column replay_window_minutes integer
    check (
      (replay_capability = 'none' and replay_window_minutes is null)
      or (replay_capability = 'interval' and replay_window_minutes > 0)
    );

alter table public.source_checkpoints
  drop constraint source_checkpoints_last_public_reason_code_check,
  add constraint source_checkpoints_last_public_reason_code_check check (
    last_public_reason_code is null
    or last_public_reason_code in (
      'credentials_missing',
      'licence_invalid',
      'upstream_unreachable',
      'schema_invalid',
      'data_delayed',
      'coverage_partial',
      'dependency_failed',
      'delivery_failed',
      'disabled',
      'internal_error'
    )
  );

alter table public.source_runs
  drop constraint source_runs_public_reason_code_check,
  add constraint source_runs_public_reason_code_check check (
    public_reason_code is null
    or public_reason_code in (
      'credentials_missing',
      'licence_invalid',
      'upstream_unreachable',
      'schema_invalid',
      'data_delayed',
      'coverage_partial',
      'dependency_failed',
      'delivery_failed',
      'disabled',
      'internal_error'
    )
  );

update public.source_contracts
set schedule_enabled = false
where key = 'geo';

update public.source_contracts
set
  replay_capability = 'interval',
  replay_window_minutes = case key
    when 'firms' then 14400
    when 'fci' then 129600
  end
where key in ('firms', 'fci');

update public.source_contracts
set
  execution_target = 'github',
  schedule_offset_minutes = 360,
  lease_seconds = 1800,
  retry_base_seconds = 300,
  retry_window_minutes = 240
where key in ('local_fwi', 'effis');

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
  owner,
  schedule_enabled,
  schedule_offset_minutes,
  execution_target,
  lease_seconds,
  max_attempts,
  retry_base_seconds,
  retry_window_minutes,
  overlap_minutes
)
values (
  'alert_evaluation',
  1,
  'Alert evaluation',
  'detection_processing',
  'critical',
  'last_success_at',
  15,
  20,
  35,
  null,
  '{"kind":"active_zones"}'::jsonb,
  'alert-rules-v1',
  array['fusion', 'local_fwi'],
  'AGPL-3.0-only',
  'Nadhir',
  'Nadhir maintainers',
  true,
  5,
  'cloudflare',
  300,
  3,
  30,
  30,
  0
)
on conflict (key) do nothing;

insert into public.source_checkpoints (contract_key)
values ('alert_evaluation')
on conflict (contract_key) do nothing;

create table public.source_gaps (
  id uuid primary key default gen_random_uuid(),
  contract_key text not null references public.source_contracts(key),
  data_from timestamptz not null,
  data_through timestamptz not null,
  state text not null default 'open' check (
    state in ('open', 'replaying', 'resolved', 'unrecoverable')
  ),
  public_reason_code text check (
    public_reason_code is null
    or public_reason_code in (
      'credentials_missing',
      'licence_invalid',
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
  replay_count integer not null default 0 check (replay_count >= 0),
  resolved_by_run_id uuid references public.source_runs(id),
  detected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (data_from < data_through),
  unique (contract_key, data_from, data_through)
);

create index source_gaps_contract_idx
  on public.source_gaps (contract_key, data_from desc);
create index source_gaps_resolved_run_idx
  on public.source_gaps (resolved_by_run_id)
  where resolved_by_run_id is not null;
create index source_gaps_open_idx
  on public.source_gaps (contract_key, data_from)
  where state in ('open', 'replaying');

create table public.source_jobs (
  id uuid primary key default gen_random_uuid(),
  contract_key text not null references public.source_contracts(key),
  contract_version integer not null check (contract_version > 0),
  trigger_kind text not null check (
    trigger_kind in ('scheduled', 'manual', 'replay', 'dependency')
  ),
  idempotency_key text not null unique,
  scheduled_for timestamptz not null,
  data_from timestamptz not null,
  data_through timestamptz not null,
  execution_target text not null check (
    execution_target in ('cloudflare', 'github')
  ),
  state text not null default 'queued' check (
    state in ('queued', 'running', 'retry_wait', 'succeeded', 'failed')
  ),
  enqueued_by text[] not null default '{}',
  available_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null check (max_attempts between 1 and 10),
  retry_base_seconds integer not null check (retry_base_seconds between 1 and 3600),
  retry_until timestamptz not null,
  gap_id uuid references public.source_gaps(id),
  started_at timestamptz,
  finished_at timestamptz,
  last_error_at timestamptz,
  last_public_reason_code text check (
    last_public_reason_code is null
    or last_public_reason_code in (
      'credentials_missing',
      'licence_invalid',
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (data_from < data_through),
  check (attempt_count <= max_attempts),
  check (finished_at is null or started_at is null or finished_at >= started_at)
);

create unique index source_jobs_scheduled_slot_idx
  on public.source_jobs (contract_key, scheduled_for)
  where trigger_kind = 'scheduled';
create index source_jobs_contract_idx
  on public.source_jobs (contract_key, scheduled_for desc);
create index source_jobs_gap_idx
  on public.source_jobs (gap_id)
  where gap_id is not null;
create index source_jobs_claim_idx
  on public.source_jobs (
    execution_target,
    state,
    available_at,
    scheduled_for,
    created_at
  )
  where state in ('queued', 'retry_wait');

create table public.source_job_leases (
  contract_key text primary key references public.source_contracts(key),
  job_id uuid not null unique references public.source_jobs(id) on delete cascade,
  worker_id text not null check (length(worker_id) between 1 and 200),
  attempt integer not null check (attempt > 0),
  leased_at timestamptz not null,
  lease_expires_at timestamptz not null,
  check (lease_expires_at > leased_at)
);

create index source_job_leases_expiry_idx
  on public.source_job_leases (lease_expires_at);

alter table public.source_runs
  add column job_id uuid references public.source_jobs(id),
  add column attempt integer check (attempt > 0),
  add constraint source_runs_job_attempt_pair check (
    (job_id is null) = (attempt is null)
  );

create unique index source_runs_job_attempt_idx
  on public.source_runs (job_id, attempt)
  where job_id is not null;
create index source_runs_job_idx
  on public.source_runs (job_id)
  where job_id is not null;

create or replace function private.record_source_run(
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
  _private_diagnostic text,
  _job_id uuid,
  _attempt integer
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
  if _job_id is null then
    select version
    into _contract_version
    from public.source_contracts
    where key = _contract_key;
  else
    select contract_version
    into _contract_version
    from public.source_jobs
    where id = _job_id
      and contract_key = _contract_key;
  end if;

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
    private_diagnostic,
    job_id,
    attempt
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
    _private_diagnostic,
    _job_id,
    _attempt
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
    last_scheduled_for,
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
    _scheduled_for,
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
    last_scheduled_for = excluded.last_scheduled_for,
    last_attempt_at = greatest(
      public.source_checkpoints.last_attempt_at,
      excluded.last_attempt_at
    ),
    last_success_at = case
      when _outcome = 'succeeded' then greatest(
        public.source_checkpoints.last_success_at,
        excluded.last_success_at
      )
      else public.source_checkpoints.last_success_at
    end,
    upstream_published_at = case
      when _outcome = 'succeeded' then greatest(
        public.source_checkpoints.upstream_published_at,
        excluded.upstream_published_at
      )
      else public.source_checkpoints.upstream_published_at
    end,
    data_from = case
      when _outcome = 'succeeded' then greatest(
        public.source_checkpoints.data_from,
        excluded.data_from
      )
      else public.source_checkpoints.data_from
    end,
    data_through = case
      when _outcome = 'succeeded' then greatest(
        public.source_checkpoints.data_through,
        excluded.data_through
      )
      else public.source_checkpoints.data_through
    end,
    validated_at = case
      when _outcome = 'succeeded' then greatest(
        public.source_checkpoints.validated_at,
        excluded.validated_at
      )
      else public.source_checkpoints.validated_at
    end,
    published_at = case
      when _outcome = 'succeeded' then greatest(
        public.source_checkpoints.published_at,
        excluded.published_at
      )
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
    updated_at = now()
  where public.source_checkpoints.last_scheduled_for is null
    or excluded.last_scheduled_for >= public.source_checkpoints.last_scheduled_for;

  return _run_id;
end;
$$;

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
language sql
security invoker
set search_path = ''
as $$
  select private.record_source_run(
    _contract_key,
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
    _records_seen,
    _records_inserted,
    _records_updated,
    _records_rejected,
    _records_expected,
    _coverage_status,
    _quality_checks,
    _public_reason_code,
    _private_diagnostic,
    null,
    null
  )
$$;

revoke all on function private.record_source_run(
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
  text,
  uuid,
  integer
) from public, anon, authenticated, service_role;

alter table public.source_gaps enable row level security;
alter table public.source_jobs enable row level security;
alter table public.source_job_leases enable row level security;

revoke all on public.source_gaps
  from public, anon, authenticated, service_role;
revoke all on public.source_jobs
  from public, anon, authenticated, service_role;
revoke all on public.source_job_leases
  from public, anon, authenticated, service_role;

grant select on public.source_gaps to service_role;
grant select on public.source_jobs to service_role;
grant select on public.source_job_leases to service_role;

create or replace function public.enqueue_due_source_jobs(
  _observed_at timestamptz,
  _enqueued_by text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _contract public.source_contracts%rowtype;
  _observed_minute timestamptz;
  _epoch_minute bigint;
  _slot_minute bigint;
  _scheduled_for timestamptz;
  _inserted integer := 0;
  _affected integer;
begin
  if _enqueued_by not in ('database', 'cloudflare') then
    raise exception 'unsupported scheduler: %', _enqueued_by;
  end if;

  _observed_minute := date_trunc('minute', _observed_at);
  _epoch_minute := floor(extract(epoch from _observed_minute) / 60)::bigint;

  for _contract in
    select *
    from public.source_contracts
    where enabled and schedule_enabled
    order by key
  loop
    _slot_minute := (
      (_epoch_minute - _contract.schedule_offset_minutes)
      / _contract.cadence_minutes
    ) * _contract.cadence_minutes + _contract.schedule_offset_minutes;
    _scheduled_for := to_timestamp(_slot_minute * 60);

    insert into public.source_jobs (
      contract_key,
      contract_version,
      trigger_kind,
      idempotency_key,
      scheduled_for,
      data_from,
      data_through,
      execution_target,
      enqueued_by,
      available_at,
      max_attempts,
      retry_base_seconds,
      retry_until
    )
    values (
      _contract.key,
      _contract.version,
      'scheduled',
      'scheduled:' || _contract.key || ':' || to_char(
        _scheduled_for at time zone 'utc',
        'YYYY-MM-DD"T"HH24:MI:SS"Z"'
      ),
      _scheduled_for,
      _scheduled_for - make_interval(
        mins => _contract.cadence_minutes + _contract.overlap_minutes
      ),
      _scheduled_for,
      _contract.execution_target,
      array[_enqueued_by],
      _observed_minute,
      _contract.max_attempts,
      _contract.retry_base_seconds,
      _scheduled_for + make_interval(mins => _contract.retry_window_minutes)
    )
    on conflict (contract_key, scheduled_for)
      where trigger_kind = 'scheduled'
    do nothing;

    get diagnostics _affected = row_count;
    _inserted := _inserted + _affected;

    if _affected = 0 then
      update public.source_jobs
      set
        enqueued_by = (
          select array_agg(distinct scheduler order by scheduler)
          from unnest(
            public.source_jobs.enqueued_by || array[_enqueued_by]
          ) scheduler
        ),
        updated_at = _observed_minute
      where contract_key = _contract.key
        and scheduled_for = _scheduled_for
        and trigger_kind = 'scheduled';
    end if;
  end loop;

  return _inserted;
end;
$$;

create or replace function public.claim_source_job(
  _worker_id text,
  _execution_target text,
  _contract_key text default null,
  _now timestamptz default now()
)
returns setof public.source_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  _candidate record;
  _expired public.source_jobs%rowtype;
  _expired_attempt integer;
  _expired_gap_id uuid;
  _expired_gap_state text;
  _expired_reason text;
  _maintenance_remaining integer := 25;
  _obsolete public.source_jobs%rowtype;
  _obsolete_attempt integer;
  _obsolete_gap_id uuid;
  _affected integer;
begin
  if length(coalesce(_worker_id, '')) not between 1 and 200 then
    raise exception 'invalid worker id';
  end if;
  if _execution_target not in ('cloudflare', 'github') then
    raise exception 'invalid execution target';
  end if;

  -- Retry windows describe whether the interval is still useful, not merely
  -- when another attempt may begin. Once the window closes, audit the missed
  -- attempt and preserve a replayable or explicitly unrecoverable gap.
  for _expired in
    select job.*
    from public.source_jobs as job
    where job.execution_target = _execution_target
      and (_contract_key is null or job.contract_key = _contract_key)
      and job.state in ('queued', 'retry_wait')
      and job.retry_until <= _now
    order by job.contract_key, job.scheduled_for, job.id
    limit _maintenance_remaining
    for update of job skip locked
  loop
    _maintenance_remaining := _maintenance_remaining - 1;
    _expired_attempt := least(
      _expired.attempt_count + 1,
      _expired.max_attempts
    );
    _expired_reason := coalesce(
      _expired.last_public_reason_code,
      'data_delayed'
    );

    update public.source_jobs
    set
      state = 'failed',
      attempt_count = _expired_attempt,
      started_at = coalesce(started_at, _now),
      finished_at = _now,
      last_error_at = _now,
      last_public_reason_code = _expired_reason,
      updated_at = _now
    where id = _expired.id;

    perform private.record_source_run(
      _contract_key => _expired.contract_key,
      _trigger_kind => _expired.trigger_kind,
      _idempotency_key => 'job:' || _expired.id::text
        || ':attempt:' || _expired_attempt::text,
      _scheduled_for => _expired.scheduled_for,
      _started_at => _now,
      _finished_at => _now,
      _outcome => 'failed',
      _upstream_published_at => null,
      _data_from => null,
      _data_through => null,
      _validated_at => null,
      _published_at => null,
      _records_seen => 0,
      _records_inserted => 0,
      _records_updated => 0,
      _records_rejected => 0,
      _records_expected => null,
      _coverage_status => 'unknown',
      _quality_checks => '{"usefulness_window_expired":true}'::jsonb,
      _public_reason_code => _expired_reason,
      _private_diagnostic => 'source job usefulness window expired',
      _job_id => _expired.id,
      _attempt => _expired_attempt
    );

    select case
      when contract.replay_capability = 'interval'
        and contract.replay_window_minutes is not null
        and _expired.data_from >= _now - make_interval(
          mins => contract.replay_window_minutes
        ) then 'open'
      else 'unrecoverable'
    end
    into _expired_gap_state
    from public.source_contracts as contract
    where contract.key = _expired.contract_key;

    insert into public.source_gaps (
      contract_key,
      data_from,
      data_through,
      state,
      public_reason_code,
      detected_at,
      updated_at
    )
    values (
      _expired.contract_key,
      _expired.data_from,
      _expired.data_through,
      _expired_gap_state,
      _expired_reason,
      _now,
      _now
    )
    on conflict (contract_key, data_from, data_through) do update
    set
      state = case
        when public.source_gaps.state = 'resolved' then 'resolved'
        else excluded.state
      end,
      public_reason_code = excluded.public_reason_code,
      updated_at = excluded.updated_at
    returning id into _expired_gap_id;

    update public.source_jobs
    set gap_id = coalesce(gap_id, _expired_gap_id)
    where id = _expired.id;
  end loop;

  -- A current-only adapter must never run today's payload while claiming an
  -- older interval. Audit every superseded slot, preserve its gap, then claim
  -- only the newest useful scheduled job for that contract.
  for _obsolete in
    select job.*
    from public.source_jobs as job
    join public.source_contracts as contract
      on contract.key = job.contract_key
    where job.execution_target = _execution_target
      and (_contract_key is null or job.contract_key = _contract_key)
      and contract.replay_capability = 'none'
      and job.trigger_kind = 'scheduled'
      and job.state in ('queued', 'retry_wait')
      and job.attempt_count < job.max_attempts
      and exists (
        select 1
        from public.source_jobs as newer
        where newer.contract_key = job.contract_key
          and newer.trigger_kind = 'scheduled'
          and newer.scheduled_for > job.scheduled_for
          and newer.available_at <= _now
      )
    order by job.contract_key, job.scheduled_for, job.id
    limit _maintenance_remaining
    for update of job skip locked
  loop
    _maintenance_remaining := _maintenance_remaining - 1;
    _obsolete_attempt := _obsolete.attempt_count + 1;

    update public.source_jobs
    set
      state = 'failed',
      attempt_count = _obsolete_attempt,
      started_at = coalesce(started_at, _now),
      finished_at = _now,
      last_error_at = _now,
      last_public_reason_code = 'data_delayed',
      updated_at = _now
    where id = _obsolete.id;

    perform private.record_source_run(
      _contract_key => _obsolete.contract_key,
      _trigger_kind => _obsolete.trigger_kind,
      _idempotency_key => 'job:' || _obsolete.id::text
        || ':attempt:' || _obsolete_attempt::text,
      _scheduled_for => _obsolete.scheduled_for,
      _started_at => _now,
      _finished_at => _now,
      _outcome => 'failed',
      _upstream_published_at => null,
      _data_from => null,
      _data_through => null,
      _validated_at => null,
      _published_at => null,
      _records_seen => 0,
      _records_inserted => 0,
      _records_updated => 0,
      _records_rejected => 0,
      _records_expected => null,
      _coverage_status => 'unknown',
      _quality_checks => '{"obsolete_slot":true}'::jsonb,
      _public_reason_code => 'data_delayed',
      _private_diagnostic => 'superseded by a newer current-only scheduled slot',
      _job_id => _obsolete.id,
      _attempt => _obsolete_attempt
    );

    insert into public.source_gaps (
      contract_key,
      data_from,
      data_through,
      state,
      public_reason_code,
      detected_at,
      updated_at
    )
    values (
      _obsolete.contract_key,
      _obsolete.data_from,
      _obsolete.data_through,
      'unrecoverable',
      'data_delayed',
      _now,
      _now
    )
    on conflict (contract_key, data_from, data_through) do update
    set
      state = case
        when public.source_gaps.state = 'resolved' then 'resolved'
        else 'unrecoverable'
      end,
      public_reason_code = excluded.public_reason_code,
      updated_at = excluded.updated_at
    returning id into _obsolete_gap_id;

    update public.source_jobs
    set gap_id = coalesce(gap_id, _obsolete_gap_id)
    where id = _obsolete.id;
  end loop;

  for _candidate in
    select
      job.id,
      job.contract_key,
      contract.lease_seconds
    from public.source_jobs as job
    join public.source_contracts as contract
      on contract.key = job.contract_key
    where job.execution_target = _execution_target
      and (_contract_key is null or job.contract_key = _contract_key)
      and job.state in ('queued', 'retry_wait')
      and job.available_at <= _now
      and job.retry_until > _now
      and job.attempt_count < job.max_attempts
      and contract.enabled
      and not (
        contract.replay_capability = 'none'
        and job.trigger_kind = 'scheduled'
        and exists (
          select 1
          from public.source_jobs as newer
          where newer.contract_key = job.contract_key
            and newer.trigger_kind = 'scheduled'
            and newer.scheduled_for > job.scheduled_for
            and newer.available_at <= _now
        )
      )
      and not exists (
        select 1
        from public.source_job_leases as lease
        where lease.contract_key = job.contract_key
      )
      and not exists (
        select 1
        from unnest(contract.dependency_keys) as dependency_key
        join public.source_contracts as dependency
          on dependency.key = dependency_key
        left join public.source_checkpoints as checkpoint
          on checkpoint.contract_key = dependency.key
        where case
          when dependency.schedule_enabled then coalesce((
            select dependency_job.state
            from public.source_jobs as dependency_job
            where dependency_job.contract_key = dependency.key
              and dependency_job.scheduled_for <= job.scheduled_for
              and dependency_job.scheduled_for
                > job.scheduled_for - make_interval(mins => dependency.cadence_minutes)
            order by dependency_job.scheduled_for desc, dependency_job.created_at desc
            limit 1
          ), 'missing') not in ('succeeded', 'failed')
          else coalesce(
            checkpoint.published_at,
            checkpoint.validated_at,
            checkpoint.last_success_at
          ) is null
        end
      )
    order by
      job.scheduled_for,
      case contract.criticality
        when 'critical' then 0
        when 'supporting' then 1
        else 2
      end,
      job.created_at,
      job.id
    for update of job skip locked
  loop
    insert into public.source_job_leases (
      contract_key,
      job_id,
      worker_id,
      attempt,
      leased_at,
      lease_expires_at
    )
    values (
      _candidate.contract_key,
      _candidate.id,
      _worker_id,
      (
        select attempt_count + 1
        from public.source_jobs
        where id = _candidate.id
      ),
      _now,
      _now + make_interval(secs => _candidate.lease_seconds)
    )
    on conflict do nothing;

    get diagnostics _affected = row_count;
    if _affected = 0 then
      continue;
    end if;

    update public.source_jobs
    set
      state = 'running',
      attempt_count = attempt_count + 1,
      started_at = _now,
      finished_at = null,
      updated_at = _now
    where id = _candidate.id;

    return query
      select * from public.source_jobs where id = _candidate.id;
    return;
  end loop;
end;
$$;

create or replace function public.source_job_queue_has_pending(
  _execution_target text,
  _contract_key text default null,
  _now timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.source_jobs as job
    where job.execution_target = _execution_target
      and (_contract_key is null or job.contract_key = _contract_key)
      and job.state in ('queued', 'running', 'retry_wait')
  );
$$;

create or replace function public.complete_source_job(
  _job_id uuid,
  _worker_id text,
  _attempt integer,
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
  _private_diagnostic text,
  _retryable boolean
)
returns public.source_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  _job public.source_jobs%rowtype;
  _lease public.source_job_leases%rowtype;
  _run_id uuid;
  _gap_id uuid;
  _replay_capability text;
  _delay_seconds integer;
  _next_available_at timestamptz;
  _will_retry boolean;
  _gap_state text;
begin
  select * into _lease
  from public.source_job_leases
  where job_id = _job_id
  for update;

  select * into _job
  from public.source_jobs
  where id = _job_id
  for update;

  if _job.id is null then
    raise exception 'unknown source job';
  end if;

  if _job.state <> 'running'
    or _lease.job_id is null
    or _lease.worker_id <> _worker_id
    or _lease.attempt <> _attempt
    or _job.attempt_count <> _attempt then
    raise exception 'source job lease does not match completion';
  end if;

  _run_id := private.record_source_run(
    _contract_key => _job.contract_key,
    _trigger_kind => _job.trigger_kind,
    _idempotency_key => 'job:' || _job.id::text || ':attempt:' || _attempt::text,
    _scheduled_for => _job.scheduled_for,
    _started_at => _lease.leased_at,
    _finished_at => _finished_at,
    _outcome => _outcome,
    _upstream_published_at => _upstream_published_at,
    _data_from => _data_from,
    _data_through => _data_through,
    _validated_at => _validated_at,
    _published_at => _published_at,
    _records_seen => _records_seen,
    _records_inserted => _records_inserted,
    _records_updated => _records_updated,
    _records_rejected => _records_rejected,
    _records_expected => _records_expected,
    _coverage_status => _coverage_status,
    _quality_checks => _quality_checks,
    _public_reason_code => _public_reason_code,
    _private_diagnostic => _private_diagnostic,
    _job_id => _job.id,
    _attempt => _attempt
  );

  delete from public.source_job_leases
  where job_id = _job.id;

  if _outcome in ('succeeded', 'skipped') then
    update public.source_jobs
    set
      state = 'succeeded',
      finished_at = _finished_at,
      last_public_reason_code = _public_reason_code,
      updated_at = _finished_at
    where id = _job.id;

    if _job.gap_id is not null and _outcome = 'succeeded' then
      update public.source_gaps
      set
        state = case
          when _data_from is not null
            and _data_through is not null
            and _data_from <= data_from
            and _data_through >= data_through then 'resolved'
          else 'open'
        end,
        resolved_by_run_id = case
          when _data_from is not null
            and _data_through is not null
            and _data_from <= data_from
            and _data_through >= data_through then _run_id
          else null
        end,
        resolved_at = case
          when _data_from is not null
            and _data_through is not null
            and _data_from <= data_from
            and _data_through >= data_through then _finished_at
          else null
        end,
        updated_at = _finished_at
      where id = _job.gap_id
        and state in ('open', 'replaying');
    end if;
  else
    select replay_capability into _replay_capability
    from public.source_contracts
    where key = _job.contract_key;

    _delay_seconds := least(
      _job.retry_base_seconds * power(2, greatest(_attempt - 1, 0))::integer,
      3600
    ) + mod(abs(hashtext(_job.id::text || ':' || _attempt::text)), _job.retry_base_seconds);
    _next_available_at := _finished_at + make_interval(secs => _delay_seconds);
    _will_retry := coalesce(_retryable, false)
      and _attempt < _job.max_attempts
      and _next_available_at < _job.retry_until;
    _gap_state := case
      when _will_retry or _replay_capability = 'interval' then 'open'
      else 'unrecoverable'
    end;

    insert into public.source_gaps (
      contract_key,
      data_from,
      data_through,
      state,
      public_reason_code,
      detected_at,
      updated_at
    )
    values (
      _job.contract_key,
      _job.data_from,
      _job.data_through,
      _gap_state,
      _public_reason_code,
      _finished_at,
      _finished_at
    )
    on conflict (contract_key, data_from, data_through) do update
    set
      state = case
        when public.source_gaps.state = 'resolved' then 'resolved'
        else excluded.state
      end,
      public_reason_code = excluded.public_reason_code,
      updated_at = excluded.updated_at
    returning id into _gap_id;

    _gap_id := coalesce(_job.gap_id, _gap_id);

    if _will_retry then
      update public.source_jobs
      set
        state = 'retry_wait',
        gap_id = _gap_id,
        available_at = _next_available_at,
        finished_at = null,
        last_error_at = _finished_at,
        last_public_reason_code = _public_reason_code,
        updated_at = _finished_at
      where id = _job.id;
    else
      update public.source_jobs
      set
        state = 'failed',
        gap_id = _gap_id,
        finished_at = _finished_at,
        last_error_at = _finished_at,
        last_public_reason_code = _public_reason_code,
        updated_at = _finished_at
      where id = _job.id;
    end if;
  end if;

  select * into _job
  from public.source_jobs
  where id = _job_id;
  return _job;
end;
$$;

create or replace function private.requeue_expired_source_jobs(
  _now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _lease public.source_job_leases%rowtype;
  _recovered integer := 0;
begin
  for _lease in
    select *
    from public.source_job_leases
    where lease_expires_at <= _now
    order by contract_key
  loop
    begin
      perform public.complete_source_job(
        _job_id => _lease.job_id,
        _worker_id => _lease.worker_id,
        _attempt => _lease.attempt,
        _finished_at => _now,
        _outcome => 'failed',
        _upstream_published_at => null,
        _data_from => null,
        _data_through => null,
        _validated_at => null,
        _published_at => null,
        _records_seen => 0,
        _records_inserted => 0,
        _records_updated => 0,
        _records_rejected => 0,
        _records_expected => null,
        _coverage_status => 'unknown',
        _quality_checks => '{"lease_expired":true}'::jsonb,
        _public_reason_code => 'internal_error',
        _private_diagnostic => 'source job lease expired',
        _retryable => true
      );
      _recovered := _recovered + 1;
    exception when raise_exception then
      if sqlerrm <> 'source job lease does not match completion' then
        raise;
      end if;
    end;
  end loop;

  return _recovered;
end;
$$;

create or replace function public.enqueue_source_replay(
  _gap_id uuid,
  _requested_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _gap public.source_gaps%rowtype;
  _contract public.source_contracts%rowtype;
  _job_id uuid;
  _replay_count integer;
begin
  select * into _gap
  from public.source_gaps
  where id = _gap_id
  for update;

  if _gap.id is null then
    raise exception 'unknown source gap';
  end if;

  select * into _contract
  from public.source_contracts
  where key = _gap.contract_key;

  if _contract.replay_capability <> 'interval' then
    raise exception 'source gap is not replayable';
  end if;
  if _gap.state <> 'open' then
    raise exception 'source gap is not open';
  end if;
  if _gap.data_from < _requested_at
    - make_interval(mins => _contract.replay_window_minutes) then
    update public.source_gaps
    set
      state = 'unrecoverable',
      updated_at = _requested_at
    where id = _gap.id;
    return null;
  end if;
  if exists (
    select 1
    from public.source_jobs
    where gap_id = _gap.id
      and state in ('queued', 'running', 'retry_wait')
  ) then
    raise exception 'source gap already has active work';
  end if;

  _replay_count := _gap.replay_count + 1;

  insert into public.source_jobs (
    contract_key,
    contract_version,
    trigger_kind,
    idempotency_key,
    scheduled_for,
    data_from,
    data_through,
    execution_target,
    enqueued_by,
    available_at,
    max_attempts,
    retry_base_seconds,
    retry_until,
    gap_id
  )
  values (
    _contract.key,
    _contract.version,
    'replay',
    'replay:' || _gap.id::text || ':' || _replay_count::text,
    _gap.data_through,
    _gap.data_from,
    _gap.data_through,
    _contract.execution_target,
    array['manual'],
    _requested_at,
    _contract.max_attempts,
    _contract.retry_base_seconds,
    _requested_at + make_interval(mins => _contract.retry_window_minutes),
    _gap.id
  )
  returning id into _job_id;

  update public.source_gaps
  set
    state = 'replaying',
    replay_count = _replay_count,
    updated_at = _requested_at
  where id = _gap.id;

  return _job_id;
end;
$$;

create or replace function public.source_contract_is_backfilling(
  _contract_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.source_gaps as gap
    where gap.contract_key = _contract_key
      and gap.state = 'replaying'
  )
$$;

revoke all on function public.source_contract_is_backfilling(text)
  from public;
grant execute on function public.source_contract_is_backfilling(text)
  to anon, authenticated, service_role;

create or replace view public.source_health
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
    public.source_contract_is_backfilling(contract.key) as is_backfilling,
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
    when is_backfilling then 'backfilling'
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
grant select on public.source_health to anon, authenticated, service_role;

create view public.source_watchdog
with (security_invoker = true)
as
with expected as (
  select
    contract.key as contract_key,
    contract.warning_after_minutes,
    to_timestamp((
      (
        (
          floor(extract(epoch from date_trunc('minute', now())) / 60)::bigint
          - contract.schedule_offset_minutes
        ) / contract.cadence_minutes
      ) * contract.cadence_minutes
      + contract.schedule_offset_minutes
    ) * 60) as expected_for
  from public.source_contracts as contract
  where contract.enabled and contract.schedule_enabled
), missing as (
  select
    expected.contract_key,
    'missing_job'::text as issue_code,
    null::uuid as job_id,
    expected.expected_for as scheduled_for,
    null::timestamptz as lease_expires_at
  from expected
  where not exists (
    select 1
    from public.source_jobs as job
    where job.contract_key = expected.contract_key
      and job.scheduled_for = expected.expected_for
  )
), delayed as (
  select
    job.contract_key,
    'queue_delayed'::text as issue_code,
    job.id as job_id,
    job.scheduled_for,
    lease.lease_expires_at
  from public.source_jobs as job
  join public.source_contracts as contract
    on contract.key = job.contract_key
  left join public.source_job_leases as lease
    on lease.job_id = job.id
  where job.state in ('queued', 'running', 'retry_wait')
    and now() > job.scheduled_for
      + make_interval(mins => contract.warning_after_minutes)
), expired as (
  select
    lease.contract_key,
    'lease_expired'::text as issue_code,
    lease.job_id,
    job.scheduled_for,
    lease.lease_expires_at
  from public.source_job_leases as lease
  join public.source_jobs as job on job.id = lease.job_id
  where lease.lease_expires_at <= now()
), run_delayed as (
  select
    health.key as contract_key,
    'run_delayed'::text as issue_code,
    null::uuid as job_id,
    expected.expected_for as scheduled_for,
    null::timestamptz as lease_expires_at
  from public.source_health as health
  join expected on expected.contract_key = health.key
  where health.state in ('delayed', 'stale', 'unavailable')
)
select *, now() as observed_at from missing
union all
select *, now() as observed_at from delayed
union all
select *, now() as observed_at from expired
union all
select *, now() as observed_at from run_delayed;

revoke all on public.source_watchdog
  from public, anon, authenticated, service_role;
grant select on public.source_watchdog to service_role;

revoke all on function public.enqueue_due_source_jobs(timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.claim_source_job(text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.source_job_queue_has_pending(
  text,
  text,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.complete_source_job(
  uuid,
  text,
  integer,
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
  text,
  boolean
) from public, anon, authenticated;
revoke all on function public.enqueue_source_replay(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function private.requeue_expired_source_jobs(timestamptz)
  from public, anon, authenticated, service_role;

grant execute on function public.enqueue_due_source_jobs(timestamptz, text)
  to service_role;
grant execute on function public.claim_source_job(text, text, text, timestamptz)
  to service_role;
grant execute on function public.source_job_queue_has_pending(
  text,
  text,
  timestamptz
) to service_role;
grant execute on function public.complete_source_job(
  uuid,
  text,
  integer,
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
  text,
  boolean
) to service_role;
grant execute on function public.enqueue_source_replay(uuid, timestamptz)
  to service_role;

select cron.unschedule(jobname)
from cron.job
where jobname in (
  'nadhir-ingest',
  'nadhir-risk',
  'nadhir-alerts',
  'nadhir-source-enqueue',
  'nadhir-source-recover'
);

select cron.schedule(
  'nadhir-source-enqueue',
  '* * * * *',
  $$select public.enqueue_due_source_jobs(now(), 'database')$$
);
select cron.schedule(
  'nadhir-source-recover',
  '* * * * *',
  $$select private.requeue_expired_source_jobs(now())$$
);
