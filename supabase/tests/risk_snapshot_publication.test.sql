begin;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'risk_publications', 'immutable publication metadata exists');
select has_table('public', 'risk_publication_checkpoint', 'authoritative publication pointer exists');
select has_table('public', 'risk_forecast_snapshot_runs', 'snapshot lifecycle registry exists');
select has_function('public', 'current_risk_forecasts', array[]::text[], 'clients have a curated current publication RPC');
select has_column('public', 'risk_forecasts', 'snapshot_id', 'live rows identify their generation');
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.risk_forecasts'::regclass
      and conname = 'risk_forecasts_snapshot_id_fkey'
      and contype = 'f'
  ),
  'live generation identity is enforced'
);
select has_index('public', 'risk_forecasts', 'risk_forecasts_snapshot_horizon_date_commune_idx', 'generation reads are indexed');
select has_index('public', 'risk_forecasts', 'risk_forecasts_snapshot_identity_idx', 'each generation has independent row identity');
select ok(
  not exists (
    select 1 from pg_constraint
    where conrelid = 'public.risk_forecasts'::regclass
      and conname = 'risk_forecasts_commune_id_forecast_date_horizon_days_source_key'
  ),
  'legacy cross-generation uniqueness no longer permits overwrite promotion'
);
select has_index('public', 'risk_forecast_snapshot_runs', 'risk_forecast_snapshot_runs_stale_active_idx', 'stale active runs have an age index');
select ok(
  coalesce((select relrowsecurity from pg_class where oid = 'public.risk_publications'::regclass), false)
  and coalesce((select relrowsecurity from pg_class where oid = 'public.risk_publication_checkpoint'::regclass), false)
  and coalesce((select relrowsecurity from pg_class where oid = 'public.risk_forecast_snapshot_runs'::regclass), false),
  'publication control tables enforce RLS'
);
select ok(
  not has_table_privilege('anon', 'public.risk_publications', 'select')
  and not has_table_privilege('authenticated', 'public.risk_publications', 'select')
  and not has_table_privilege('anon', 'public.risk_forecast_snapshot_runs', 'select')
  and not has_table_privilege('authenticated', 'public.risk_forecast_snapshot_runs', 'select'),
  'metadata and active runs are service-private'
);
select ok(
  has_table_privilege('anon', 'public.risk_publication_checkpoint', 'select')
  and has_table_privilege('authenticated', 'public.risk_publication_checkpoint', 'select')
  and not has_table_privilege('anon', 'public.risk_publication_checkpoint', 'insert')
  and not has_table_privilege('authenticated', 'public.risk_publication_checkpoint', 'update'),
  'clients can read but cannot move the pointer'
);
select ok(
  not has_table_privilege('anon', 'public.risk_forecasts', 'select')
  and not has_table_privilege('authenticated', 'public.risk_forecasts', 'select')
  and has_table_privilege('service_role', 'public.risk_forecasts', 'select'),
  'base forecast rows are service-only'
);
select ok(
  has_function_privilege('anon', 'public.current_risk_forecasts()', 'execute')
  and has_function_privilege('authenticated', 'public.current_risk_forecasts()', 'execute')
  and has_function_privilege('service_role', 'public.current_risk_forecasts()', 'execute'),
  'all readers can reach the curated current surface'
);
select has_function('public', 'begin_risk_forecast_snapshot', array['uuid', 'date', 'timestamp with time zone', 'timestamp with time zone'], 'generation start is atomic');
select has_function('public', 'publish_risk_forecast_snapshot', array['uuid', 'date', 'timestamp with time zone'], 'promotion receives captured identity');
select has_function('public', 'stage_risk_forecast_batch', array['uuid', 'jsonb'], 'staging and heartbeat share one lifecycle RPC');
select has_function('public', 'discard_risk_forecast_snapshot', array['uuid', 'date', 'timestamp with time zone'], 'discard is an atomic lifecycle transition');
select ok(
  has_function_privilege('service_role', 'public.begin_risk_forecast_snapshot(uuid,date,timestamp with time zone,timestamp with time zone)', 'execute')
  and not has_function_privilege('anon', 'public.begin_risk_forecast_snapshot(uuid,date,timestamp with time zone,timestamp with time zone)', 'execute')
  and has_function_privilege('service_role', 'public.publish_risk_forecast_snapshot(uuid,date,timestamp with time zone)', 'execute')
  and not has_function_privilege('authenticated', 'public.publish_risk_forecast_snapshot(uuid,date,timestamp with time zone)', 'execute')
  and has_function_privilege('service_role', 'public.stage_risk_forecast_batch(uuid,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.stage_risk_forecast_batch(uuid,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.discard_risk_forecast_snapshot(uuid,date,timestamp with time zone)', 'execute')
  and not has_function_privilege('anon', 'public.discard_risk_forecast_snapshot(uuid,date,timestamp with time zone)', 'execute'),
  'publication lifecycle RPCs are service-only'
);
select ok(
  (
    select bool_and(prosecdef and proconfig = array['search_path=""'])
    from pg_proc
    where oid in (
      'public.begin_risk_forecast_snapshot(uuid,date,timestamptz,timestamptz)'::regprocedure,
      'public.publish_risk_forecast_snapshot(uuid,date,timestamptz)'::regprocedure,
      'public.stage_risk_forecast_batch(uuid,jsonb)'::regprocedure,
      'public.discard_risk_forecast_snapshot(uuid,date,timestamptz)'::regprocedure
    )
  ),
  'lifecycle definer RPCs use an empty search path'
);
select ok(
  not has_table_privilege('service_role', 'public.risk_forecasts', 'insert')
  and not has_table_privilege('service_role', 'public.risk_forecasts', 'update')
  and not has_table_privilege('service_role', 'public.risk_forecasts', 'delete')
  and not has_table_privilege('service_role', 'public.risk_forecast_staging', 'insert')
  and not has_table_privilege('service_role', 'public.risk_forecast_staging', 'update')
  and not has_table_privilege('service_role', 'public.risk_forecast_staging', 'delete')
  and not has_table_privilege('service_role', 'public.risk_forecast_snapshot_runs', 'insert')
  and not has_table_privilege('service_role', 'public.risk_forecast_snapshot_runs', 'update')
  and not has_table_privilege('service_role', 'public.risk_forecast_snapshot_runs', 'delete'),
  'service publication can mutate lifecycle tables only through RPCs'
);

