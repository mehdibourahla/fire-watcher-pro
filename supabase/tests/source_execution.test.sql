begin;

set local search_path = public, extensions;

select no_plan();

select has_table('public', 'source_jobs', 'source job queue exists');
select has_table('public', 'source_job_leases', 'per-contract leases exist');
select has_table('public', 'source_gaps', 'source gaps exist');
select has_view('public', 'source_watchdog', 'watchdog projection exists');
select has_column(
  'public',
  'source_contracts',
  'replay_capability',
  'contracts declare whether exact interval replay is supported'
);

select has_function(
  'public',
  'enqueue_due_source_jobs',
  array['timestamp with time zone', 'text'],
  'due-job enqueue RPC exists'
);
select has_function(
  'public',
  'claim_source_job',
  array['text', 'text', 'text', 'timestamp with time zone'],
  'job claim RPC exists'
);
select has_function(
  'public',
  'source_job_queue_has_pending',
  array['text', 'text', 'timestamp with time zone'],
  'pending queue inspection RPC exists'
);
select has_function(
  'public',
  'complete_source_job',
  array[
    'uuid',
    'text',
    'integer',
    'timestamp with time zone',
    'text',
    'timestamp with time zone',
    'timestamp with time zone',
    'timestamp with time zone',
    'timestamp with time zone',
    'timestamp with time zone',
    'integer',
    'integer',
    'integer',
    'integer',
    'integer',
    'text',
    'jsonb',
    'text',
    'text',
    'boolean'
  ],
  'job completion RPC exists'
);
select has_function(
  'public',
  'enqueue_source_replay',
  array['uuid', 'timestamp with time zone'],
  'gap replay RPC exists'
);

select ok(
  (
    select bool_and(relrowsecurity)
    from pg_class
    where oid = any(array[
      'public.source_jobs'::regclass,
      'public.source_job_leases'::regclass,
      'public.source_gaps'::regclass
    ])
  ),
  'RLS is enabled on every execution table'
);
select ok(
  not has_table_privilege('anon', 'public.source_jobs', 'select')
  and not has_table_privilege('authenticated', 'public.source_jobs', 'select')
  and not has_table_privilege('anon', 'public.source_gaps', 'select')
  and not has_table_privilege('authenticated', 'public.source_gaps', 'select'),
  'queue and gap rows are private'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.enqueue_due_source_jobs(timestamp with time zone,text)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.enqueue_due_source_jobs(timestamp with time zone,text)',
    'execute'
  ),
  'only the service role can enqueue due work'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.claim_source_job(text,text,text,timestamp with time zone)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.claim_source_job(text,text,text,timestamp with time zone)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.source_job_queue_has_pending(text,text,timestamp with time zone)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.source_job_queue_has_pending(text,text,timestamp with time zone)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.enqueue_source_replay(uuid,timestamp with time zone)',
    'execute'
  ),
  'public roles cannot claim or replay work'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.complete_source_job(uuid,text,integer,timestamp with time zone,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,integer,integer,integer,integer,integer,text,jsonb,text,text,boolean)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.complete_source_job(uuid,text,integer,timestamp with time zone,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,integer,integer,integer,integer,integer,text,jsonb,text,text,boolean)',
    'execute'
  )
  and not has_table_privilege('anon', 'public.source_watchdog', 'select')
  and not has_table_privilege(
    'authenticated',
    'public.source_watchdog',
    'select'
  ),
  'public roles cannot complete work or inspect the watchdog'
);
select has_index(
  'public',
  'source_jobs',
  'source_jobs_claim_idx',
  'claimable jobs have a partial lookup index'
);
select has_index(
  'public',
  'source_job_leases',
  'source_job_leases_expiry_idx',
  'expired leases have a lookup index'
);
select has_index(
  'public',
  'source_runs',
  'source_runs_job_idx',
  'source run job foreign keys are indexed'
);
select is(
  (
    select count(*)::integer
    from cron.job
    where jobname in ('nadhir-source-enqueue', 'nadhir-source-recover')
  ),
  2,
  'database enqueue and expired-lease recovery schedules are active'
);
select is(
  (
    select count(*)::integer
    from cron.job
    where jobname in ('nadhir-ingest', 'nadhir-risk', 'nadhir-alerts')
  ),
  0,
  'legacy HTTP pipeline schedules are removed'
);
select ok(
  (
    select bool_and(command not like '%net.http_post%')
    from cron.job
    where jobname in ('nadhir-source-enqueue', 'nadhir-source-recover')
  ),
  'database schedules invoke queue functions without HTTP fan-out'
);

