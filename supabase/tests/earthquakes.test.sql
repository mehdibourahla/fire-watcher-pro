begin;
set local search_path = public, extensions;
select plan(5);

insert into earthquakes(id, occurred_at, lat, lon, magnitude, updated_at)
  values ('test_quake_1', now(), 36.7, 3.0, 4.2, now());

set local role anon;
select is((select magnitude from earthquakes where id = 'test_quake_1'), 4.2::numeric,
  'anyone can read a recorded earthquake');
select throws_ok($$insert into earthquakes(id, occurred_at, lat, lon, magnitude, updated_at)
  values ('forged', now(), 36.7, 3.0, 7.0, now())$$, '42501', null, 'nobody forges an earthquake');
reset role;

set local role authenticated;
select throws_ok($$update earthquakes set magnitude = 1 where id = 'test_quake_1'$$, '42501', null,
  'a signed-in user cannot revise a measurement');
reset role;

select ok((select enabled and family = 'hazard_observation' and execution_target = 'cloudflare'
  from source_contracts where key = 'emsc'), 'the EMSC poll is a scheduled hazard observation');
select lives_ok($$insert into alerts(user_id, kind, severity, dedupe_key, title, body)
  select id, 'earthquake', 3, 'earthquake:test_quake_1', 't', 'b' from auth.users limit 1$$,
  'zones can be alerted about an earthquake');

select * from finish();
rollback;
