begin;
set local search_path = public, extensions;
select no_plan();

insert into public.admin_units(id,level,code,name_ar,name_fr,name_en,lat,lon) values
('19000000-0000-4000-8000-000000000001','commune','WX01','اختبار','Weather A','Weather A',36.7,3.1),
('19000000-0000-4000-8000-000000000002','commune','WX02','اختبار','Weather B','Weather B',35.7,4.1),
('19000000-0000-4000-8000-000000000003','wilaya','WX03','اختبار','Weather region','Weather region',36.7,3.1);

delete from public.source_job_leases where contract_key='openmeteo_weather';
delete from public.source_jobs where contract_key='openmeteo_weather';
insert into public.source_jobs(contract_key,contract_version,trigger_kind,idempotency_key,scheduled_for,
  data_from,data_through,execution_target,available_at,max_attempts,retry_base_seconds,retry_until)
values('openmeteo_weather',1,'manual','weather-sql-test',now(),now()-interval '6 hours',now(),
  'cloudflare',now()-interval '1 minute',3,60,now()+interval '1 hour');
select set_config('weather.job',id::text,true),set_config('weather.attempt',attempt_count::text,true),
  set_config('weather.scheduled',scheduled_for::text,true)
from public.claim_source_job('weather-sql-test','cloudflare','openmeteo_weather');

select set_config('weather.evidence',jsonb_build_object(
  'source','open-meteo','model','best_match','scheduledAt',current_setting('weather.scheduled'),
  'fetchedAt',now(),'requested',jsonb_build_object('lat',36.7,'lon',3.1),
  'grid',jsonb_build_object('lat',36.7,'lon',3.1),
  'hours',(select jsonb_agg(jsonb_build_object('time',now()+i*interval '1 hour',
    'precipitationMm',0,'rainMm',0,'probabilityPercent',0,'weatherCode',0,'gustKmh',12,'cape',null) order by i)
    from generate_series(0,47) i))::text,true);
select set_config('weather.batch',jsonb_build_array(jsonb_build_object(
  'commune_id','19000000-0000-4000-8000-000000000001',
  'evidence',current_setting('weather.evidence')::jsonb))::text,true);

set local role anon;
select is(public.current_weather_snapshot('19000000-0000-4000-8000-000000000001'),null::jsonb,'missing commune snapshot returns null');
select throws_ok($$select * from public.weather_snapshots$$,'42501',null,'anonymous cannot read archive');
select throws_ok($$insert into public.weather_snapshots default values$$,'42501',null,'anonymous cannot insert snapshots');
select throws_ok($$update public.weather_snapshots set evidence='{}'$$,'42501',null,'anonymous cannot update snapshots');
select throws_ok($$delete from public.weather_snapshots$$,'42501',null,'anonymous cannot delete snapshots');
select throws_ok($$select public.save_weather_snapshots(current_setting('weather.job')::uuid,1,'[]')$$,'42501',null,'anonymous cannot invoke collector RPC');
set local role authenticated;
select throws_ok($$select * from public.weather_snapshots$$,'42501',null,'authenticated users cannot read archive');
select throws_ok($$select public.save_weather_snapshots(current_setting('weather.job')::uuid,1,'[]')$$,'42501',null,'authenticated users cannot invoke collector RPC');

set local role service_role;
select throws_ok($$select public.save_weather_snapshots(gen_random_uuid(),1,current_setting('weather.batch')::jsonb)$$,'P0001','weather_source_lease_lost','unknown job cannot save');
select throws_ok($$select public.save_weather_snapshots(current_setting('weather.job')::uuid,current_setting('weather.attempt')::integer+1,current_setting('weather.batch')::jsonb)$$,'P0001','weather_source_lease_lost','wrong lease attempt cannot save');
select throws_ok($$select public.save_weather_snapshots(current_setting('weather.job')::uuid,current_setting('weather.attempt')::integer,
  jsonb_set(current_setting('weather.batch')::jsonb,'{0,evidence,scheduledAt}','"2000-01-01T00:00:00Z"'))$$,'P0001','weather_identity_mismatch','scheduled identity must match leased job');
select throws_ok($$select public.save_weather_snapshots(current_setting('weather.job')::uuid,current_setting('weather.attempt')::integer,
  jsonb_set(current_setting('weather.batch')::jsonb,'{0,evidence,requested,lat}','12'))$$,'P0001','weather_identity_mismatch','requested coordinates must match commune');
