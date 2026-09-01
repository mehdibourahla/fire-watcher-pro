begin;

set local search_path = public, extensions;

select plan(17);

select has_table(
  'public',
  'risk_forecast_staging',
  'risk refreshes have a private staging table'
);
select has_pk(
  'public',
  'risk_forecast_staging',
  'staged rows are idempotent within a snapshot'
);
select ok(
  coalesce((
    select relrowsecurity
    from pg_class
    where oid = to_regclass('public.risk_forecast_staging')
  ), false),
  'staging has RLS enabled'
);
select ok(
  to_regclass('public.risk_forecast_staging') is not null
  and not has_table_privilege('anon', 'public.risk_forecast_staging', 'select')
  and not has_table_privilege('anon', 'public.risk_forecast_staging', 'insert')
  and not has_table_privilege('anon', 'public.risk_forecast_staging', 'update')
  and not has_table_privilege('anon', 'public.risk_forecast_staging', 'delete')
  and not has_table_privilege('authenticated', 'public.risk_forecast_staging', 'select')
  and not has_table_privilege('authenticated', 'public.risk_forecast_staging', 'insert')
  and not has_table_privilege('authenticated', 'public.risk_forecast_staging', 'update')
  and not has_table_privilege('authenticated', 'public.risk_forecast_staging', 'delete'),
  'staged forecasts are not public'
);
select ok(
  to_regclass('public.risk_forecast_staging') is not null
  and has_table_privilege('service_role', 'public.risk_forecast_staging', 'insert')
  and has_table_privilege('service_role', 'public.risk_forecast_staging', 'delete'),
  'the ingest service can stage and discard snapshots'
);
select has_function(
  'public',
  'publish_risk_forecast_snapshot',
  array['uuid'],
  'snapshot promotion is available'
);
select ok(
  to_regprocedure('public.publish_risk_forecast_snapshot(uuid)') is not null
  and has_function_privilege(
    'service_role',
    'public.publish_risk_forecast_snapshot(uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.publish_risk_forecast_snapshot(uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.publish_risk_forecast_snapshot(uuid)',
    'execute'
  ),
  'only the ingest service can promote snapshots'
);

select lives_ok(
  $$insert into public.risk_forecasts (
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
      unit.id,
      date '2099-01-01' + horizon.day,
      horizon.day,
      'local_fwi',
      10,
      1,
      false,
      '{}'::jsonb
    from public.admin_units as unit
    cross join generate_series(0, 5) as horizon(day)
    where unit.level = 'commune'
    on conflict (commune_id, forecast_date, horizon_days, source)
    do update set fwi = excluded.fwi, danger_level = excluded.danger_level$$,
  'an existing complete same-day snapshot is present'
);

select lives_ok(
  $$insert into public.risk_forecast_staging (
      snapshot_id,
      commune_id,
      forecast_date,
      horizon_days,
      fwi,
      danger_level,
      fuel_limited,
      components
    )
    select
      'f0220000-0000-4000-8000-000000000001'::uuid,
      unit.id,
      date '2099-01-01' + horizon.day,
      horizon.day,
      99,
      5,
      false,
      '{}'::jsonb
    from (
      select id
      from public.admin_units
      where level = 'commune'
      order by id
      limit 10
    ) as unit
    cross join generate_series(0, 5) as horizon(day)$$,
  'the first refresh batch is staged'
);
select results_eq(
  $$select count(*)::bigint
    from public.risk_forecasts
    where source = 'local_fwi'
      and forecast_date between date '2099-01-01' and date '2099-01-06'
      and fwi = 10$$,
  $$select count(*) * 6
    from public.admin_units
    where level = 'commune'$$,
  'readers still see the old complete snapshot between batches'
);

select lives_ok(
  $$insert into public.risk_forecast_staging (
      snapshot_id,
      commune_id,
      forecast_date,
      horizon_days,
      fwi,
      danger_level,
      fuel_limited,
      components
    )
    select
      'f0220000-0000-4000-8000-000000000001'::uuid,
      unit.id,
      date '2099-01-01' + horizon.day,
      horizon.day,
      99,
      5,
      false,
      '{}'::jsonb
    from public.admin_units as unit
    cross join generate_series(0, 5) as horizon(day)
    where unit.level = 'commune'
    on conflict (snapshot_id, commune_id, forecast_date, horizon_days)
    do update set fwi = excluded.fwi, danger_level = excluded.danger_level$$,
  'the remaining rows complete the staged snapshot'
);
select results_eq(
  $$select public.publish_risk_forecast_snapshot(
      'f0220000-0000-4000-8000-000000000001'::uuid
    )::bigint$$,
  $$select count(*) * 6
    from public.admin_units
    where level = 'commune'$$,
  'a complete generation promotes in one transaction'
);
select results_eq(
  $$select count(*)::bigint
    from public.risk_forecasts
    where source = 'local_fwi'
      and forecast_date between date '2099-01-01' and date '2099-01-06'
      and fwi = 99$$,
  $$select count(*) * 6
    from public.admin_units
    where level = 'commune'$$,
  'readers see the complete promoted generation'
);

select lives_ok(
  $$insert into public.risk_forecast_staging (
      snapshot_id,
      commune_id,
      forecast_date,
      horizon_days,
      fwi,
      danger_level,
      fuel_limited,
      components
    )
    select
      'f0220000-0000-4000-8000-000000000002'::uuid,
      unit.id,
      date '2099-01-01' + horizon.day,
      horizon.day,
      40,
      4,
      false,
      '{}'::jsonb
    from public.admin_units as unit
    cross join generate_series(0, 5) as horizon(day)
    where unit.level = 'commune'
      and not (
        unit.id = (
          select id
          from public.admin_units
          where level = 'commune'
          order by id
          limit 1
        )
        and horizon.day = 5
      )$$,
  'an incomplete concurrent generation can be staged independently'
);
select throws_ok(
  $$select public.publish_risk_forecast_snapshot(
      'f0220000-0000-4000-8000-000000000002'::uuid
    )$$,
  'P0001',
  'incomplete_risk_snapshot',
  'an incomplete generation cannot replace the published snapshot'
);
select results_eq(
  $$select count(*)::bigint
    from public.risk_forecasts
    where source = 'local_fwi'
      and forecast_date between date '2099-01-01' and date '2099-01-06'
      and fwi = 99$$,
  $$select count(*) * 6
    from public.admin_units
    where level = 'commune'$$,
  'failed promotion preserves the last complete snapshot'
);
select is(
  public.publish_risk_forecast_snapshot(
    'f0220000-0000-4000-8000-000000000001'::uuid
  ),
  0,
  'replaying an already promoted snapshot is idempotent'
);

select * from finish();

rollback;
