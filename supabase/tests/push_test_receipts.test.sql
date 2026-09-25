begin;
set local search_path = public, extensions;
select plan(4);

insert into auth.users (id, email) values
  ('23000000-0000-4000-8000-000000000001', 'push-admin@example.invalid'),
  ('23000000-0000-4000-8000-000000000002', 'push-other@example.invalid');
insert into public.push_test_receipts (id, user_id) values
  ('23000000-0000-4000-8000-000000000011', '23000000-0000-4000-8000-000000000001'),
  ('23000000-0000-4000-8000-000000000012', '23000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"23000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select array_agg(id) from public.push_test_receipts), array['23000000-0000-4000-8000-000000000011'::uuid],
  'an admin sees only their own test');
select throws_ok($$update public.push_test_receipts set received_at = now()$$, '42501', null,
  'a browser cannot claim its own receipt');
reset role;

set local role service_role;
select throws_ok($$update public.push_test_receipts set user_id = '23000000-0000-4000-8000-000000000002'$$, '42501', null,
  'the server can mark arrival, never reassign a test');
reset role;
set local role anon;
select throws_ok($$select count(*) from public.push_test_receipts$$, '42501', null, 'visitors cannot read push tests');
reset role;

select * from finish();
rollback;
