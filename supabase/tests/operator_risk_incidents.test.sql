begin;

set local search_path = public, extensions;

select plan(5);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
  email, '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
from (
  values
    ('ad070000-0000-4000-8000-000000000001'::uuid, 'ad07-editor@example.invalid'),
    ('ad070000-0000-4000-8000-000000000002'::uuid, 'ad07-translator@example.invalid')
) as fixtures(id, email);

insert into public.user_roles (user_id, role) values
  ('ad070000-0000-4000-8000-000000000001', 'incident_editor'),
  ('ad070000-0000-4000-8000-000000000002', 'translator');

insert into public.official_incidents (
  id, wilaya_id, kind, status, precision, authority_tier,
  first_reported_at, last_reported_at, as_of, evidence
)
select
  'ad070000-0000-4000-8000-0000000000aa',
  (select id from public.admin_units limit 1),
  'vegetation', 'ongoing', 'commune', 'national',
  now() - interval '3 hours', now(), now(), 'bulletin'
where exists (select 1 from public.admin_units);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad070000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.operator_edit_incident(
      'ad070000-0000-4000-8000-0000000000aa', '{"status":"contained"}'::jsonb)$$,
  null, null,
  'a translator cannot edit an official incident'
);

select throws_ok(
  $$select public.operator_discard_risk_snapshot(
      'ad070000-0000-4000-8000-0000000000bb',
      current_date, now(), 'no reason given')$$,
  null, null,
  'a translator cannot discard a risk snapshot'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad070000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.operator_discard_risk_snapshot(
      'ad070000-0000-4000-8000-0000000000bb', current_date, now(), '')$$,
  null, null,
  'discarding a forecast without a reason is refused'
);

reset role;

select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'operator_publish_risk_snapshot',
       'operator_discard_risk_snapshot',
       'operator_edit_incident')
     and pg_get_functiondef(p.oid) like '%record_admin_audit%'),
  3,
  'every operator wrapper writes an audit row'
);

select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'operator_publish_risk_snapshot',
       'operator_discard_risk_snapshot',
       'operator_edit_incident')
     and pg_get_functiondef(p.oid) like '%has_any_role%'),
  3,
  'every operator wrapper checks a role'
);

select * from finish();

rollback;