insert into public.risk_forecast_snapshot_runs(snapshot_id, base_date, scheduled_for, status, heartbeat_at)
values ('f0220000-0000-4000-8000-000000000090', date '2098-12-01', '2098-12-01Z', 'active', now() - interval '2 days');
insert into public.risk_forecast_snapshot_runs(snapshot_id, base_date, scheduled_for, status, heartbeat_at)
values ('f0220000-0000-4000-8000-000000000091', date '2098-12-02', '2098-12-02Z', 'discarded', now());
insert into public.risk_forecast_staging(snapshot_id, commune_id, forecast_date, horizon_days, fwi, danger_level)
select 'f0220000-0000-4000-8000-000000000090', id, date '2098-12-01', 0, 1, 1
from public.admin_units where level = 'commune' limit 1;
insert into public.risk_forecast_staging(snapshot_id, commune_id, forecast_date, horizon_days, fwi, danger_level)
select 'f0220000-0000-4000-8000-000000000091', id, date '2098-12-02', 0, 1, 1
from public.admin_units where level = 'commune' limit 1;
insert into public.risk_forecast_staging(snapshot_id, commune_id, forecast_date, horizon_days, fwi, danger_level)
select 'f0220000-0000-4000-8000-000000000092', id, date '2098-12-03', 0, 1, 1
from public.admin_units where level = 'commune' limit 1;
select is(public.begin_risk_forecast_snapshot('f0220000-0000-4000-8000-000000000001', '2099-01-01', '2099-01-01Z', now() - interval '6 hours'), 1, 'start reclaims one crashed run');
select results_eq(
  $$select status, (select count(*)::integer from public.risk_forecast_staging where snapshot_id = r.snapshot_id)
    from public.risk_forecast_snapshot_runs r where snapshot_id = 'f0220000-0000-4000-8000-000000000090'$$,
  $$values ('discarded'::text, 0)$$,
  'crash remnants are discarded while the new run stays active'
);
select is(
  (select count(*)::integer from public.risk_forecast_staging where snapshot_id = 'f0220000-0000-4000-8000-000000000091'),
  0,
  'begin permanently purges staging owned by every non-active run'
);
select is(
  (select count(*)::integer from public.risk_forecast_staging where snapshot_id = 'f0220000-0000-4000-8000-000000000092'),
  0,
  'begin permanently purges orphan staging without a run record'
);
set local role service_role;
select throws_ok(
  $$select public.stage_risk_forecast_batch(
    'f0220000-0000-4000-8000-000000000090',
    jsonb_build_array(jsonb_build_object(
      'commune_id', (select id from public.admin_units where level = 'commune' limit 1),
      'forecast_date', '2098-12-01', 'horizon_days', 0, 'fwi', 9,
      'danger_level', 1, 'fuel_limited', false, 'components', '{}'::jsonb
    ))
  )$$,
  '22023', 'risk_snapshot_not_active',
  'a reclaimed worker cannot stage or heartbeat again'
);
reset role;