update public.source_contracts
set schedule_enabled = key in ('fci', 'firms');

delete from public.source_job_leases;
delete from public.source_jobs;
delete from public.source_gaps;

select is(
  public.enqueue_due_source_jobs(
    '2026-08-31 20:07:45+00'::timestamptz,
    'database'
  ),
  2,
  'database scheduler enqueues each due contract once'
);
select is(
  public.enqueue_due_source_jobs(
    '2026-08-31 20:07:59+00'::timestamptz,
    'cloudflare'
  ),
  0,
  'the second scheduler observes existing normalized slots'
);
select is(
  (
    select count(*)::integer
    from public.source_jobs
    where scheduled_for = '2026-08-31 20:00:00+00'
  ),
  2,
  'database and Cloudflare enqueue one job per contract and slot'
);
select ok(
  (
    select bool_and(enqueued_by = array['cloudflare', 'database'])
    from public.source_jobs
  ),
  'deduplicated jobs retain evidence from both schedulers'
);

create temporary table first_claim as
select * from public.claim_source_job(
  'pgtap-worker-a',
  'cloudflare',
  null,
  '2026-08-31 20:08:00+00'
);
create temporary table second_claim as
select * from public.claim_source_job(
  'pgtap-worker-b',
  'cloudflare',
  null,
  '2026-08-31 20:08:00+00'
);

select is(
  (select count(*)::integer from first_claim),
  1,
  'the first worker claims one job'
);
select is(
  (select count(*)::integer from second_claim),
  1,
  'another contract remains claimable while the first lease is active'
);
select isnt(
  (select contract_key from first_claim),
  (select contract_key from second_claim),
  'sequential claims lease different contracts'
);
select is(
  (select count(*)::integer from public.source_job_leases),
  2,
  'one active lease is retained for each claimed contract'
);

