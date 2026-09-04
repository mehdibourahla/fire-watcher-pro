begin;

set local search_path = public, extensions;

select plan(18);

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
    ('f0140000-0000-4000-8000-000000000001'::uuid, 'f014-admin-1@example.invalid'),
    ('f0140000-0000-4000-8000-000000000002'::uuid, 'f014-admin-2@example.invalid'),
    ('f0140000-0000-4000-8000-000000000003'::uuid, 'f014-moderator@example.invalid'),
    ('f0140000-0000-4000-8000-000000000004'::uuid, 'f014-user@example.invalid')
) as fixtures(id, email);

insert into public.user_roles (user_id, role)
values
  ('f0140000-0000-4000-8000-000000000001', 'admin'),
  ('f0140000-0000-4000-8000-000000000003', 'report_moderator');

delete from public.user_roles
where role = 'admin'
  and user_id <> 'f0140000-0000-4000-8000-000000000001';

set local role service_role;
select throws_ok(
  $$update public.user_roles
    set role = 'report_moderator'
    where user_id = 'f0140000-0000-4000-8000-000000000001'
      and role = 'admin'$$,
  'P0001',
  'last_admin_required',
  'the sole admin cannot demote their own admin role'
);
select is(
  (select count(*)::integer from public.user_roles where role = 'admin'),
  1,
  'a rejected terminal demotion leaves one admin'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f0140000-0000-4000-8000-000000000001',
  true
);

select throws_ok(
  $$delete from public.user_roles
    where user_id = 'f0140000-0000-4000-8000-000000000001'
      and role = 'admin'$$,
  'P0001',
  'last_admin_required',
  'the sole admin cannot revoke their own admin role'
);
select is(
  (select count(*)::integer from public.user_roles where role = 'admin'),
  1,
  'a rejected terminal revocation leaves one admin'
);

reset role;
insert into public.user_roles (user_id, role)
values ('f0140000-0000-4000-8000-000000000001', 'admin')
on conflict (user_id, role) do nothing;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f0140000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $$insert into public.user_roles (user_id, role)
    values ('f0140000-0000-4000-8000-000000000002', 'admin')$$,
  'an admin can grant a second admin role'
);

select set_config(
  'request.jwt.claim.sub',
  'f0140000-0000-4000-8000-000000000002',
  true
);
select lives_ok(
  $$delete from public.user_roles
    where user_id = 'f0140000-0000-4000-8000-000000000002'
      and role = 'admin'$$,
  'one of two admins can revoke their own admin role'
);
reset role;
select is(
  (select count(*)::integer from public.user_roles where role = 'admin'),
  1,
  'a normal two-admin revocation leaves the other admin'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f0140000-0000-4000-8000-000000000001',
  true
);
select is(
  (select count(*)::integer from public.user_roles where role = 'admin'),
  1,
  'an admin exact-count query sees every admin role'
);
select lives_ok(
  $$insert into public.user_roles (user_id, role)
    values ('f0140000-0000-4000-8000-000000000004', 'report_moderator')$$,
  'an admin can grant a non-terminal role'
);
select lives_ok(
  $$delete from public.user_roles
    where user_id = 'f0140000-0000-4000-8000-000000000004'
      and role = 'report_moderator'$$,
  'an admin can revoke a non-terminal role'
);

select set_config(
  'request.jwt.claim.sub',
  'f0140000-0000-4000-8000-000000000004',
  true
);
select throws_ok(
  $$insert into public.user_roles (user_id, role)
    values ('f0140000-0000-4000-8000-000000000004', 'admin')$$,
  '42501',
  null,
  'an ordinary user cannot grant themselves admin'
);
select is(
  (select count(*)::integer from public.user_roles where role = 'admin'),
  0,
  'an ordinary user exact-count query exposes no admin membership'
);

select set_config(
  'request.jwt.claim.sub',
  'f0140000-0000-4000-8000-000000000003',
  true
);
select is(
  (select count(*)::integer from public.user_roles where role = 'admin'),
  0,
  'a report moderator exact-count query exposes no admin membership'
);
select lives_ok(
  $$delete from public.user_roles
    where user_id = 'f0140000-0000-4000-8000-000000000001'
      and role = 'admin'$$,
  'a report moderator delete is denied without leaking a row-policy error'
);

reset role;
select is(
  (select count(*)::integer from public.user_roles where role = 'admin'),
  1,
  'the report moderator cannot remove an admin role'
);

set local role service_role;
select throws_ok(
  $$delete from public.user_roles
    where user_id = 'f0140000-0000-4000-8000-000000000001'
      and role = 'admin'$$,
  'P0001',
  'last_admin_required',
  'the service role cannot silently bypass the terminal-admin invariant'
);
select throws_ok(
  $$truncate table public.user_roles$$,
  '42501',
  null,
  'the service role cannot bypass the invariant through truncate'
);

reset role;
select ok(
  not has_table_privilege('anon', 'public.user_roles', 'truncate')
  and not has_table_privilege('authenticated', 'public.user_roles', 'truncate')
  and has_table_privilege('authenticated', 'public.user_roles', 'select')
  and has_table_privilege('authenticated', 'public.user_roles', 'insert')
  and has_table_privilege('authenticated', 'public.user_roles', 'delete')
  and not has_table_privilege('authenticated', 'public.user_roles', 'update'),
  'role-table grants preserve supported management without an RLS-bypassing truncate path'
);

select * from finish();

rollback;