set local role service_role;
select is(
  public.stage_risk_forecast_batch(
    'f0220000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'commune_id', (select id from public.admin_units where level = 'commune' limit 1),
      'forecast_date', '2099-01-01', 'horizon_days', 0, 'fwi', 10,
      'danger_level', 1, 'fuel_limited', false, 'components', '{}'::jsonb
    ))
  ),
  1,
  'active staging succeeds through the lifecycle RPC'
);
reset role;
select ok(
  (select heartbeat_at >= created_at from public.risk_forecast_snapshot_runs
   where snapshot_id = 'f0220000-0000-4000-8000-000000000001')
  and exists (
    select 1 from public.risk_forecast_staging
    where snapshot_id = 'f0220000-0000-4000-8000-000000000001'
  ),
  'staging and active-run heartbeat commit together'
);
delete from public.risk_forecast_staging
where snapshot_id = 'f0220000-0000-4000-8000-000000000001';

insert into public.risk_forecast_staging(snapshot_id, commune_id, forecast_date, horizon_days, fwi, danger_level)
select 'f0220000-0000-4000-8000-000000000001', u.id, date '2099-01-01' + h, h, 10, 1
from public.admin_units u cross join generate_series(0,5) h where u.level = 'commune';
select is(public.publish_risk_forecast_snapshot('f0220000-0000-4000-8000-000000000001', '2099-01-01', '2099-01-01Z')->>'status', 'promoted', 'complete generation promotes');
select results_eq(
  $$select snapshot_id, base_date from public.risk_publication_checkpoint where key = 'local_fwi'$$,
  $$values ('f0220000-0000-4000-8000-000000000001'::uuid, date '2099-01-01')$$,
  'promotion atomically advances the exact pointer'
);
select results_eq(
  $$select count(*)::bigint from public.risk_forecasts where snapshot_id = 'f0220000-0000-4000-8000-000000000001'$$,
  $$select count(*) * 6 from public.admin_units where level = 'commune'$$,
  'all live rows carry the promoted identity'
);
select results_eq(
  $$select last_scheduled_for, data_through, published_at, coverage_status, records_accepted, records_expected
    from public.source_checkpoints where contract_key = 'local_fwi'$$,
  $$select
      checkpoint.scheduled_for,
      checkpoint.base_date::timestamptz,
      checkpoint.published_at,
      'complete'::text,
      publication.row_count,
      publication.row_count
    from public.risk_publication_checkpoint checkpoint
    join public.risk_publications publication using (snapshot_id)
    where checkpoint.key = 'local_fwi'$$,
  'promotion atomically publishes the public source checkpoint before run reporting'
);

set local role anon;
select throws_ok(
  $$select id from public.risk_forecasts limit 1$$,
  '42501', 'permission denied for table risk_forecasts',
  'anonymous clients cannot query legacy, partial, or historical base rows'
);
select results_eq(
  $$select count(*)::bigint from public.current_risk_forecasts()$$,
  $$select count(*) * 6 from public.admin_units where level = 'commune'$$,
  'anonymous clients can read exactly the current complete generation'
);
reset role;

set local role authenticated;
select throws_ok(
  $$select id from public.risk_forecasts limit 1$$,
  '42501', 'permission denied for table risk_forecasts',
  'authenticated clients cannot query legacy, partial, or historical base rows'
);
select results_eq(
  $$select count(*)::bigint from public.current_risk_forecasts()$$,
  $$select count(*) * 6 from public.admin_units where level = 'commune'$$,
  'authenticated clients can read exactly the current complete generation'
);
reset role;

