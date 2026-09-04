begin;

set local search_path = public, extensions;

select plan(7);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
  email, '', now(), '{"provider":"email","providers":["email"]}'::jsonb, meta, now(), now()
from (
  values
    ('ad090000-0000-4000-8000-000000000001'::uuid, 'ad09-admin@example.invalid', '{}'::jsonb),
    ('ad090000-0000-4000-8000-000000000002'::uuid, 'ad09-member@example.invalid', '{}'::jsonb),
    ('ad090000-0000-4000-8000-000000000003'::uuid, 'ad09-named@example.invalid',
     '{"full_name":"Yasmine Ikhlef"}'::jsonb)
) as fixtures(id, email, meta);

select is(
  (select count(*)::int from public.profiles
   where id in ('ad090000-0000-4000-8000-000000000001',
                'ad090000-0000-4000-8000-000000000002',
                'ad090000-0000-4000-8000-000000000003')),
  3,
  'the trigger creates a profile for every new account'
);

select is(
  (select display_name from public.profiles
   where id = 'ad090000-0000-4000-8000-000000000003'),
  'Yasmine Ikhlef',
  'a name supplied at signup is carried into the profile'
);

select is(
  (select display_name from public.profiles
   where id = 'ad090000-0000-4000-8000-000000000002'),
  null,
  'an account with no name metadata still gets a profile'
);

insert into public.user_roles (user_id, role) values
  ('ad090000-0000-4000-8000-000000000001', 'admin'),
  ('ad090000-0000-4000-8000-000000000002', 'translator');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad090000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select * from public.list_members_for_admin()$$,
  null, null,
  'a translator cannot read the member list'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad090000-0000-4000-8000-000000000001', true);

select is(
  (select email from public.list_members_for_admin()
   where id = 'ad090000-0000-4000-8000-000000000002'),
  'ad09-member@example.invalid',
  'an admin sees the email, which is the only identifier every account has'
);

select is(
  (select roles from public.list_members_for_admin()
   where id = 'ad090000-0000-4000-8000-000000000002'),
  array['translator']::public.app_role[],
  'roles come back with the member'
);

select is(
  (select roles from public.list_members_for_admin()
   where id = 'ad090000-0000-4000-8000-000000000003'),
  '{}'::public.app_role[],
  'a member with no roles returns an empty array, not null'
);

reset role;

select * from finish();

rollback;
