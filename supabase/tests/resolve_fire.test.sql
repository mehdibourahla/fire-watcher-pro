begin;

set local search_path = public, extensions;

select plan(8);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
  email, '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
from (
  values
    ('ad060000-0000-4000-8000-000000000001'::uuid, 'ad06-operator@example.invalid'),
    ('ad060000-0000-4000-8000-000000000002'::uuid, 'ad06-translator@example.invalid')
) as fixtures(id, email);

insert into public.user_roles (user_id, role) values
  ('ad060000-0000-4000-8000-000000000001', 'operator'),
  ('ad060000-0000-4000-8000-000000000002', 'translator');

insert into public.fire_clusters (id, short_id, lat, lon, first_detected_at, last_detected_at, state)
values (
  'ad060000-0000-4000-8000-0000000000aa', 'AD06AA', 36.6, 4.1,
  now() - interval '2 hours', now() - interval '1 hour', 'active'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad060000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.resolve_fire('ad060000-0000-4000-8000-0000000000aa', 'extinguished')$$,
  null, null,
  'a translator cannot resolve a fire'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad060000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.resolve_fire(
      'ad060000-0000-4000-8000-0000000000aa', 'false_positive')$$,
  null, null,
  'a false positive must say why'
);

select throws_ok(
  $$select public.resolve_fire(
      'ad060000-0000-4000-8000-0000000000aa', 'extinguished', 'flare')$$,
  null, null,
  'a cause makes no sense on a fire that simply ended'
);

select throws_ok(
  $$select public.resolve_fire(
      'ad060000-0000-4000-8000-0000000000aa', 'burned_out')$$,
  null, null,
  'a state outside the vocabulary is refused'
);

select throws_ok(
  $$select public.resolve_fire(
      'ad060000-0000-4000-8000-0000000000aa', 'extinguished', null, null,
      '2020-01-01T00:00:00Z'::timestamptz)$$,
  null, null,
  'a stale expected timestamp refuses the write'
);

select lives_ok(
  $$select public.resolve_fire(
      'ad060000-0000-4000-8000-0000000000aa', 'false_positive', 'flare', 'Arzew complex')$$,
  'an operator resolves a fire as a known flare'
);

reset role;

select is(
  (select resolution_reason from public.fire_clusters
   where id = 'ad060000-0000-4000-8000-0000000000aa'),
  'flare',
  'the cause is stored in the column the screening registry already uses'
);

select is(
  (select after ->> 'state' from public.admin_audit
   where action = 'fire.resolve' order by at desc limit 1),
  'false_positive',
  'the resolution is audited'
);

select * from finish();

rollback;
