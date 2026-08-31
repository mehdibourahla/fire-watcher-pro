begin;

create extension if not exists dblink with schema extensions;

set local search_path = public, extensions;

select plan(10);

select extensions.dblink_connect(
  'claim_a',
  format(
    'host=supabase_db_kuukthyenirwgdfkltlm port=%s dbname=%I user=postgres password=postgres',
    current_setting('port'),
    current_database()
  )
);
select extensions.dblink_connect(
  'claim_b',
  format(
    'host=supabase_db_kuukthyenirwgdfkltlm port=%s dbname=%I user=postgres password=postgres',
    current_setting('port'),
    current_database()
  )
);

select extensions.dblink_exec(
  'claim_a',
  $setup$
    create temporary table checkpoint_backup
    on commit preserve rows
    as
    select *
    from public.source_checkpoints
    where contract_key = 'firms';

    delete from public.source_job_leases
    where job_id in (
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002'
    );
    delete from public.source_jobs
    where id in (
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002'
    );
    insert into public.source_jobs (
      id,
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
      fixture.id,
      contract.key,
      contract.version,
      'manual',
      fixture.idempotency_key,
      fixture.scheduled_for,
      fixture.scheduled_for - interval '10 minutes',
      fixture.scheduled_for,
      'cloudflare',
      array['manual'],
      fixture.scheduled_for,
      contract.max_attempts,
      contract.retry_base_seconds,
      fixture.scheduled_for + interval '1 day'
    from (
      values
        (
          '20000000-0000-4000-8000-000000000001'::uuid,
          'firms'::text,
          'concurrency:firms:1'::text,
          '2000-01-01 00:00:00+00'::timestamptz
        ),
        (
          '20000000-0000-4000-8000-000000000002'::uuid,
          'firms'::text,
          'concurrency:firms:2'::text,
          '2000-01-01 00:01:00+00'::timestamptz
        )
    ) as fixture(id, contract_key, idempotency_key, scheduled_for)
    join public.source_contracts as contract
      on contract.key = fixture.contract_key;
  $setup$
);

select extensions.dblink_exec('claim_a', 'begin');
select extensions.dblink_exec(
  'claim_a',
  $lease$
    update public.source_jobs
    set
      state = 'running',
      attempt_count = 1,
      started_at = '2000-01-01 00:03:00+00',
      updated_at = '2000-01-01 00:03:00+00'
    where id = '20000000-0000-4000-8000-000000000001';
    insert into public.source_job_leases (
      contract_key,
      job_id,
      worker_id,
      attempt,
      leased_at,
      lease_expires_at
    )
    values (
      'firms',
      '20000000-0000-4000-8000-000000000001',
      'two-session-a',
      1,
      '2000-01-01 00:03:00+00',
      '2000-01-01 00:05:00+00'
    );
  $lease$
);

select extensions.dblink_send_query(
  'claim_b',
  $query$
    select contract_key
    from public.claim_source_job(
      'two-session-b',
      'cloudflare',
      'firms',
      '2000-01-01 00:03:00+00'
    )
  $query$
);
select pg_sleep(0.2);
select extensions.dblink_exec('claim_a', 'commit');
create temporary table claim_b_result as
select *
from extensions.dblink_get_result('claim_b') as result(contract_key text);
select *
from extensions.dblink_get_result('claim_b') as result(contract_key text);

select is(
  (
    select state
    from public.source_jobs
    where id = '20000000-0000-4000-8000-000000000001'
  ),
  'running',
  'the first session retains the FIRMS lease while another claim starts'
);
select is(
  (select count(*)::integer from claim_b_result),
  0,
  'a concurrent same-contract lease collision returns unclaimed without error'
);
select is(
  (
    select count(*)::integer
    from public.source_job_leases
    where job_id in (
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002'
    )
  ),
  1,
  'concurrent claims retain exactly one lease for the contract'
);

select ok(
  position(
    'from public.source_job_leases' in pg_get_functiondef(
      'public.complete_source_job(uuid,text,integer,timestamp with time zone,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,integer,integer,integer,integer,integer,text,jsonb,text,text,boolean)'::regprocedure
    )
  ) < position(
    'from public.source_jobs' in pg_get_functiondef(
      'public.complete_source_job(uuid,text,integer,timestamp with time zone,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,integer,integer,integer,integer,integer,text,jsonb,text,text,boolean)'::regprocedure
    )
  ),
  'normal completion locks the lease before the job'
);
select ok(
  pg_get_functiondef(
    'private.requeue_expired_source_jobs(timestamp with time zone)'::regprocedure
  ) not like '%for update%',
  'expiry recovery delegates locking to the shared completion path'
);

select extensions.dblink_exec(
  'claim_a',
  $setup$
    delete from public.source_job_leases
    where job_id in (
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002'
    );
    delete from public.source_jobs
    where id in (
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002'
    );
    insert into public.source_jobs (
      id,
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
      started_at,
      updated_at
    )
    select
      '20000000-0000-4000-8000-000000000010',
      contract.key,
      contract.version,
      'manual',
      'concurrency:late-completion',
      '2001-01-01 01:00:00+00',
      '2001-01-01 00:50:00+00',
      '2001-01-01 01:00:00+00',
      'cloudflare',
      'running',
      array['manual'],
      '2001-01-01 01:00:00+00',
      1,
      contract.max_attempts,
      contract.retry_base_seconds,
      '2001-01-01 02:00:00+00',
      '2001-01-01 01:00:01+00',
      '2001-01-01 01:00:01+00'
    from public.source_contracts as contract
    where contract.key = 'firms';
    insert into public.source_job_leases (
      contract_key,
      job_id,
      worker_id,
      attempt,
      leased_at,
      lease_expires_at
    )
    values (
      'firms',
      '20000000-0000-4000-8000-000000000010',
      'late-worker',
      1,
      '2001-01-01 01:00:01+00',
      '2001-01-01 01:00:30+00'
    );
  $setup$
);

select extensions.dblink_exec('claim_a', 'begin');
select extensions.dblink_exec(
  'claim_a',
  $lock$
    do $body$
    begin
      perform 1
      from public.source_job_leases
      where job_id = '20000000-0000-4000-8000-000000000010'
      for update;
    end
    $body$;
  $lock$
);
select extensions.dblink_send_query(
  'claim_b',
  $query$
    select private.requeue_expired_source_jobs(
      '2001-01-01 01:00:31+00'
    ) as recovered
  $query$
);
select pg_sleep(0.2);
select extensions.dblink_send_query(
  'claim_a',
  $query$
    select (public.complete_source_job(
      _job_id => '20000000-0000-4000-8000-000000000010',
      _worker_id => 'late-worker',
      _attempt => 1,
      _finished_at => '2001-01-01 01:00:31+00',
      _outcome => 'succeeded',
      _upstream_published_at => '2001-01-01 01:00:00+00',
      _data_from => '2001-01-01 00:50:00+00',
      _data_through => '2001-01-01 01:00:00+00',
      _validated_at => '2001-01-01 01:00:31+00',
      _published_at => '2001-01-01 01:00:31+00',
      _records_seen => 1,
      _records_inserted => 1,
      _records_updated => 0,
      _records_rejected => 0,
      _records_expected => 1,
      _coverage_status => 'complete',
      _quality_checks => '{}'::jsonb,
      _public_reason_code => null,
      _private_diagnostic => null,
      _retryable => false
    )).state
  $query$
);
create temporary table late_completion_result as
select *
from extensions.dblink_get_result('claim_a') as result(state text);
select *
from extensions.dblink_get_result('claim_a') as result(state text);
select extensions.dblink_exec('claim_a', 'commit');
create temporary table expiry_recovery_result as
select *
from extensions.dblink_get_result('claim_b') as result(recovered integer);
select *
from extensions.dblink_get_result('claim_b') as result(recovered integer);

select is(
  (select state from late_completion_result),
  'succeeded',
  'a late normal completion can win the expiry race'
);
select is(
  (select recovered from expiry_recovery_result),
  0,
  'the concurrent recovery observes the released lease without deadlocking'
);
select is(
  (
    select state
    from public.source_jobs
    where id = '20000000-0000-4000-8000-000000000010'
  ),
  'succeeded',
  'the expiry race leaves one terminal job state'
);
select is(
  (
    select count(*)::integer
    from public.source_runs
    where job_id = '20000000-0000-4000-8000-000000000010'
  ),
  1,
  'the expiry race records exactly one attempt'
);
select is(
  (
    select count(*)::integer
    from public.source_job_leases
    where job_id = '20000000-0000-4000-8000-000000000010'
  ),
  0,
  'the expiry race releases the lease exactly once'
);

select extensions.dblink_exec(
  'claim_a',
  $cleanup$
    delete from public.source_runs
    where job_id = '20000000-0000-4000-8000-000000000010';
    delete from public.source_job_leases
    where job_id in (
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000010'
    );
    delete from public.source_jobs
    where id in (
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000010'
    );
    delete from public.source_checkpoints
    where contract_key = 'firms';
    insert into public.source_checkpoints
    select * from checkpoint_backup;
  $cleanup$
);

select extensions.dblink_disconnect('claim_a');
select extensions.dblink_disconnect('claim_b');

select * from finish();

rollback;