select throws_ok($$select public.save_weather_snapshots(current_setting('weather.job')::uuid,current_setting('weather.attempt')::integer,
  current_setting('weather.batch')::jsonb #- '{0,evidence,requested}')$$,'P0001','weather_identity_mismatch','missing coordinates cannot bypass identity');
select throws_ok($$select public.save_weather_snapshots(current_setting('weather.job')::uuid,current_setting('weather.attempt')::integer,
  jsonb_set(current_setting('weather.batch')::jsonb,'{0,commune_id}','"19000000-0000-4000-8000-000000000003"'))$$,'P0001','weather_identity_mismatch','wilaya cannot masquerade as commune');
select throws_ok($$select public.save_weather_snapshots(current_setting('weather.job')::uuid,current_setting('weather.attempt')::integer,
  jsonb_set(current_setting('weather.batch')::jsonb,'{0,evidence,hours}',(current_setting('weather.evidence')::jsonb->'hours')-47))$$,'23514',null,'47-hour forecast rejected');
select throws_ok($$select public.save_weather_snapshots(current_setting('weather.job')::uuid,current_setting('weather.attempt')::integer,
  jsonb_set(current_setting('weather.batch')::jsonb,'{0,evidence,hours}',(current_setting('weather.evidence')::jsonb->'hours')||jsonb_build_array(current_setting('weather.evidence')::jsonb->'hours'->0)))$$,'23514',null,'49-hour forecast rejected');
select throws_ok($$select public.save_weather_snapshots(current_setting('weather.job')::uuid,current_setting('weather.attempt')::integer,
  current_setting('weather.batch')::jsonb #- '{0,evidence,hours}')$$,'23514',null,'missing hours cannot bypass structural check');
select throws_ok($$select public.save_weather_snapshots(current_setting('weather.job')::uuid,current_setting('weather.attempt')::integer,
  current_setting('weather.batch')::jsonb #- '{0,evidence,source}')$$,'23514',null,'missing provenance cannot bypass structural check');
select is((select count(*) from public.weather_snapshots where commune_id='19000000-0000-4000-8000-000000000001'),0::bigint,'rejected batches persist no evidence');
select is(public.save_weather_snapshots(current_setting('weather.job')::uuid,current_setting('weather.attempt')::integer,current_setting('weather.batch')::jsonb),1,'live matching lease saves one snapshot');
select is(public.save_weather_snapshots(current_setting('weather.job')::uuid,current_setting('weather.attempt')::integer,
  jsonb_set(current_setting('weather.batch')::jsonb,'{0,evidence,hours,0,gustKmh}','99')),0,'replay does not replace first evidence');
select is(public.current_weather_snapshot('19000000-0000-4000-8000-000000000001'),current_setting('weather.evidence')::jsonb,'first valid evidence survives changed replay');
select throws_ok($$update public.weather_snapshots set evidence='{}'$$,'42501',null,'service cannot mutate archive');
select throws_ok($$delete from public.weather_snapshots$$,'42501',null,'service cannot delete archive');

reset role;
insert into public.weather_snapshots(commune_id,scheduled_at,fetched_at,evidence) values
('19000000-0000-4000-8000-000000000001',current_setting('weather.scheduled')::timestamptz-interval '6 hours',now()+interval '1 hour',
  jsonb_set(current_setting('weather.evidence')::jsonb,'{scheduledAt}',to_jsonb(current_setting('weather.scheduled')::timestamptz-interval '6 hours'))),
('19000000-0000-4000-8000-000000000002',current_setting('weather.scheduled')::timestamptz+interval '6 hours',now(),
  jsonb_set(current_setting('weather.evidence')::jsonb,'{requested}','{"lat":35.7,"lon":4.1}'));
set local role anon;
select is(public.current_weather_snapshot('19000000-0000-4000-8000-000000000001'),current_setting('weather.evidence')::jsonb,'late older schedule cannot override newest even with later fetch time');
select is(public.current_weather_snapshot('19000000-0000-4000-8000-000000000002')->'requested','{"lat":35.7,"lon":4.1}'::jsonb,'current lookup selects requested commune');
select is(public.current_weather_snapshot(gen_random_uuid()),null::jsonb,'unknown commune does not fall back to another commune');

reset role;
update public.source_job_leases set leased_at=clock_timestamp()-interval '1 hour',lease_expires_at=clock_timestamp()-interval '1 second'
where contract_key='openmeteo_weather';
set local role service_role;
select throws_ok($$select public.save_weather_snapshots(current_setting('weather.job')::uuid,current_setting('weather.attempt')::integer,current_setting('weather.batch')::jsonb)$$,'P0001','weather_source_lease_lost','expired lease cannot save even an idempotent replay');
select is(public.current_weather_snapshot('19000000-0000-4000-8000-000000000001'),current_setting('weather.evidence')::jsonb,'expired worker leaves current evidence intact');
select * from finish();
rollback;
