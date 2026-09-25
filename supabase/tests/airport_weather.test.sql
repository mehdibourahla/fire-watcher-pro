begin;
set local search_path = public, extensions;
select plan(3);

insert into airport_weather(station, lat, lon, observed_at, visibility_m, weather, raw)
  values ('DAZZ', 36.7, 3.2, now(), 600, 'SA', 'METAR DAZZ 251700Z 36025KT 0600 SA 30/05 Q1010')
  on conflict (station) do nothing;

set local role anon;
select is((select visibility_m from airport_weather where station = 'DAZZ'), 600,
  'anyone can read the latest airport report');
select throws_ok($$update airport_weather set visibility_m = 9999 where station = 'DAZZ'$$, '42501', null,
  'nobody edits a measurement');
reset role;

select throws_ok($$insert into airport_weather(station, lat, lon, observed_at, raw)
  values ('GMMX', 35.6, -5.9, now(), 'METAR GMMX')$$, '23514', null, 'only Algerian airports are stored');

select * from finish();
rollback;
