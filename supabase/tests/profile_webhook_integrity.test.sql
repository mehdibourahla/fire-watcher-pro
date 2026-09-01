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
    ('f0190000-0000-4000-8000-000000000001'::uuid, 'f019-owner@example.invalid'),
    ('f0210000-0000-4000-8000-000000000002'::uuid, 'f021-other@example.invalid')
) as fixtures(id, email);

insert into public.profiles (id)
values
  ('f0190000-0000-4000-8000-000000000001'),
  ('f0210000-0000-4000-8000-000000000002');

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_locale_valid'
      and contype = 'c'
  ),
  'profiles have a named locale constraint'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_quiet_hours_start_valid'
      and contype = 'c'
  )
  and exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_quiet_hours_end_valid'
      and contype = 'c'
  )
  and exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_min_danger_level_valid'
      and contype = 'c'
  ),
  'profiles have named alert-preference constraints'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f0190000-0000-4000-8000-000000000001',
  true
);

select throws_ok(
  $$update public.profiles set locale = 'es'
    where id = 'f0190000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'an owner cannot store an unsupported profile locale'
);
update public.profiles set locale = 'ar'
where id = 'f0190000-0000-4000-8000-000000000001';

select throws_ok(
  $$update public.profiles set quiet_hours_start = -1
    where id = 'f0190000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'an owner cannot store quiet-hours start below zero'
);
update public.profiles set quiet_hours_start = null
where id = 'f0190000-0000-4000-8000-000000000001';

select throws_ok(
  $$update public.profiles set quiet_hours_start = 24
    where id = 'f0190000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'an owner cannot store quiet-hours start above 23'
);
update public.profiles set quiet_hours_start = null
where id = 'f0190000-0000-4000-8000-000000000001';

select throws_ok(
  $$update public.profiles set quiet_hours_end = -1
    where id = 'f0190000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'an owner cannot store quiet-hours end below zero'
);
update public.profiles set quiet_hours_end = null
where id = 'f0190000-0000-4000-8000-000000000001';

select throws_ok(
  $$update public.profiles set quiet_hours_end = 24
    where id = 'f0190000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'an owner cannot store quiet-hours end above 23'
);
update public.profiles set quiet_hours_end = null
where id = 'f0190000-0000-4000-8000-000000000001';

select throws_ok(
  $$update public.profiles set min_danger_level = 0
    where id = 'f0190000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'an owner cannot store danger below level one'
);
update public.profiles set min_danger_level = 3
where id = 'f0190000-0000-4000-8000-000000000001';

select throws_ok(
  $$update public.profiles set min_danger_level = 6
    where id = 'f0190000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'an owner cannot store danger above level five'
);
update public.profiles set min_danger_level = 3
where id = 'f0190000-0000-4000-8000-000000000001';

select lives_ok(
  $$update public.profiles
    set locale = 'kab', quiet_hours_start = 0, quiet_hours_end = 23,
        min_danger_level = 1
    where id = 'f0190000-0000-4000-8000-000000000001'$$,
  'profile lower and upper preference boundaries remain valid'
);
select lives_ok(
  $$update public.profiles
    set locale = 'fr', quiet_hours_start = null, quiet_hours_end = null,
        min_danger_level = 5
    where id = 'f0190000-0000-4000-8000-000000000001'$$,
  'nullable quiet hours and the remaining valid locale remain supported'
);

select set_config(
  'request.jwt.claim.sub',
  'f0210000-0000-4000-8000-000000000002',
  true
);
select is(
  (
    select count(*)::integer
    from public.profiles
    where id = 'f0190000-0000-4000-8000-000000000001'
  ),
  0,
  'profile owner isolation remains unchanged'
);
select lives_ok(
  $$update public.profiles set locale = 'en'
    where id = 'f0190000-0000-4000-8000-000000000001'$$,
  'cross-owner profile updates remain filtered by RLS'
);

reset role;
set local role service_role;
select throws_ok(
  $$update public.profiles set locale = 'de'
    where id = 'f0190000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'service writes cannot bypass profile integrity'
);
select lives_ok(
  $$update public.profiles
    set locale = 'en', quiet_hours_start = 23, quiet_hours_end = 0,
        min_danger_level = 5
    where id = 'f0190000-0000-4000-8000-000000000001'$$,
  'service profile access remains functional for valid preferences'
);