create function pg_temp.enqueue_test_job(
  _contract_key text,
  _idempotency_key text,
  _scheduled_for timestamptz,
  _max_attempts integer default 3,
  _retry_until timestamptz default '2026-09-01 00:00:00+00',
  _gap_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  _job_id uuid;
begin
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
  select
    contract.key,
    contract.version,
    case when _gap_id is null then 'manual' else 'replay' end,
    _idempotency_key,
    _scheduled_for,
    _scheduled_for - interval '10 minutes',
    _scheduled_for,
    'cloudflare',
    array['manual'],
    _scheduled_for,
    _max_attempts,
    30,
    _retry_until,
    _gap_id
  from public.source_contracts as contract
  where contract.key = _contract_key
  returning id into _job_id;

  return _job_id;
end;
$$;

create function pg_temp.finish_test_job(
  _job_id uuid,
  _worker_id text,
  _finished_at timestamptz,
  _outcome text,
  _reason text,
  _retryable boolean,
  _covered_from timestamptz default null,
  _covered_through timestamptz default null
)
returns text
language sql
as $$
  select (public.complete_source_job(
    _job_id => _job_id,
    _worker_id => _worker_id,
    _attempt => (
      select attempt_count from public.source_jobs where id = _job_id
    ),
    _finished_at => _finished_at,
    _outcome => _outcome,
    _upstream_published_at => null,
    _data_from => _covered_from,
    _data_through => _covered_through,
    _validated_at => case when _outcome = 'succeeded' then _finished_at end,
    _published_at => case when _outcome = 'succeeded' then _finished_at end,
    _records_seen => case when _outcome = 'succeeded' then 1 else 0 end,
    _records_inserted => case when _outcome = 'succeeded' then 1 else 0 end,
    _records_updated => 0,
    _records_rejected => 0,
    _records_expected => 1,
    _coverage_status => case
      when _outcome = 'succeeded' then 'complete'
      else 'unknown'
    end,
    _quality_checks => '{}'::jsonb,
    _public_reason_code => _reason,
    _private_diagnostic => case
      when _outcome = 'succeeded' then null
      else 'test-only diagnostic'
    end,
    _retryable => _retryable
  )).state
$$;

delete from public.source_job_leases;
delete from public.source_jobs;
delete from public.source_gaps;

update public.source_contracts
set dependency_keys = case
  when key = 'fusion' then array['firms']
  else dependency_keys
end;

select pg_temp.enqueue_test_job(
  'firms',
  'pgtap:dependency:firms',
  '2026-08-31 20:20:00+00'
);
select pg_temp.enqueue_test_job(
  'fusion',
  'pgtap:dependency:fusion',
  '2026-08-31 20:20:00+00'
);
select is(
  (
    select count(*)::integer
    from public.claim_source_job(
      'pgtap-dependent',
      'cloudflare',
      'fusion',
      '2026-08-31 20:21:00+00'
    )
  ),
  0,
  'a dependent job is unavailable before its dependency is terminal'
);
update public.source_jobs
set state = 'succeeded', finished_at = '2026-08-31 20:21:00+00'
where idempotency_key = 'pgtap:dependency:firms';
select is(
  (
    select count(*)::integer
    from public.claim_source_job(
      'pgtap-dependent',
      'cloudflare',
      'fusion',
      '2026-08-31 20:21:00+00'
    )
  ),
  1,
  'a dependent job becomes claimable after its dependency is terminal'
);

delete from public.source_job_leases;
delete from public.source_jobs;
delete from public.source_gaps;

update public.source_contracts
set dependency_keys = '{}'
where key in ('broadcast_publish', 'openmeteo_wind');

create temporary table transient_job as
select pg_temp.enqueue_test_job(
  'firms',
  'pgtap:transient',
  '2026-08-31 21:00:00+00'
) as id;
select * from public.claim_source_job(
  'pgtap-transient',
  'cloudflare',
  'firms',
  '2026-08-31 21:00:01+00'
);
select is(
  pg_temp.finish_test_job(
    (select id from transient_job),
    'pgtap-transient',
    '2026-08-31 21:00:02+00',
    'failed',
    'upstream_unreachable',
    true
  ),
  'retry_wait',
  'a transient failure enters retry wait'
);
select is(
  (
    select count(*)::integer
    from public.source_gaps
    where contract_key = 'firms' and state = 'open'
  ),
  1,
  'a transient failure records one open gap'
);
select is(
  (
    select count(*)::integer
    from public.source_runs
    where job_id = (select id from transient_job) and attempt = 1
  ),
  1,
  'the failed attempt is auditable against its job and attempt'
);
select throws_ok(
  format(
    $$select pg_temp.finish_test_job(%L::uuid, %L, %L::timestamptz, 'failed', 'upstream_unreachable', true)$$,
    (select id from transient_job),
    'pgtap-transient',
    '2026-08-31 21:00:03+00'
  ),
  'P0001',
  'source job lease does not match completion',
  'duplicate completion is rejected after the lease is released'
);
select is(
  (
    select count(*)::integer
    from public.source_runs
    where job_id = (select id from transient_job)
  ),
  1,
  'duplicate completion cannot append or advance the checkpoint twice'
);

create temporary table permanent_job as
select pg_temp.enqueue_test_job(
  'fci',
  'pgtap:permanent',
  '2026-08-31 21:10:00+00'
) as id;
select * from public.claim_source_job(
  'pgtap-permanent',
  'cloudflare',
  'fci',
  '2026-08-31 21:10:01+00'
);
select is(
  pg_temp.finish_test_job(
    (select id from permanent_job),
    'pgtap-permanent',
    '2026-08-31 21:10:02+00',
    'failed',
    'credentials_missing',
    false
  ),
  'failed',
  'a permanent failure becomes terminal immediately'
);

create temporary table licence_job as
select pg_temp.enqueue_test_job(
  'fci',
  'pgtap:licence-permanent',
  '2026-08-31 21:15:00+00'
) as id;
select * from public.claim_source_job(
  'pgtap-licence-permanent',
  'cloudflare',
  'fci',
  '2026-08-31 21:15:01+00'
);
select is(
  pg_temp.finish_test_job(
    (select id from licence_job),
    'pgtap-licence-permanent',
    '2026-08-31 21:15:02+00',
    'failed',
    'licence_invalid',
    false
  ),
  'failed',
  'a licence failure is accepted as permanent evidence'
);

create temporary table exhausted_job as
select pg_temp.enqueue_test_job(
  'onm',
  'pgtap:exhausted',
  '2026-08-31 21:20:00+00',
  1
) as id;
select * from public.claim_source_job(
  'pgtap-exhausted',
  'cloudflare',
  'onm',
  '2026-08-31 21:20:01+00'
);
select is(
  pg_temp.finish_test_job(
    (select id from exhausted_job),
    'pgtap-exhausted',
    '2026-08-31 21:20:02+00',
    'failed',
    'upstream_unreachable',
    true
  ),
  'failed',
  'max attempts stop a transient retry'
);
select is(
  (
    select state
    from public.source_gaps
    where contract_key = 'onm'
      and data_through = '2026-08-31 21:20:00+00'
  ),
  'unrecoverable',
  'a terminal failure becomes unrecoverable when the provider has no interval replay'
);
select throws_ok(
  format(
    $$select public.enqueue_source_replay(%L::uuid, '2026-08-31 21:21:00+00')$$,
    (
      select id
      from public.source_gaps
      where contract_key = 'onm'
        and data_through = '2026-08-31 21:20:00+00'
    )
  ),
  'P0001',
  'source gap is not replayable',
  'operator replay rejects a contract without exact interval support'
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
  'fci',
  '2026-05-01 00:00:00+00',
  '2026-05-01 00:10:00+00',
  'open',
  'upstream_unreachable',
  '2026-05-01 00:10:00+00',
  '2026-05-01 00:10:00+00'
);
select is(
  public.enqueue_source_replay(
    (
      select id
      from public.source_gaps
      where contract_key = 'fci'
        and data_from = '2026-05-01 00:00:00+00'
    ),
    '2026-08-31 22:00:00+00'
  ),
  null,
  'operator replay refuses an interval outside provider retention'
);
select is(
  (
    select state
    from public.source_gaps
    where contract_key = 'fci'
      and data_from = '2026-05-01 00:00:00+00'
  ),
  'unrecoverable',
  'an expired replay interval is durably marked unrecoverable'
);

create temporary table deadline_job as
select pg_temp.enqueue_test_job(
  'broadcast_publish',
  'pgtap:deadline',
  '2026-08-31 21:30:00+00',
  3,
  '2026-08-31 21:30:10+00'
) as id;
select * from public.claim_source_job(
  'pgtap-deadline',
  'cloudflare',
  'broadcast_publish',
  '2026-08-31 21:30:01+00'
);
select is(
  pg_temp.finish_test_job(
    (select id from deadline_job),
    'pgtap-deadline',
    '2026-08-31 21:30:02+00',
    'failed',
    'upstream_unreachable',
    true
  ),
  'failed',
  'the retry deadline stops a transient retry'
);

create temporary table expired_job as
select pg_temp.enqueue_test_job(
  'openmeteo_wind',
  'pgtap:expired',
  '2026-08-31 21:40:00+00'
) as id;
select * from public.claim_source_job(
  'pgtap-expired',
  'cloudflare',
  'openmeteo_wind',
  '2026-08-31 21:40:01+00'
);
select is(
  private.requeue_expired_source_jobs('2026-08-31 21:43:00+00'),
  1,
  'expired lease recovery audits one abandoned attempt'
);
select is(
  (
    select state from public.source_jobs
    where id = (select id from expired_job)
  ),
  'retry_wait',
  'an expired lease is requeued while retry budget remains'
);
select is(
  (
    select count(*)::integer
    from public.source_job_leases
    where job_id = (select id from expired_job)
  ),
  0,
  'expired lease recovery releases the contract'
);

create temporary table replay_gap as
select id, data_from, data_through
from public.source_gaps
where contract_key = 'firms'
limit 1;
update public.source_jobs
set state = 'failed', finished_at = '2026-08-31 21:59:00+00'
where id = (select id from transient_job);
create temporary table replay_job as
select public.enqueue_source_replay(
  (select id from replay_gap),
  '2026-08-31 22:00:00+00'
) as id;
select ok(
  (
    select job.data_from = gap.data_from
      and job.data_through = gap.data_through
    from public.source_jobs as job
    cross join replay_gap as gap
    where job.id = (select id from replay_job)
  ),
  'replay preserves the exact recorded gap interval'
);
select * from public.claim_source_job(
  'pgtap-replay-partial',
  'cloudflare',
  'firms',
  '2026-08-31 22:00:01+00'
);
select is(
  pg_temp.finish_test_job(
    (select id from replay_job),
    'pgtap-replay-partial',
    '2026-08-31 22:00:02+00',
    'succeeded',
    null,
    false,
    (select data_from + interval '1 minute' from replay_gap),
    (select data_through from replay_gap)
  ),
  'succeeded',
  'the replay job can succeed with narrower observed coverage'
);
select is(
  (
    select state from public.source_gaps
    where id = (select id from replay_gap)
  ),
  'open',
  'success without full interval coverage leaves the gap open'
);

create temporary table full_replay_job as
select public.enqueue_source_replay(
  (select id from replay_gap),
  '2026-08-31 22:10:00+00'
) as id;
select * from public.claim_source_job(
  'pgtap-replay-full',
  'cloudflare',
  'firms',
  '2026-08-31 22:10:01+00'
);
select is(
  pg_temp.finish_test_job(
    (select id from full_replay_job),
    'pgtap-replay-full',
    '2026-08-31 22:10:02+00',
    'succeeded',
    null,
    false,
    (select data_from from replay_gap),
    (select data_through from replay_gap)
  ),
  'succeeded',
  'a full-coverage replay succeeds'
);
select is(
  (
    select state from public.source_gaps
    where id = (select id from replay_gap)
  ),
  'resolved',
  'full interval coverage resolves the gap exactly once'
);

select is(
  (
    select count(*)::integer
    from public.source_watchdog
    where issue_code not in (
      'missing_job',
      'queue_delayed',
      'lease_expired',
      'run_delayed'
    )
  ),
  0,
  'the watchdog exposes only allow-listed issue codes'
);
select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'source_watchdog'
      and column_name = any(array[
        'private_diagnostic',
        'payload',
        'url',
        'credentials'
      ])
  ),
  0,
  'the watchdog cannot expose diagnostics, payloads, URLs, or credentials'
);

