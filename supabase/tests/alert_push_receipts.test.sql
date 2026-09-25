begin;
set local search_path = public, extensions;
select plan(4);

insert into auth.users (id, email) values
  ('4d000000-0000-4000-8000-000000000001', 'member@example.invalid'),
  ('4d000000-0000-4000-8000-000000000002', 'operator@example.invalid');
insert into user_roles (user_id, role) values ('4d000000-0000-4000-8000-000000000002', 'operator');
insert into alerts (user_id, kind, severity, dedupe_key, title, body, push_state, push_received_at, created_at) values
  ('4d000000-0000-4000-8000-000000000001', 'risk', 3, 'risk:receipt-a', 't', 'b', 'sent', now(), now()),
  ('4d000000-0000-4000-8000-000000000001', 'risk', 3, 'risk:receipt-b', 't', 'b', 'sent', null, now()),
  ('4d000000-0000-4000-8000-000000000001', 'risk', 3, 'risk:receipt-c', 't', 'b', 'no_device', null, now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '4d000000-0000-4000-8000-000000000001', true);
select throws_ok($$select * from admin_push_delivery(7)$$, '42501', 'operator_role_required',
  'a member cannot read delivery totals');

select set_config('request.jwt.claim.sub', '4d000000-0000-4000-8000-000000000002', true);
select lives_ok($$select * from admin_push_delivery(7)$$, 'an operator reads delivery totals');
create temp table today as select * from admin_push_delivery(7) where day = (now() at time zone 'Africa/Algiers')::date;
select ok((select sent >= 2 and received >= 1 and no_device >= 1 from today),
  'sent, received and no-device are counted apart');
select ok((select received <= sent from today), 'a receipt is only counted for a push that was sent');

select * from finish();
rollback;
