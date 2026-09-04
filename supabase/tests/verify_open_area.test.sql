begin;

set local search_path = public, extensions;

select plan(4);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
  email, '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
from (
  values
    ('ad080000-0000-4000-8000-000000000001'::uuid, 'ad08-operator@example.invalid'),
    ('ad080000-0000-4000-8000-000000000002'::uuid, 'ad08-member@example.invalid')
) as fixtures(id, email);

insert into public.user_roles (user_id, role)
values ('ad080000-0000-4000-8000-000000000001', 'operator');

insert into public.open_areas (id, name, area_type, lat, lon, source)
values ('ad080000-0000-4000-8000-0000000000aa', 'Test clearing', 'pitch', 36.7, 4.0, 'osm');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad080000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.verify_open_area('ad080000-0000-4000-8000-0000000000aa', 'looks fine')$$,
  null, null,
  'a member cannot verify an open area'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad080000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.verify_open_area(
      'ad080000-0000-4000-8000-0000000000aa', 'Visited 2026-09-04, gate open')$$,
  'an operator records a field verification'
);

reset role;

select is(
  (select verified_by from public.open_areas
   where id = 'ad080000-0000-4000-8000-0000000000aa'),
  'ad080000-0000-4000-8000-000000000001'::uuid,
  'the verifier is recorded against the area'
);

select is(
  (select reason from public.admin_audit
   where action = 'open_area.verify' order by at desc limit 1),
  'Visited 2026-09-04, gate open',
  'the verification note reaches the audit log'
);

select * from finish();

rollback;
