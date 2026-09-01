begin;

set local search_path = public, extensions;

select plan(33);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'f09f1000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'qa-f09-f10@example.invalid',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

select throws_ok(
  $$insert into public.zones (user_id, name, lat, lon)
    values ('f09f1000-0000-4000-8000-000000000001', '   ', 0, 0)$$,
  '23514',
  null,
  'zones reject blank names'
);
delete from public.zones where user_id = 'f09f1000-0000-4000-8000-000000000001';

select throws_ok(
  $$insert into public.zones (user_id, name, lat, lon)
    values ('f09f1000-0000-4000-8000-000000000001', repeat('z', 81), 0, 0)$$,
  '23514',
  null,
  'zones reject names longer than 80 characters'
);
delete from public.zones where user_id = 'f09f1000-0000-4000-8000-000000000001';

select throws_ok(
  $$insert into public.zones (user_id, name, lat, lon)
    values ('f09f1000-0000-4000-8000-000000000001', 'south', -90.0001, 0)$$,
  '23514', null, 'zones reject latitude below -90'
);
delete from public.zones where user_id = 'f09f1000-0000-4000-8000-000000000001';

select throws_ok(
  $$insert into public.zones (user_id, name, lat, lon)
    values ('f09f1000-0000-4000-8000-000000000001', 'north', 90.0001, 0)$$,
  '23514', null, 'zones reject latitude above 90'
);
delete from public.zones where user_id = 'f09f1000-0000-4000-8000-000000000001';

select throws_ok(
  $$insert into public.zones (user_id, name, lat, lon)
    values ('f09f1000-0000-4000-8000-000000000001', 'west', 0, -180.0001)$$,
  '23514', null, 'zones reject longitude below -180'
);
delete from public.zones where user_id = 'f09f1000-0000-4000-8000-000000000001';

select throws_ok(
  $$insert into public.zones (user_id, name, lat, lon)
    values ('f09f1000-0000-4000-8000-000000000001', 'east', 0, 180.0001)$$,
  '23514', null, 'zones reject longitude above 180'
);
delete from public.zones where user_id = 'f09f1000-0000-4000-8000-000000000001';

select throws_ok(
  $$insert into public.zones (user_id, name, lat, lon, radius_km)
    values ('f09f1000-0000-4000-8000-000000000001', 'tiny', 0, 0, 1.999)$$,
  '23514', null, 'zones reject radius below 2 km'
);
delete from public.zones where user_id = 'f09f1000-0000-4000-8000-000000000001';

select throws_ok(
  $$insert into public.zones (user_id, name, lat, lon, radius_km)
    values ('f09f1000-0000-4000-8000-000000000001', 'huge', 0, 0, 60.001)$$,
  '23514', null, 'zones reject radius above 60 km'
);
delete from public.zones where user_id = 'f09f1000-0000-4000-8000-000000000001';

select throws_ok(
  $$insert into public.zones (user_id, name, lat, lon, min_danger_level)
    values ('f09f1000-0000-4000-8000-000000000001', 'low', 0, 0, 0)$$,
  '23514', null, 'zones reject danger levels below 1'
);
delete from public.zones where user_id = 'f09f1000-0000-4000-8000-000000000001';

select throws_ok(
  $$insert into public.zones (user_id, name, lat, lon, min_danger_level)
    values ('f09f1000-0000-4000-8000-000000000001', 'high', 0, 0, 6)$$,
  '23514', null, 'zones reject danger levels above 5'
);
delete from public.zones where user_id = 'f09f1000-0000-4000-8000-000000000001';

select lives_ok(
  $$insert into public.zones (user_id, name, lat, lon, radius_km, min_danger_level)
    values ('f09f1000-0000-4000-8000-000000000001', 'minimums', -90, -180, 2, 1)$$,
  'zones accept every lower boundary'
);
select lives_ok(
  $$insert into public.zones (user_id, name, lat, lon, radius_km, min_danger_level)
    values ('f09f1000-0000-4000-8000-000000000001', repeat('z', 80), 90, 180, 60, 5)$$,
  'zones accept every upper boundary'
);
delete from public.zones where user_id = 'f09f1000-0000-4000-8000-000000000001';

