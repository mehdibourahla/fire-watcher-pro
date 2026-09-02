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
  $$values ('fire_detection', 'supporting', 'last_success_at', 'cloudflare', 60, true)$$,
  'SLSTR runs hourly on the Worker and reports freshness from the poll, not an upstream slot'
);
select is(
  (select count(*)::integer from public.source_health where key = 's3_slstr'),
  1,
  'SLSTR appears on the public health surface'
);

select lives_ok(
  $$insert into public.detections
      (source, sensor, detected_at, lat, lon, confidence_raw, frp_mw, natural_key)
    values ('s3', 'SLSTR-S3B', now(), 36.7, 5.8, 0.98, 21.5, 's3:test:36.70000:5.80000:now')$$,
  'a Sentinel-3 detection passes the source check'
);

select * from finish();
rollback;