reset role;
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.webhook_endpoints'::regclass
      and conname = 'webhook_endpoints_label_nonblank'
      and contype = 'c'
  )
  and exists (
    select 1
    from pg_constraint
    where conrelid = 'public.webhook_endpoints'::regclass
      and conname = 'webhook_endpoints_kinds_nonempty'
      and contype = 'c'
  )
  and exists (
    select 1
    from pg_constraint
    where conrelid = 'public.webhook_endpoints'::regclass
      and conname = 'webhook_endpoints_min_severity_valid'
      and contype = 'c'
  ),
  'webhook endpoints have named content constraints'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.webhook_endpoints'::regclass
      and conname = 'webhook_endpoints_url_https'
      and contype = 'c'
  ),
  'the HTTPS and static SSRF constraint remains installed'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f0190000-0000-4000-8000-000000000001',
  true
);

select throws_ok(
  $$insert into public.webhook_endpoints (user_id, label, url, kinds)
    values (
      'f0190000-0000-4000-8000-000000000001',
      '',
      'https://hooks.example.com/f019-empty-label',
      array['fire']
    )$$,
  '23514',
  null,
  'owners cannot insert empty webhook labels'
);
delete from public.webhook_endpoints
where url = 'https://hooks.example.com/f019-empty-label';

select throws_ok(
  $$insert into public.webhook_endpoints (user_id, label, url, kinds)
    values (
      'f0190000-0000-4000-8000-000000000001',
      '   ',
      'https://hooks.example.com/f019-space',
      array['fire']
    )$$,
  '23514',
  null,
  'owners cannot insert ASCII-space-only webhook labels'
);
delete from public.webhook_endpoints
where url = 'https://hooks.example.com/f019-space';

select throws_ok(
  $$insert into public.webhook_endpoints (user_id, label, url, kinds)
    values (
      'f0190000-0000-4000-8000-000000000001',
      'null kind',
      'https://hooks.example.com/f019-null',
      array['fire', null]::text[]
    )$$,
  '23514',
  null,
  'owners cannot insert null webhook kinds'
);
delete from public.webhook_endpoints
where url = 'https://hooks.example.com/f019-null';

select throws_ok(
  $$insert into public.webhook_endpoints (user_id, label, url, kinds)
    values (
      'f0190000-0000-4000-8000-000000000001',
      E'\t\n',
      'https://hooks.example.com/f019-control',
      array['fire']
    )$$,
  '23514',
  null,
  'owners cannot insert control-whitespace-only webhook labels'
);
delete from public.webhook_endpoints
where url = 'https://hooks.example.com/f019-control';

select throws_ok(
  $$insert into public.webhook_endpoints (user_id, label, url, kinds)
    values (
      'f0190000-0000-4000-8000-000000000001',
      U&'\00A0\1680\2003\202F\205F\3000\FEFF',
      'https://hooks.example.com/f019-unicode',
      array['risk']
    )$$,
  '23514',
  null,
  'owners cannot insert Unicode-whitespace-only webhook labels'
);
delete from public.webhook_endpoints
where url = 'https://hooks.example.com/f019-unicode';

select throws_ok(
  $$insert into public.webhook_endpoints (user_id, label, url, kinds)
    values (
      'f0190000-0000-4000-8000-000000000001',
      repeat('x', 61),
      'https://hooks.example.com/f019-long',
      array['risk']
    )$$,
  '23514',
  null,
  'owners cannot insert webhook labels over 60 characters'
);
delete from public.webhook_endpoints
where url = 'https://hooks.example.com/f019-long';

select throws_ok(
  $$insert into public.webhook_endpoints (user_id, label, url, kinds)
    values (
      'f0190000-0000-4000-8000-000000000001',
      'empty kinds',
      'https://hooks.example.com/f019-empty',
      array[]::text[]
    )$$,
  '23514',
  null,
  'owners cannot insert endpoints with zero kinds'
);
delete from public.webhook_endpoints
where url = 'https://hooks.example.com/f019-empty';

select throws_ok(
  $$insert into public.webhook_endpoints (user_id, label, url, kinds)
    values (
      'f0190000-0000-4000-8000-000000000001',
      'unknown kind',
      'https://hooks.example.com/f019-unknown',
      array['smoke']
    )$$,
  '23514',
  null,
  'owners cannot insert unknown webhook kinds'
);
delete from public.webhook_endpoints
where url = 'https://hooks.example.com/f019-unknown';

select throws_ok(
  $$insert into public.webhook_endpoints (user_id, label, url, kinds)
    values (
      'f0190000-0000-4000-8000-000000000001',
      'duplicate kind',
      'https://hooks.example.com/f019-duplicate',
      array['fire', 'fire']
    )$$,
  '23514',
  null,
  'owners cannot insert duplicate webhook kinds'
);
delete from public.webhook_endpoints
where url = 'https://hooks.example.com/f019-duplicate';

