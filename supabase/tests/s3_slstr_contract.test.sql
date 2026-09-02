begin;
set local search_path = public, extensions;
select no_plan();

select is(
  (select count(*)::integer from public.source_contracts where key = 's3_slstr'),
  1,
  'Sentinel-3 SLSTR is a registered source contract'
);
select results_eq(
  $$select family, criticality, freshness_basis, execution_target, cadence_minutes, schedule_enabled
    from public.source_contracts where key = 's3_slstr'$$,
  $$values ('fire_detection', 'supporting', 'upstream_published_at', 'cloudflare', 60, true)$$,
  'SLSTR runs hourly on the Worker as a supporting detection source'
);
select is(
  (select count(*)::integer from public.source_health where key = 's3_slstr'),
  1,
  'SLSTR appears on the public health surface'
);

select * from finish();
rollback;