create function pg_temp.read_source_health_as_anon()
returns integer
language plpgsql
as $$
declare
  _count integer;
begin
  execute 'set local role anon';
  execute 'select count(*) from public.source_health' into _count;
  execute 'reset role';
  return _count;
exception when others then
  execute 'reset role';
  raise;
end;
$$;
select lives_ok(
  'select pg_temp.read_source_health_as_anon()',
  'anon can query sanitized health while gap rows remain private'
);

select has_index(
  'public',
  'detections',
  'detections_natural_key_key',
  'detection replay is idempotent by natural key'
);
select has_index(
  'public',
  'risk_forecasts',
  'risk_forecasts_commune_id_forecast_date_horizon_days_source_key',
  'risk replay is idempotent by commune, date, horizon, and source'
);
select has_index(
  'public',
  'alerts',
  'alerts_user_id_dedupe_key_key',
  'alert replay is idempotent by user and decision key'
);
select has_index(
  'public',
  'onm_vigilance',
  'onm_vigilance_cap_id_key',
  'ONM replay is idempotent by CAP identifier'
);
select has_index(
  'public',
  'broadcasts',
  'idx_broadcasts_onm_once',
  'ONM broadcast replay is idempotent'
);
select has_index(
  'public',
  'broadcasts',
  'idx_broadcasts_authority_once',
  'authority broadcast replay is idempotent'
);