set local role service_role;
select results_eq(
  $$select count(*)::bigint from public.risk_forecasts
    where snapshot_id = 'f0220000-0000-4000-8000-000000000001'$$,
  $$select count(*) * 6 from public.admin_units where level = 'commune'$$,
  'the ingest service retains direct base-table access'
);
select throws_ok(
  $$insert into public.risk_forecasts (
      commune_id, forecast_date, horizon_days, source, fwi, danger_level, snapshot_id
    ) select commune_id, forecast_date, horizon_days, source, fwi, danger_level, snapshot_id
      from public.risk_forecasts limit 1$$,
  '42501', null, 'service cannot insert around the publication RPC'
);
select throws_ok(
  $$update public.risk_forecasts set fwi = fwi where snapshot_id is not null$$,
  '42501', null, 'service cannot update a published generation'
);
select throws_ok(
  $$delete from public.risk_forecasts where snapshot_id is not null$$,
  '42501', null, 'service cannot delete a published generation'
);
reset role;

select is(public.begin_risk_forecast_snapshot('f0220000-0000-4000-8000-000000000002', '2099-01-01', '2099-01-01 01:00Z', now() - interval '6 hours'), 0, 'same-base rerun starts');
insert into public.risk_forecast_staging(snapshot_id, commune_id, forecast_date, horizon_days, fwi, danger_level)
select 'f0220000-0000-4000-8000-000000000002', u.id, date '2099-01-01' + h, h, 99, 5
from (select id from public.admin_units where level = 'commune' limit 10) u cross join generate_series(0,5) h;
select results_eq(
  $$select distinct snapshot_id from public.risk_forecasts where source = 'local_fwi' and forecast_date between '2099-01-01' and '2099-01-06'$$,
  $$values ('f0220000-0000-4000-8000-000000000001'::uuid)$$,
  'readers see only the old snapshot between rerun batches'
);
select throws_ok(
  $$select public.publish_risk_forecast_snapshot('f0220000-0000-4000-8000-000000000002', '2099-01-01', '2099-01-01 01:00Z')$$,
  'P0001', 'incomplete_risk_snapshot', 'partial rerun cannot publish'
);
select results_eq(
  $$select snapshot_id from public.risk_publication_checkpoint where key = 'local_fwi'$$,
  $$values ('f0220000-0000-4000-8000-000000000001'::uuid)$$,
  'failed promotion leaves the last complete pointer intact'
);

insert into public.risk_forecast_staging(snapshot_id, commune_id, forecast_date, horizon_days, fwi, danger_level)
select 'f0220000-0000-4000-8000-000000000002', u.id, date '2099-01-01' + h, h, 99, 5
from public.admin_units u cross join generate_series(0,5) h where u.level = 'commune'
on conflict (snapshot_id, commune_id, forecast_date, horizon_days)
do update set fwi = excluded.fwi, danger_level = excluded.danger_level;
select is(
  public.publish_risk_forecast_snapshot(
    'f0220000-0000-4000-8000-000000000002', '2099-01-01', '2099-01-01 01:00Z'
  )->>'status',
  'promoted',
  'a complete same-base rerun publishes as a distinct generation'
);
select results_eq(
  $$select snapshot_id, count(*)::bigint from public.risk_forecasts
    where snapshot_id in (
      'f0220000-0000-4000-8000-000000000001',
      'f0220000-0000-4000-8000-000000000002'
    ) group by snapshot_id order by snapshot_id$$,
  $$select snapshot_id, expected.communes * 6
    from (values
      ('f0220000-0000-4000-8000-000000000001'::uuid),
      ('f0220000-0000-4000-8000-000000000002'::uuid)
    ) snapshots(snapshot_id)
    cross join lateral (
      select count(*) as communes from public.admin_units where level = 'commune'
    ) expected
    order by snapshot_id$$,
  'same-base publication retains both complete generations'
);
select is(
  (select count(*)::integer from public.risk_forecasts
   where snapshot_id = 'f0220000-0000-4000-8000-000000000001' and fwi = 10),
  (select count(*)::integer * 6 from public.admin_units where level = 'commune'),
  'publishing a rerun does not mutate prior values'
);
select results_eq(
  $$select distinct snapshot_id from public.current_risk_forecasts()$$,
  $$values ('f0220000-0000-4000-8000-000000000002'::uuid)$$,
  'the curated surface hides the prior complete generation after pointer advance'
);
select throws_ok(
  $$update public.risk_forecasts set fwi = 77
    where snapshot_id = 'f0220000-0000-4000-8000-000000000001'$$,
  '55000', 'published_risk_forecast_is_immutable',
  'published generation rows cannot be updated'
);
select throws_ok(
  $$delete from public.risk_forecasts
    where snapshot_id = 'f0220000-0000-4000-8000-000000000001'$$,
  '55000', 'published_risk_forecast_is_immutable',
  'published generation rows cannot be deleted or left dangling'
);

