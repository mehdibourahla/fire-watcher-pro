begin;
set local search_path = public, extensions;
select plan(5);

insert into airport_observations(station, lat, lon, observed_at, visibility_m, weather, raw) values
  ('DAZZ', 36.7, 3.2, '2026-09-25T17:00Z', 600, 'SA', 'METAR DAZZ 251700Z 36025KT 0600 SA 30/05 Q1010'),
  ('DAZZ', 36.7, 3.2, '2026-09-25T17:30Z', 4000, null, 'METAR DAZZ 251730Z 36015KT 4000 30/05 Q1010');

set local role anon;
select is((select visibility_m from airport_weather where station = 'DAZZ'), 4000,
  'the latest report is the newest one');
select is((select count(*) from airport_observations where station = 'DAZZ'), 2::bigint,
  'every report is kept, so the sandstorm half an hour earlier is still there');
select throws_ok($$update airport_observations set visibility_m = 9999 where station = 'DAZZ'$$, '42501', null,
  'nobody edits a measurement');
reset role;

select throws_ok($$insert into airport_observations(station, lat, lon, observed_at, raw)
  values ('DAZZ', 36.7, 3.2, '2026-09-25T17:00Z', 'METAR DAZZ again')$$, '23505', null,
  'a report is stored once');
select throws_ok($$insert into airport_observations(station, lat, lon, observed_at, raw)
  values ('GMMX', 35.6, -5.9, now(), 'METAR GMMX')$$, '23514', null, 'only Algerian airports are stored');

select * from finish();
rollback;