create temporary table versioned_job as
select
  pg_temp.enqueue_test_job(
    'fci',
    'pgtap:contract-version',
    '2026-08-31 23:00:00+00'
  ) as id,
  (
    select version
    from public.source_contracts
    where key = 'fci'
  ) as contract_version;
update public.source_contracts
set version = version + 1
where key = 'fci';
select * from public.claim_source_job(
  'pgtap-contract-version',
  'cloudflare',
  'fci',
  '2026-08-31 23:00:01+00'
);
select is(
  pg_temp.finish_test_job(
    (select id from versioned_job),
    'pgtap-contract-version',
    '2026-08-31 23:00:02+00',
    'succeeded',
    null,
    false,
    '2026-08-31 22:50:00+00',
    '2026-08-31 23:00:00+00'
  ),
  'succeeded',
  'a queued job can complete after its contract version changes'
);
select is(
  (
    select run.contract_version
    from public.source_runs as run
    where run.job_id = (select id from versioned_job)
  ),
  (select contract_version from versioned_job),
  'job-backed run provenance uses the version captured at enqueue time'
);

update public.source_contracts
set dependency_keys = '{}'
where key = 'local_fwi';
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
select
  contract.key,
  contract.version,
  'scheduled',
  'pgtap:daily-backlog:' || slot.scheduled_for::text,
  slot.scheduled_for,
  slot.scheduled_for - interval '1 day',
  slot.scheduled_for,
  'github',
  array['database'],
  slot.scheduled_for,
  contract.max_attempts,
  contract.retry_base_seconds,
  '2099-09-02 10:00:00+00'::timestamptz