insert into public.zones (user_id, name, lat, lon)
select
  'f09f1000-0000-4000-8000-000000000001',
  'zone-' || n,
  36,
  3
from generate_series(1, 10) as n;

select throws_ok(
  $$insert into public.zones (user_id, name, lat, lon)
    values ('f09f1000-0000-4000-8000-000000000001', 'zone-11', 36, 3)$$,
  '23514',
  null,
  'zones reject the eleventh row for one user'
);
select is(
  (select count(*)::integer from public.zones
    where user_id = 'f09f1000-0000-4000-8000-000000000001'),
  10,
  'the zone limit leaves exactly ten rows'
);
delete from public.zones where user_id = 'f09f1000-0000-4000-8000-000000000001';

select throws_ok(
  $$insert into public.citizen_reports (user_id, lat, lon, sighting, size_hint, note)
    values ('f09f1000-0000-4000-8000-000000000001', -90.0001, 0, 'smoke', 'small', 'bad-lat-low')$$,
  '23514', null, 'citizen reports reject latitude below -90'
);
delete from public.citizen_reports where note = 'bad-lat-low';

select throws_ok(
  $$insert into public.citizen_reports (user_id, lat, lon, sighting, size_hint, note)
    values ('f09f1000-0000-4000-8000-000000000001', 90.0001, 0, 'smoke', 'small', 'bad-lat-high')$$,
  '23514', null, 'citizen reports reject latitude above 90'
);
delete from public.citizen_reports where note = 'bad-lat-high';

select throws_ok(
  $$insert into public.citizen_reports (user_id, lat, lon, sighting, size_hint, note)
    values ('f09f1000-0000-4000-8000-000000000001', 0, -180.0001, 'smoke', 'small', 'bad-lon-low')$$,
  '23514', null, 'citizen reports reject longitude below -180'
);
delete from public.citizen_reports where note = 'bad-lon-low';

select throws_ok(
  $$insert into public.citizen_reports (user_id, lat, lon, sighting, size_hint, note)
    values ('f09f1000-0000-4000-8000-000000000001', 0, 180.0001, 'smoke', 'small', 'bad-lon-high')$$,
  '23514', null, 'citizen reports reject longitude above 180'
);
delete from public.citizen_reports where note = 'bad-lon-high';

select throws_ok(
  $$insert into public.citizen_reports (user_id, lat, lon, sighting, size_hint, note)
    values ('f09f1000-0000-4000-8000-000000000001', 0, 0, 'unknown', 'small', 'bad-sighting')$$,
  '23514', null, 'citizen reports reject unknown sightings'
);
delete from public.citizen_reports where note = 'bad-sighting';

select throws_ok(
  $$insert into public.citizen_reports (user_id, lat, lon, sighting, size_hint, note)
    values ('f09f1000-0000-4000-8000-000000000001', 0, 0, 'smoke', 'enormous', 'bad-size')$$,
  '23514', null, 'citizen reports reject unknown sizes'
);
delete from public.citizen_reports where note = 'bad-size';

select throws_ok(
  $$insert into public.citizen_reports (user_id, lat, lon, sighting, size_hint, status, note)
    values ('f09f1000-0000-4000-8000-000000000001', 0, 0, 'smoke', 'small', 'published', 'bad-status')$$,
  '23514', null, 'citizen reports reject unknown statuses'
);
delete from public.citizen_reports where note = 'bad-status';

select throws_ok(
  $$insert into public.citizen_reports (user_id, lat, lon, observed_at, sighting, size_hint, status, note)
    values ('f09f1000-0000-4000-8000-000000000001', 0, 0, now() + interval '5 minutes 1 second', 'smoke', 'small', 'pending', 'future-pending')$$,
  '23514', null, 'pending reports reject observations over five minutes in the future'
);
delete from public.citizen_reports where note = 'future-pending';

select throws_ok(
  $$insert into public.citizen_reports (user_id, lat, lon, observed_at, sighting, size_hint, status, note)
    values ('f09f1000-0000-4000-8000-000000000001', 0, 0, now() + interval '5 minutes 1 second', 'smoke', 'small', 'approved', 'future-approved')$$,
  '23514', null, 'approved reports reject observations over five minutes in the future'
);
delete from public.citizen_reports where note = 'future-approved';

