begin;

set local search_path = public, extensions;

select no_plan();

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
select
  '00000000-0000-0000-0000-000000000000',
  id,
  'authenticated',
  'authenticated',
  email,
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
from (
  values
    ('f0200000-0000-4000-8000-000000000001'::uuid, 'f020-owner@example.invalid'),
    ('f0200000-0000-4000-8000-000000000002'::uuid, 'f020-other@example.invalid'),
    ('f0200000-0000-4000-8000-000000000003'::uuid, 'f020-moderator@example.invalid')
) as fixtures(id, email);

insert into public.user_roles (user_id, role)
values ('f0200000-0000-4000-8000-000000000003', 'report_moderator');

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.citizen_reports'::regclass
      and conname = 'citizen_reports_photo_key_valid'
      and contype = 'c'
      and convalidated
  ),
  'citizen reports have a validated canonical photo key constraint'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f0200000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $$insert into public.citizen_reports (
      id, user_id, lat, lon, sighting, size_hint, note, photo_url
    ) values (
      'f0201000-0000-4000-8000-000000000001',
      'f0200000-0000-4000-8000-000000000001',
      36, 3, 'smoke', 'small', 'f020-valid-owner',
      'f0200000-0000-4000-8000-000000000001/f0202000-0000-4000-8000-000000000001.jpg'
    )$$,
  'an owner can store a canonical private JPEG key'
);

select lives_ok(
  $$update public.citizen_reports
    set photo_url = 'f0200000-0000-4000-8000-000000000001/f0202000-0000-4000-8000-000000000002.png'
    where id = 'f0201000-0000-4000-8000-000000000001'$$,
  'an owner can update a pending report to a canonical private PNG key'
);

select lives_ok(
  $$insert into public.citizen_reports (
      user_id, lat, lon, sighting, size_hint, note, photo_url
    ) values (
      'f0200000-0000-4000-8000-000000000001',
      36, 3, 'smoke', 'small', 'f020-no-photo', null
    )$$,
  'reports without photos remain valid'
);
delete from public.citizen_reports where note = 'f020-no-photo';

select throws_ok(
  $$insert into public.citizen_reports (
      user_id, lat, lon, sighting, size_hint, note, photo_url
    ) values (
      'f0200000-0000-4000-8000-000000000001',
      36, 3, 'smoke', 'small', 'f020-cross-owner',
      'f0200000-0000-4000-8000-000000000002/f0202000-0000-4000-8000-000000000003.jpg'
    )$$,
  '23514', null,
  'an owner cannot insert another user prefix'
);
delete from public.citizen_reports where note = 'f020-cross-owner';

select throws_ok(
  $$insert into public.citizen_reports (
      user_id, lat, lon, sighting, size_hint, note, photo_url
    ) values (
      'f0200000-0000-4000-8000-000000000001',
      36, 3, 'smoke', 'small', 'f020-absolute',
      'https://attacker.example/private.jpg'
    )$$,
  '23514', null,
  'an owner cannot insert an absolute network URL'
);
delete from public.citizen_reports where note = 'f020-absolute';

select throws_ok(
  $$insert into public.citizen_reports (
      user_id, lat, lon, sighting, size_hint, note, photo_url
    ) values (
      'f0200000-0000-4000-8000-000000000001',
      36, 3, 'smoke', 'small', 'f020-traversal',
      'f0200000-0000-4000-8000-000000000001/../private.jpg'
    )$$,
  '23514', null,
  'an owner cannot insert a traversal key'
);
delete from public.citizen_reports where note = 'f020-traversal';

select throws_ok(
  $$insert into public.citizen_reports (
      user_id, lat, lon, sighting, size_hint, note, photo_url
    ) values (
      'f0200000-0000-4000-8000-000000000001',
      36, 3, 'smoke', 'small', 'f020-extension',
      'f0200000-0000-4000-8000-000000000001/f0202000-0000-4000-8000-000000000004.svg'
    )$$,
  '23514', null,
  'an owner cannot insert an unsupported extension'
);
delete from public.citizen_reports where note = 'f020-extension';

select throws_ok(
  $$update public.citizen_reports
    set photo_url = 'f0200000-0000-4000-8000-000000000002/f0202000-0000-4000-8000-000000000005.jpg'
    where id = 'f0201000-0000-4000-8000-000000000001'$$,
  '23514', null,
  'an owner cannot update a report to another user prefix'
);
update public.citizen_reports
set photo_url = 'f0200000-0000-4000-8000-000000000001/f0202000-0000-4000-8000-000000000002.png'
where id = 'f0201000-0000-4000-8000-000000000001';