from public.source_contracts as contract
cross join (
  values
    ('2099-08-30 06:00:00+00'::timestamptz),
    ('2099-08-31 06:00:00+00'::timestamptz)
) as slot(scheduled_for)
where contract.key = 'local_fwi';

create temporary table daily_backlog_claim as
select * from public.claim_source_job(
  'pgtap-daily-backlog',
  'github',
  'local_fwi',
  '2099-08-31 06:05:00+00'
);
select is(
  (select scheduled_for from daily_backlog_claim),
  '2099-08-31 06:00:00+00'::timestamptz,
  'a current-only daily consumer claims the newest useful slot'
);
select is(
  (
    select state
    from public.source_jobs
    where idempotency_key = 'pgtap:daily-backlog:2099-08-30 06:00:00+00'
  ),
  'failed',
  'the obsolete daily slot becomes terminal instead of running current data'
);
select is(
  (
    select state
    from public.source_gaps
    where contract_key = 'local_fwi'
      and data_through = '2099-08-30 06:00:00+00'
  ),
  'unrecoverable',
  'the missed current-only interval is recorded as unrecoverable'
);
select is(
  (
    select quality_checks ->> 'obsolete_slot'
    from public.source_runs
    where job_id = (
      select id
      from public.source_jobs
      where idempotency_key = 'pgtap:daily-backlog:2099-08-30 06:00:00+00'
    )
  ),
  'true',
  'superseding an unexpired daily slot uses the obsolete-slot audit path'
);
select is(
  (
    select job.gap_id
    from public.source_jobs as job
    where job.idempotency_key = 'pgtap:daily-backlog:2099-08-30 06:00:00+00'
  ),
  (
    select gap.id
    from public.source_gaps as gap
    where gap.contract_key = 'local_fwi'
      and gap.data_through = '2099-08-30 06:00:00+00'
  ),
  'the superseded job links to its unrecoverable gap'
);

update public.source_contracts
set dependency_keys = '{}'
where key = 'effis';
insert into public.source_jobs (
  contract_key,
  contract_version,
  trigger_kind,
  idempotency_key,
  scheduled_for,
  data_from,
  data_through,
  execution_target,
  state,
  enqueued_by,
  available_at,
  attempt_count,
  max_attempts,
  retry_base_seconds,
  retry_until,
  last_error_at,
  last_public_reason_code
)
select
  contract.key,
  contract.version,
  'scheduled',
  'pgtap:future-retry',
  '2099-09-01 06:00:00+00',
  '2099-08-31 06:00:00+00',
  '2099-09-01 06:00:00+00',
  'github',
  'retry_wait',
  array['database'],
  '2099-09-01 06:05:00+00',
  1,
  contract.max_attempts,
  contract.retry_base_seconds,
  '2099-09-01 10:00:00+00',
  '2099-09-01 06:00:30+00',
  'upstream_unreachable'
from public.source_contracts as contract
where contract.key = 'effis';

select is_empty(
  $$
    select * from public.claim_source_job(
      'pgtap-future-retry',
      'github',
      'effis',
      '2099-09-01 06:01:00+00'
    )
  $$,
  'a retry is not claimed before its availability time'
);
select ok(
  public.source_job_queue_has_pending(
    'github',
    'effis',
    '2099-09-01 06:01:00+00'
  ),
  'a future retry keeps the GitHub consumer polling'
);
select is_empty(
  $$
    select * from public.claim_source_job(
      'pgtap-expired-retry',
      'github',
      'effis',
      '2099-09-01 10:00:01+00'
    )
  $$,
  'a retry is never claimed after its usefulness window'
);
select is(
  (
    select state
    from public.source_jobs
    where idempotency_key = 'pgtap:future-retry'
  ),
  'failed',
  'an expired retry becomes terminal'
);
select is(
  (
    select quality_checks ->> 'usefulness_window_expired'
    from public.source_runs
    where job_id = (
      select id
      from public.source_jobs
      where idempotency_key = 'pgtap:future-retry'
    )
    order by attempt desc
    limit 1
  ),
  'true',
  'retry-window expiry leaves an explicit audited run'
);
select is(
  (
    select state
    from public.source_gaps
    where contract_key = 'effis'
      and data_through = '2099-09-01 06:00:00+00'
  ),
  'unrecoverable',
  'an expired current-only retry preserves an unrecoverable gap'
);
select isnt(
  public.source_job_queue_has_pending(
    'github',
    'effis',
    '2099-09-01 10:00:01+00'
  ),
  true,
  'a terminalized retry no longer keeps the consumer alive'
);

