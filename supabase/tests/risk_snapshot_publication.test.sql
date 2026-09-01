begin;
set local search_path = public, extensions;
select plan(28);

select has_table('public', 'risk_publications', 'immutable publication metadata exists');
select has_table('public', 'risk_publication_checkpoint', 'authoritative publication pointer exists');
select has_table('public', 'risk_forecast_snapshot_runs', 'snapshot lifecycle registry exists');
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
select has_function('public', 'begin_risk_forecast_snapshot', array['uuid', 'date', 'timestamp with time zone', 'timestamp with time zone'], 'generation start is atomic');
select has_function('public', 'publish_risk_forecast_snapshot', array['uuid', 'date', 'timestamp with time zone'], 'promotion receives captured identity');
select ok(
  has_function_privilege('service_role', 'public.begin_risk_forecast_snapshot(uuid,date,timestamp with time zone,timestamp with time zone)', 'execute')
  and not has_function_privilege('anon', 'public.begin_risk_forecast_snapshot(uuid,date,timestamp with time zone,timestamp with time zone)', 'execute')
  and has_function_privilege('service_role', 'public.publish_risk_forecast_snapshot(uuid,date,timestamp with time zone)', 'execute')
  and not has_function_privilege('authenticated', 'public.publish_risk_forecast_snapshot(uuid,date,timestamp with time zone)', 'execute'),
  'publication lifecycle RPCs are service-only'
);

insert into public.risk_forecast_snapshot_runs(snapshot_id, base_date, scheduled_for, status, heartbeat_at)
values ('f0220000-0000-4000-8000-000000000090', date '2098-12-01', '2098-12-01Z', 'active', now() - interval '2 days');
insert into public.risk_forecast_staging(snapshot_id, commune_id, forecast_date, horizon_days, fwi, danger_level)
select 'f0220000-0000-4000-8000-000000000090', id, date '2098-12-01', 0, 1, 1
from public.admin_units where level = 'commune' limit 1;
select is(public.begin_risk_forecast_snapshot('f0220000-0000-4000-8000-000000000001', '2099-01-01', '2099-01-01Z', now() - interval '6 hours'), 1, 'start reclaims one crashed run');
select results_eq(
  $$select status, (select count(*)::integer from public.risk_forecast_staging where snapshot_id = r.snapshot_id)
    from public.risk_forecast_snapshot_runs r where snapshot_id = 'f0220000-0000-4000-8000-000000000090'$$,
  $$values ('discarded'::text, 0)$$,
  'crash remnants are discarded while the new run stays active'
);

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
select is(public.publish_risk_forecast_snapshot('f0220000-0000-4000-8000-000000000003', '2099-01-02', '2099-01-02Z')->>'status', 'promoted', 'winning promotion replay is idempotent');

select * from finish();
rollback;