select lives_ok(
  $$insert into public.citizen_reports (user_id, lat, lon, observed_at, sighting, size_hint, status, note)
    values ('f09f1000-0000-4000-8000-000000000001', -90, -180, now() + interval '5 minutes', 'smoke', 'small', 'pending', 'valid-lower')$$,
  'citizen reports accept lower coordinate and future-skew boundaries'
);
select lives_ok(
  $$insert into public.citizen_reports (user_id, lat, lon, sighting, size_hint, status, note)
    values ('f09f1000-0000-4000-8000-000000000001', 90, 180, 'other', 'large', 'approved', 'valid-upper')$$,
  'citizen reports accept upper coordinate and enum boundaries'
);
delete from public.citizen_reports where note in ('valid-lower', 'valid-upper');

select lives_ok(
  $$insert into public.citizen_reports (user_id, lat, lon, observed_at, sighting, size_hint, status, note)
    values ('f09f1000-0000-4000-8000-000000000001', 0, 0, now() + interval '100 years', 'smoke', 'small', 'rejected', 'quarantined-future')$$,
  'rejected reports may retain a legacy future observation for quarantine'
);
select lives_ok(
  $$update public.citizen_reports set status = 'rejected'
    where note = 'quarantined-future'$$,
  'moderation can keep a future legacy report rejected'
);
delete from public.citizen_reports where note = 'quarantined-future';

insert into public.citizen_reports (
  user_id,
  lat,
  lon,
  sighting,
  size_hint,
  note,
  created_at,
  updated_at
)
values (
  'f09f1000-0000-4000-8000-000000000001',
  36,
  3,
  'smoke',
  'small',
  'daily-1',
  '2000-01-01 00:00:00+00',
  '2000-01-01 00:00:00+00'
);
select ok(
  (
    select created_at = now() and updated_at = now()
    from public.citizen_reports
    where note = 'daily-1'
  ),
  'report creation timestamps are server-authoritative'
);

update public.citizen_reports
set created_at = '2001-01-01 00:00:00+00'
where note = 'daily-1';
select ok(
  (
    select created_at = now()
    from public.citizen_reports
    where note = 'daily-1'
  ),
  'report creation time cannot be backdated after insertion'
);

insert into public.citizen_reports (user_id, lat, lon, sighting, size_hint, note)
select
  'f09f1000-0000-4000-8000-000000000001',
  36,
  3,
  'smoke',
  'small',
  'daily-' || n
from generate_series(2, 3) as n;

select throws_ok(
  $$insert into public.citizen_reports (user_id, lat, lon, sighting, size_hint, note, created_at)
    values ('f09f1000-0000-4000-8000-000000000001', 36, 3, 'smoke', 'small', 'daily-4', '2000-01-01 00:00:00+00')$$,
  '23514',
  null,
  'citizen reports reject the fourth row in a rolling day'
);
select is(
  (select count(*)::integer from public.citizen_reports
    where user_id = 'f09f1000-0000-4000-8000-000000000001'
      and created_at > now() - interval '24 hours'),
  3,
  'the daily report limit leaves exactly three recent rows'
);

select ok(
  not coalesce(has_function_privilege(
    'anon',
    to_regprocedure('public.limit_zones()'),
    'execute'
  ), true)
  and not coalesce(has_function_privilege(
    'authenticated',
    to_regprocedure('public.limit_zones()'),
    'execute'
  ), true),
  'Data API roles cannot execute the zone limit trigger function'
);
select ok(
  not coalesce(has_function_privilege(
    'anon',
    to_regprocedure('public.limit_citizen_reports()'),
    'execute'
  ), true)
  and not coalesce(has_function_privilege(
    'authenticated',
    to_regprocedure('public.limit_citizen_reports()'),
    'execute'
  ), true)
  and not coalesce(has_function_privilege(
    'anon',
    to_regprocedure('public.preserve_citizen_report_created_at()'),
    'execute'
  ), true)
  and not coalesce(has_function_privilege(
    'authenticated',
    to_regprocedure('public.preserve_citizen_report_created_at()'),
    'execute'
  ), true),
  'Data API roles cannot execute citizen report trigger functions'
);

select * from finish();

rollback;