select throws_ok(
  $$insert into public.webhook_endpoints (
      user_id, label, url, kinds, min_severity
    ) values (
      'f0190000-0000-4000-8000-000000000001',
      'low severity',
      'https://hooks.example.com/f019-low',
      array['fire'],
      0
    )$$,
  '23514',
  null,
  'owners cannot insert severity below one'
);
delete from public.webhook_endpoints
where url = 'https://hooks.example.com/f019-low';

select throws_ok(
  $$insert into public.webhook_endpoints (
      user_id, label, url, kinds, min_severity
    ) values (
      'f0190000-0000-4000-8000-000000000001',
      'high severity',
      'https://hooks.example.com/f019-high',
      array['risk'],
      6
    )$$,
  '23514',
  null,
  'owners cannot insert severity above five'
);
delete from public.webhook_endpoints
where url = 'https://hooks.example.com/f019-high';

select throws_ok(
  $$insert into public.webhook_endpoints (user_id, label, url, kinds)
    values (
      'f0190000-0000-4000-8000-000000000001',
      'private target',
      'https://127.0.0.1/f019',
      array['fire']
    )$$,
  '23514',
  null,
  'the existing static SSRF rejection remains effective'
);

select lives_ok(
  $$insert into public.webhook_endpoints (
      id, user_id, label, url, kinds, min_severity
    ) values (
      'f0211000-0000-4000-8000-000000000001',
      'f0190000-0000-4000-8000-000000000001',
      repeat('v', 60),
      'https://hooks.example.com/f019-valid',
      array['fire'],
      1
    )$$,
  'owners can insert exact lower and upper webhook boundaries'
);
select lives_ok(
  $$update public.webhook_endpoints
    set label = 'valid', kinds = array['fire', 'risk'], min_severity = 5
    where id = 'f0211000-0000-4000-8000-000000000001'$$,
  'owners can update to the other exact webhook boundaries'
);
select throws_ok(
  $$update public.webhook_endpoints
    set kinds = array['risk', 'risk']
    where id = 'f0211000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'owners cannot update an endpoint to duplicate kinds'
);
select throws_ok(
  $$update public.webhook_endpoints
    set label = U&'\00A0\2003\202F\3000'
    where id = 'f0211000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'owners cannot update an endpoint to a blank Unicode label'
);

reset role;
insert into public.webhook_endpoints (
  id, user_id, label, url, kinds, min_severity
)
values (
  'f0211000-0000-4000-8000-000000000002',
  'f0210000-0000-4000-8000-000000000002',
  'other owner',
  'https://hooks.example.com/f021-other',
  array['risk'],
  3
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f0190000-0000-4000-8000-000000000001',
  true
);
select is(
  (
    select count(*)::integer
    from public.webhook_endpoints
    where id in (
      'f0211000-0000-4000-8000-000000000001',
      'f0211000-0000-4000-8000-000000000002'
    )
  ),
  1,
  'webhook owner reads remain isolated'
);
select lives_ok(
  $$update public.webhook_endpoints set active = false
    where id = 'f0211000-0000-4000-8000-000000000002'$$,
  'cross-owner webhook updates remain filtered by RLS'
);

reset role;
select is(
  (
    select active
    from public.webhook_endpoints
    where id = 'f0211000-0000-4000-8000-000000000002'
  ),
  true,
  'a cross-owner update leaves the endpoint unchanged'
);
select ok(
  has_table_privilege('authenticated', 'public.webhook_endpoints', 'select')
  and has_table_privilege('authenticated', 'public.webhook_endpoints', 'insert')
  and has_table_privilege('authenticated', 'public.webhook_endpoints', 'update')
  and has_table_privilege('service_role', 'public.webhook_endpoints', 'select')
  and has_table_privilege('service_role', 'public.webhook_endpoints', 'update'),
  'owner management and service delivery grants remain available'
);

set local role service_role;
select results_eq(
  $$select id
    from public.webhook_endpoints
    where id = 'f0211000-0000-4000-8000-000000000001'$$,
  $$values ('f0211000-0000-4000-8000-000000000001'::uuid)$$,
  'service delivery can read a legitimate endpoint'
);
select lives_ok(
  $$update public.webhook_endpoints
    set last_status = 204, last_attempt_at = now(), last_error = null
    where id = 'f0211000-0000-4000-8000-000000000001'$$,
  'service delivery can update legitimate delivery state'
);
select throws_ok(
  $$update public.webhook_endpoints
    set min_severity = 0
    where id = 'f0211000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'service writes cannot bypass webhook integrity'
);

select * from finish();

rollback;