insert into public.source_jobs (
  contract_key,
  contract_version,
  trigger_kind,
  idempotency_key,
  scheduled_for,
  data_from,
  data_through,
  execution_target,
  state,
  enqueued_by,
  available_at,
  attempt_count,
  max_attempts,
  retry_base_seconds,
  retry_until,
  last_error_at,
  last_public_reason_code
)
select
  contract.key,
  contract.version,
  'manual',
  'pgtap:expired-fci-retention',
  '2099-01-01 00:10:00+00',
  '2099-01-01 00:00:00+00',
  '2099-01-01 00:10:00+00',
  'cloudflare',
  'retry_wait',
  array['manual'],
  '2099-01-01 00:20:00+00',
  1,
  contract.max_attempts,
  contract.retry_base_seconds,
  '2099-01-01 01:00:00+00',
  '2099-01-01 00:11:00+00',
  'upstream_unreachable'
from public.source_contracts as contract
where contract.key = 'fci';
select * from public.claim_source_job(
  'pgtap-expired-fci-retention',
  'cloudflare',
  'fci',
  '2099-05-01 00:00:00+00'
);
select is(
  (
    select state
    from public.source_gaps
    where contract_key = 'fci'
      and data_through = '2099-01-01 00:10:00+00'
  ),
  'unrecoverable',
  'an expired retry outside provider retention is not offered for replay'
);

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
select
  contract.key,
  contract.version,
  'manual',
  'pgtap:expired-batch:' || fixture.ordinal::text,
  fixture.scheduled_for,
  fixture.scheduled_for - interval '1 minute',
  fixture.scheduled_for,
  'github',
  array['manual'],
  fixture.scheduled_for,
  contract.max_attempts,
  contract.retry_base_seconds,
  '2100-01-02 00:00:00+00'
from public.source_contracts as contract
cross join lateral (
  select
    ordinal,
    '2100-01-01 00:00:00+00'::timestamptz
      + make_interval(mins => ordinal) as scheduled_for
  from generate_series(1, 30) as ordinal
) as fixture
where contract.key = 'effis';
select * from public.claim_source_job(
  'pgtap-expired-batch-1',
  'github',
  'effis',
  '2100-01-03 00:00:00+00'
);
select is(
  (
    select count(*)::integer
    from public.source_jobs
    where idempotency_key like 'pgtap:expired-batch:%'
      and state = 'failed'
  ),
  25,
  'one claim terminalizes at most one bounded maintenance batch'
);
select is(
  (
    select count(*)::integer
    from public.source_jobs
    where idempotency_key like 'pgtap:expired-batch:%'
      and state = 'queued'
  ),
  5,
  'overflow maintenance rows remain pending for the next claim'
);
select ok(
  public.source_job_queue_has_pending(
    'github',
    'effis',
    '2100-01-03 00:00:00+00'
  ),
  'bounded maintenance keeps the consumer polling until cleanup finishes'
);
select * from public.claim_source_job(
  'pgtap-expired-batch-2',
  'github',
  'effis',
  '2100-01-03 00:00:01+00'
);
select is(
  (
    select count(*)::integer
    from public.source_jobs
    where idempotency_key like 'pgtap:expired-batch:%'
      and state = 'queued'
  ),
  0,
  'the next claim finishes the remaining maintenance batch'
);
select isnt(
  public.source_job_queue_has_pending(
    'github',
    'effis',
    '2100-01-03 00:00:01+00'
  ),
  true,
  'the consumer sees drained only after bounded maintenance finishes'
);

insert into public.admin_units (
  id,
  level,
  code,
  name_ar,
  name_fr,
  name_en,
  lat,
  lon
)
values (
  '10000000-0000-4000-8000-000000000001',
  'commune',
  'REPLAY-TEST',
  'اختبار',
  'Test de rejeu',
  'Replay test',
  36.7,
  3.1
)
on conflict (code) do nothing;

insert into auth.users (id, email)
values (
  '10000000-0000-4000-8000-000000000002',
  'source-replay@example.test'
)
on conflict (id) do nothing;

