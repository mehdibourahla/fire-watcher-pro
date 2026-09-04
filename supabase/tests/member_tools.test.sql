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
    ('ad100000-0000-4000-8000-000000000001'::uuid, 'ad10-admin@example.invalid'),
    ('ad100000-0000-4000-8000-000000000002'::uuid, 'ad10-member@example.invalid')
) as fixtures(id, email);

insert into public.user_roles (user_id, role)
values ('ad100000-0000-4000-8000-000000000001', 'admin');

insert into public.zones (user_id, name, lat, lon, radius_km)
values
  ('ad100000-0000-4000-8000-000000000002', 'Home', 36.7, 4.0, 10),
  ('ad100000-0000-4000-8000-000000000002', 'Family', 36.5, 4.2, 5);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad100000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.member_detail_for_admin('ad100000-0000-4000-8000-000000000002')$$,
  null, null,
  'a member cannot read anyone detail, including their own'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad100000-0000-4000-8000-000000000001', true);

select is(
  (select zone_count from public.list_members_for_admin()
   where id = 'ad100000-0000-4000-8000-000000000002'),
  2,
  'the list carries each member watch-zone count'
);

select is(
  (select report_count from public.list_members_for_admin()
   where id = 'ad100000-0000-4000-8000-000000000002'),
  0,
  'a member who filed nothing reports zero, not null'
);

select is(
  jsonb_array_length(
    public.member_detail_for_admin('ad100000-0000-4000-8000-000000000002') -> 'zones'),
  2,
  'the detail lists the zones themselves, so an operator can see what was watched'
);

select is(
  public.member_detail_for_admin('ad100000-0000-4000-8000-000000000002') ->> 'has_phone',
  'false',
  'the detail reports whether a phone exists without exposing the number'
);

select throws_ok(
  $$select public.member_detail_for_admin('ad100000-0000-4000-8000-0000000000ff')$$,
  null, null,
  'an unknown member is refused rather than returning an empty shell'
);

reset role;

select * from finish();

rollback;
