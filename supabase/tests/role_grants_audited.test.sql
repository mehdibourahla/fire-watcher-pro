begin;

set local search_path = public, extensions;

select plan(6);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
  email, '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
from (
  values
    ('ad050000-0000-4000-8000-000000000001'::uuid, 'ad05-admin@example.invalid'),
    ('ad050000-0000-4000-8000-000000000002'::uuid, 'ad05-member@example.invalid')
) as fixtures(id, email);

insert into public.user_roles (user_id, role)
values ('ad050000-0000-4000-8000-000000000001', 'admin');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', 'ad050000-0000-4000-8000-000000000002', true
);

select throws_ok(
  $$select public.grant_user_role(
      'ad050000-0000-4000-8000-000000000002', 'translator')$$,
  null, null,
  'a member cannot grant themselves a role'
);

select throws_ok(
  $$insert into public.user_roles (user_id, role)
    values ('ad050000-0000-4000-8000-000000000002', 'translator')$$,
  null, null,
  'the direct write path is closed, so audit cannot be skipped'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', 'ad050000-0000-4000-8000-000000000001', true
);

select lives_ok(
  $$select public.grant_user_role(
      'ad050000-0000-4000-8000-000000000002', 'translator')$$,
  'an admin can grant a role'
);

select lives_ok(
  $$select public.revoke_user_role(
      'ad050000-0000-4000-8000-000000000002', 'translator')$$,
  'an admin can revoke a role'
);

reset role;

select is(
  (select count(*)::int from public.admin_audit
   where domain = 'people' and action in ('role.grant', 'role.revoke')),
  2,
  'both the grant and the revoke left an audit row'
);

select is(
  (select after ->> 'role' from public.admin_audit
   where action = 'role.grant' order by at desc limit 1),
  'translator',
  'the audit row names the role that was granted'
);

select * from finish();

rollback;