select throws_ok(
  $$update public.citizen_reports
    set photo_url = 'https://attacker.example/update.jpg'
    where id = 'f0201000-0000-4000-8000-000000000001'$$,
  '23514', null,
  'an owner cannot update a report to an absolute network URL'
);
update public.citizen_reports
set photo_url = 'f0200000-0000-4000-8000-000000000001/f0202000-0000-4000-8000-000000000002.png'
where id = 'f0201000-0000-4000-8000-000000000001';

select throws_ok(
  $$update public.citizen_reports
    set photo_url = 'f0200000-0000-4000-8000-000000000001/../update.png'
    where id = 'f0201000-0000-4000-8000-000000000001'$$,
  '23514', null,
  'an owner cannot update a report to a traversal key'
);
update public.citizen_reports
set photo_url = 'f0200000-0000-4000-8000-000000000001/f0202000-0000-4000-8000-000000000002.png'
where id = 'f0201000-0000-4000-8000-000000000001';

select throws_ok(
  $$update public.citizen_reports
    set photo_url = 'f0200000-0000-4000-8000-000000000001/f0202000-0000-4000-8000-000000000005.jpeg'
    where id = 'f0201000-0000-4000-8000-000000000001'$$,
  '23514', null,
  'an owner cannot update a report to a non-canonical extension'
);
update public.citizen_reports
set photo_url = 'f0200000-0000-4000-8000-000000000001/f0202000-0000-4000-8000-000000000002.png'
where id = 'f0201000-0000-4000-8000-000000000001';

select is(
  (select count(*)::integer from public.citizen_reports
    where id = 'f0201000-0000-4000-8000-000000000001'),
  1,
  'the owner still sees their private report under existing RLS'
);

select set_config(
  'request.jwt.claim.sub',
  'f0200000-0000-4000-8000-000000000002',
  true
);
select is(
  (select count(*)::integer from public.citizen_reports
    where id = 'f0201000-0000-4000-8000-000000000001'),
  0,
  'another ordinary user still cannot read the private report'
);

select set_config(
  'request.jwt.claim.sub',
  'f0200000-0000-4000-8000-000000000003',
  true
);
select is(
  (select count(*)::integer from public.citizen_reports
    where id = 'f0201000-0000-4000-8000-000000000001'),
  1,
  'a report moderator retains private report visibility'
);

reset role;
set local role service_role;
select lives_ok(
  $$insert into public.citizen_reports (
      id, user_id, lat, lon, sighting, size_hint, note, photo_url
    ) values (
      'f0201000-0000-4000-8000-000000000002',
      'f0200000-0000-4000-8000-000000000002',
      36, 3, 'smoke', 'small', 'f020-service-valid',
      'f0200000-0000-4000-8000-000000000002/f0202000-0000-4000-8000-000000000006.png'
    )$$,
  'service writers retain legitimate canonical photo inserts'
);
select throws_ok(
  $$update public.citizen_reports
    set photo_url = 'https://attacker.example/service.png'
    where id = 'f0201000-0000-4000-8000-000000000002'$$,
  '23514', null,
  'service writers cannot bypass the photo key boundary'
);
update public.citizen_reports
set photo_url = 'f0200000-0000-4000-8000-000000000002/f0202000-0000-4000-8000-000000000006.png'
where id = 'f0201000-0000-4000-8000-000000000002';

reset role;
create temporary table qa_report_photo_constraint as
select pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.citizen_reports'::regclass
  and conname = 'citizen_reports_photo_key_valid';

alter table public.citizen_reports
  drop constraint citizen_reports_photo_key_valid;
insert into public.citizen_reports (
  user_id, lat, lon, sighting, size_hint, note, photo_url
) values (
  'f0200000-0000-4000-8000-000000000002',
  36, 3, 'smoke', 'small', 'f020-legacy-invalid',
  'https://legacy.example/photo.jpg'
);
do $test$
declare
  constraint_definition text;
begin
  select definition into constraint_definition
  from qa_report_photo_constraint;
  execute 'alter table public.citizen_reports add constraint citizen_reports_photo_key_valid '
    || constraint_definition || ' not valid';
end
$test$;
select throws_ok(
  $$alter table public.citizen_reports
    validate constraint citizen_reports_photo_key_valid$$,
  '23514', null,
  'migration validation fails safely when an invalid legacy key exists'
);
delete from public.citizen_reports where note = 'f020-legacy-invalid';
select lives_ok(
  $$alter table public.citizen_reports
    validate constraint citizen_reports_photo_key_valid$$,
  'the canonical constraint validates after invalid legacy data is removed'
);

select * from finish();

rollback;
