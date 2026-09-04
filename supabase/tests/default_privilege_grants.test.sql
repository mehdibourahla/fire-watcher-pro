begin;

set local search_path = public, extensions;

select no_plan();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  id, 'authenticated', 'authenticated', email, '',
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  now(), now()
from (
  values
    ('f0300000-0000-4000-8000-000000000001'::uuid, 'f030-owner@example.invalid'),
    ('f0300000-0000-4000-8000-000000000002'::uuid, 'f030-other@example.invalid')
) as fixtures(id, email);

insert into public.citizen_reports (id, user_id, lat, lon, sighting, note, status)
values (
  'f0301000-0000-4000-8000-000000000001',
  'f0300000-0000-4000-8000-000000000001',
  36, 3, 'smoke', 'f030-hazard-fixture', 'pending'
);

select ok(
  not has_table_privilege('anon', 'public.hazard_reports', 'insert')
  and not has_table_privilege('anon', 'public.hazard_reports', 'update')
  and not has_table_privilege('anon', 'public.hazard_reports', 'delete')
  and not has_table_privilege('anon', 'public.hazard_reports', 'truncate')
  and not has_table_privilege('authenticated', 'public.hazard_reports', 'insert')
  and not has_table_privilege('authenticated', 'public.hazard_reports', 'update')
  and not has_table_privilege('authenticated', 'public.hazard_reports', 'delete')
  and not has_table_privilege('authenticated', 'public.hazard_reports', 'truncate')
  and has_table_privilege('anon', 'public.hazard_reports', 'select')
  and has_table_privilege('authenticated', 'public.hazard_reports', 'select'),
  'hazard_reports keeps read access but loses every write grant'
);

select ok(
  not has_table_privilege('anon', 'public.telegram_channels', 'select')
  and not has_table_privilege('anon', 'public.telegram_channels', 'insert')
  and not has_table_privilege('authenticated', 'public.telegram_channels', 'select')
  and not has_table_privilege('authenticated', 'public.telegram_channels', 'insert')
  and not has_table_privilege('authenticated', 'public.telegram_channels', 'update')
  and not has_table_privilege('authenticated', 'public.telegram_channels', 'delete')
  and not has_table_privilege('authenticated', 'public.telegram_channels', 'truncate'),
  'telegram_channels stays service_role-only'
);

set local role anon;
select throws_ok(
  $$update public.hazard_reports set status = 'approved'
    where id = 'f0301000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'an anonymous caller cannot self-approve a hazard report through the view'
);
select throws_ok(
  $$delete from public.hazard_reports
    where id = 'f0301000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'an anonymous caller cannot delete a hazard report through the view'
);
select lives_ok(
  $$select 1 from public.hazard_reports
    where id = 'f0301000-0000-4000-8000-000000000001'$$,
  'the read path through the view is untouched'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f0300000-0000-4000-8000-000000000002',
  true
);
select throws_ok(
  $$update public.hazard_reports set lat = 0, lon = 0
    where id = 'f0301000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'a signed-in non-owner cannot move a hazard report through the view'
);

reset role;
select is(
  (select status from public.citizen_reports
    where id = 'f0301000-0000-4000-8000-000000000001'),
  'pending',
  'the underlying report was never mutated by the blocked attempts'
);

insert into storage.objects (bucket_id, name, owner)
values (
  'report-photos',
  'f0300000-0000-4000-8000-000000000001/f0302000-0000-4000-8000-000000000001.jpg',
  'f0300000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f0300000-0000-4000-8000-000000000001',
  true
);
select throws_ok(
  $$update storage.objects
    set name = 'f0300000-0000-4000-8000-000000000002/f0302000-0000-4000-8000-000000000001.jpg'
    where bucket_id = 'report-photos'
      and name = 'f0300000-0000-4000-8000-000000000001/f0302000-0000-4000-8000-000000000001.jpg'$$,
  '42501', null,
  'an owner cannot rename their own photo out of their own folder prefix'
);

reset role;

select * from finish();

rollback;