insert into public.risk_forecasts (commune_id, forecast_date, horizon_days, source, fwi, danger_level)
select id, '2099-03-01', 0, 'local_fwi', 5, 1 from public.admin_units where level = 'commune' limit 1;
update public.risk_forecasts set fwi = 9
where snapshot_id is null and forecast_date = '2099-03-01' and source = 'local_fwi';
select is(
  (select fwi from public.risk_forecasts
   where snapshot_id is null and forecast_date = '2099-03-01' and source = 'local_fwi'),
  9::double precision,
  'legacy rows without a generation remain updatable, and the update actually lands'
);
delete from public.risk_forecasts
where snapshot_id is null and forecast_date = '2099-03-01' and source = 'local_fwi';
select is(
  (select count(*)::integer from public.risk_forecasts
   where snapshot_id is null and forecast_date = '2099-03-01' and source = 'local_fwi'),
  0,
  'legacy rows without a generation remain deletable'
);

select is(public.begin_risk_forecast_snapshot('f0220000-0000-4000-8000-000000000003', '2099-01-02', '2099-01-02Z', now() - interval '6 hours'), 0, 'newer run starts');
insert into public.risk_forecast_staging(snapshot_id, commune_id, forecast_date, horizon_days, fwi, danger_level)
select 'f0220000-0000-4000-8000-000000000003', u.id, date '2099-01-02' + h, h, 30, 3
from public.admin_units u cross join generate_series(0,5) h where u.level = 'commune';
select is(public.publish_risk_forecast_snapshot('f0220000-0000-4000-8000-000000000003', '2099-01-02', '2099-01-02Z')->>'status', 'promoted', 'newer generation publishes');
select is(public.begin_risk_forecast_snapshot('f0220000-0000-4000-8000-000000000004', '2099-01-01', '2099-01-01 12:00Z', now() - interval '6 hours'), 0, 'older overlapping run may finish late');
insert into public.risk_forecast_staging(snapshot_id, commune_id, forecast_date, horizon_days, fwi, danger_level)
select 'f0220000-0000-4000-8000-000000000004', u.id, date '2099-01-01' + h, h, 40, 4
from public.admin_units u cross join generate_series(0,5) h where u.level = 'commune';
select is(public.publish_risk_forecast_snapshot('f0220000-0000-4000-8000-000000000004', '2099-01-01', '2099-01-01 12:00Z')->>'status', 'superseded', 'late stale completion cannot replace newer');
select results_eq(
  $$select snapshot_id, scheduled_for from public.risk_publication_checkpoint where key = 'local_fwi'$$,
  $$values ('f0220000-0000-4000-8000-000000000003'::uuid, timestamptz '2099-01-02Z')$$,
  'pointer advancement is monotonic'
);
select results_eq(
  $$select checkpoint.snapshot_id, checkpoint.scheduled_for, source.data_through,
      source.published_at, source.coverage_status
    from public.risk_publication_checkpoint checkpoint
    join public.source_checkpoints source on source.contract_key = checkpoint.key
    where checkpoint.key = 'local_fwi'$$,
  $$select checkpoint.snapshot_id, checkpoint.scheduled_for,
      checkpoint.base_date::timestamptz, checkpoint.published_at, 'complete'::text
    from public.risk_publication_checkpoint checkpoint where checkpoint.key = 'local_fwi'$$,
  'risk and public source checkpoints advance together to the newer publication'
);
select lives_ok(
  $$select public.record_source_run(
    _contract_key => 'local_fwi',
    _trigger_kind => 'scheduled',
    _idempotency_key => 'f022-late-partial',
    _scheduled_for => timestamptz '2099-01-01 12:00Z',
    _started_at => timestamptz '2099-01-01 12:00Z',
    _finished_at => timestamptz '2099-01-01 12:10Z',
    _outcome => 'partial',
    _upstream_published_at => null,
    _data_from => null,
    _data_through => null,
    _validated_at => null,
    _published_at => null,
    _records_seen => 10,
    _records_inserted => 0,
    _records_updated => 0,
    _records_rejected => 0,
    _records_expected => (
      select count(*)::integer * 6 from public.admin_units where level = 'commune'
    ),
    _coverage_status => 'partial',
    _quality_checks => '{}'::jsonb,
    _public_reason_code => 'coverage_partial',
    _private_diagnostic => 'late partial attempt'
  )$$,
  'late source-run reporting is accepted without regressing publication state'
);
select results_eq(
  $$select last_scheduled_for, data_through, published_at, coverage_status
    from public.source_checkpoints where contract_key = 'local_fwi'$$,
  $$select scheduled_for, base_date::timestamptz, published_at, 'complete'::text
    from public.risk_publication_checkpoint where key = 'local_fwi'$$,
  'late older reporting cannot detach the public source checkpoint'
);
select is(public.publish_risk_forecast_snapshot('f0220000-0000-4000-8000-000000000003', '2099-01-02', '2099-01-02Z')->>'status', 'promoted', 'winning promotion replay is idempotent');
select is(
  public.discard_risk_forecast_snapshot(
    'f0220000-0000-4000-8000-000000000003', '2099-01-02', '2099-01-02Z'
  ),
  false,
  'ambiguous cleanup cannot demote a committed publication'
);
select results_eq(
  $$select status, exists (
      select 1 from public.risk_publications publication
      where publication.snapshot_id = run.snapshot_id
    )
    from public.risk_forecast_snapshot_runs run
    where snapshot_id = 'f0220000-0000-4000-8000-000000000003'$$,
  $$values ('promoted'::text, true)$$,
  'committed promotion remains promoted after ambiguous discard'
);
select lives_ok(
  $$select public.record_source_run(
    _contract_key => 'local_fwi',
    _trigger_kind => 'scheduled',
    _idempotency_key => 'f022-equal-schedule-response-loss',
    _scheduled_for => timestamptz '2099-01-02Z',
    _started_at => timestamptz '2099-01-02Z',
    _finished_at => timestamptz '2099-01-02 00:10Z',
    _outcome => 'partial',
    _upstream_published_at => null,
    _data_from => null,
    _data_through => null,
    _validated_at => null,
    _published_at => null,
    _records_seen => 0,
    _records_inserted => 0,
    _records_updated => 0,
    _records_rejected => 0,
    _records_expected => 9216,
    _coverage_status => 'partial',
    _quality_checks => '{}'::jsonb,
    _public_reason_code => 'coverage_partial',
    _private_diagnostic => 'promotion response lost'
  )$$,
  'equal-schedule response loss can still be recorded'
);
select results_eq(
  $$select source.last_scheduled_for, source.last_success_at,
      source.data_through, source.published_at, source.coverage_status,
      source.consecutive_failures, source.last_public_reason_code
    from public.source_checkpoints source where contract_key = 'local_fwi'$$,
  $$select checkpoint.scheduled_for, checkpoint.published_at,
      checkpoint.base_date::timestamptz, checkpoint.published_at,
      'complete'::text, 0, null::text
    from public.risk_publication_checkpoint checkpoint where key = 'local_fwi'$$,
  'equal-schedule partial reporting cannot demote a committed publication'
);

create temporary table qa_current_risk_digest as
select md5(string_agg(row_to_json(current_row)::text, ',' order by current_row.id)) as digest
from public.current_risk_forecasts() current_row;
select count(*) from public.current_risk_forecasts();
select results_eq(
  $$select md5(string_agg(row_to_json(current_row)::text, ',' order by current_row.id))
    from public.current_risk_forecasts() current_row$$,
  $$select digest from qa_current_risk_digest$$,
  'the public read RPC never mutates its pinned generation'
);

select * from finish();
rollback;