insert into public.authority_warnings (
  id,
  source,
  received_via,
  body,
  severity,
  commune_codes
)
values (
  '10000000-0000-4000-8000-000000000003',
  'pgtap',
  'test',
  'Replay fixture',
  'Severe',
  array['REPLAY-TEST']
)
on conflict (id) do nothing;

create function pg_temp.write_replay_domain_fixture()
returns void
language plpgsql
as $$
declare
  _onm_id uuid := '10000000-0000-4000-8000-000000000004';
begin
  insert into public.detections (
    source,
    sensor,
    detected_at,
    lat,
    lon,
    confidence_raw,
    frp_mw,
    daynight,
    natural_key
  )
  values (
    'firms',
    'VIIRS_SNPP',
    '2026-08-31 19:55:00+00',
    36.7,
    3.1,
    0.9,
    12.5,
    'D',
    'replay-test:detection'
  )
  on conflict (natural_key) do nothing;

  insert into public.risk_forecasts (
    commune_id,
    forecast_date,
    horizon_days,
    source,
    fwi,
    danger_level
  )
  values (
    '10000000-0000-4000-8000-000000000001',
    '2026-08-31',
    0,
    'local_fwi',
    18.5,
    3
  )
  on conflict (commune_id, forecast_date, horizon_days, source) do update
  set
    fwi = excluded.fwi,
    danger_level = excluded.danger_level;

  insert into public.alerts (
    user_id,
    kind,
    severity,
    dedupe_key,
    title,
    body
  )
  values (
    '10000000-0000-4000-8000-000000000002',
    'fire',
    3,
    'replay-test:alert',
    'Replay fixture',
    'Replay fixture'
  )
  on conflict (user_id, dedupe_key) do nothing;

  insert into public.onm_vigilance (
    id,
    cap_id,
    title,
    event,
    severity,
    urgency,
    certainty,
    sent,
    area_desc
  )
  values (
    _onm_id,
    'replay-test:onm',
    'Replay fixture',
    'Fire',
    'Severe',
    'Immediate',
    'Observed',
    '2026-08-31 19:55:00+00',
    'Replay test'
  )
  on conflict (cap_id) do update
  set title = excluded.title;

  insert into public.broadcasts (
    kind,
    phase,
    onm_vigilance_id,
    severity,
    commune_codes
  )
  values (
    'onm',
    'initial',
    _onm_id,
    'Severe',
    array['REPLAY-TEST']
  )
  on conflict do nothing;

  insert into public.broadcasts (
    kind,
    phase,
    authority_warning_id,
    severity,
    commune_codes
  )
  values (
    'authority',
    'initial',
    '10000000-0000-4000-8000-000000000003',
    'Severe',
    array['REPLAY-TEST']
  )
  on conflict do nothing;
end;
$$;

select pg_temp.write_replay_domain_fixture();
select pg_temp.write_replay_domain_fixture();

select is(
  (
    select count(*)::integer
    from public.detections
    where natural_key = 'replay-test:detection'
  ),
  1,
  'running the same interval twice keeps one detection'
);
select is(
  (
    select count(*)::integer
    from public.risk_forecasts
    where commune_id = '10000000-0000-4000-8000-000000000001'
      and forecast_date = '2026-08-31'
      and horizon_days = 0
      and source = 'local_fwi'
  ),
  1,
  'running the same interval twice keeps one risk row'
);
select is(
  (
    select count(*)::integer
    from public.alerts
    where user_id = '10000000-0000-4000-8000-000000000002'
      and dedupe_key = 'replay-test:alert'
  ),
  1,
  'running the same interval twice keeps one alert decision'
);
select is(
  (
    select count(*)::integer
    from public.onm_vigilance
    where cap_id = 'replay-test:onm'
  ),
  1,
  'running the same interval twice keeps one ONM warning'
);
select is(
  (
    select count(*)::integer
    from public.broadcasts
    where kind = 'onm'
      and onm_vigilance_id = '10000000-0000-4000-8000-000000000004'
  ),
  1,
  'running the same interval twice keeps one ONM broadcast'
);
select is(
  (
    select count(*)::integer
    from public.broadcasts
    where kind = 'authority'
      and authority_warning_id = '10000000-0000-4000-8000-000000000003'
  ),
  1,
  'running the same interval twice keeps one authority broadcast'
);

select * from finish();

rollback;
