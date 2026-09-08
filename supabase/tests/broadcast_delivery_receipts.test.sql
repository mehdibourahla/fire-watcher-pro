begin;
set local search_path = public, extensions;
select plan(11);

select ok(not has_table_privilege('anon', 'public.broadcast_delivery_receipts', 'select'), 'public cannot read destinations');
select ok(not has_table_privilege('authenticated', 'public.broadcast_delivery_receipts', 'select'), 'users cannot read destinations');
select ok(not has_table_privilege('anon', 'public.broadcast_delivery_receipts', 'insert'), 'public cannot forge receipts');
select ok(not has_table_privilege('authenticated', 'public.broadcast_delivery_receipts', 'insert'), 'users cannot forge receipts');
select ok((select relrowsecurity from pg_class where oid = 'public.broadcast_delivery_receipts'::regclass), 'RLS enabled');

insert into public.authority_warnings(id, source, received_via, body, severity, commune_codes)
values ('12000000-0000-4000-8000-000000000001', 'test', 'phone', 'test', 'Severe', '{1501}');
insert into public.broadcasts(id, kind, authority_warning_id, severity, commune_codes, push_codes)
values ('12000000-0000-4000-8000-000000000002', 'authority', '12000000-0000-4000-8000-000000000001', 'Severe', '{}', '{}');

set local role service_role;
select lives_ok($$insert into public.broadcast_delivery_receipts(broadcast_id, channel, destination)
values ('12000000-0000-4000-8000-000000000002', 'telegram', 'chat1')$$, 'sender can record success');
select lives_ok($$insert into public.broadcast_delivery_receipts(broadcast_id, channel, destination)
values ('12000000-0000-4000-8000-000000000002', 'telegram', 'chat1') on conflict do nothing$$, 'duplicate acknowledgements are idempotent');
select is((select count(*) from public.broadcast_delivery_receipts where broadcast_id = '12000000-0000-4000-8000-000000000002'), 1::bigint, 'one receipt per destination');
select lives_ok($$insert into public.broadcast_delivery_receipts(broadcast_id, channel, destination)
values ('12000000-0000-4000-8000-000000000002', 'fcm', 'chat1')$$, 'channels have independent receipts');
select throws_ok($$update public.broadcast_delivery_receipts set destination = 'other'$$, '42501', null, 'sender cannot rewrite successful delivery');
select throws_ok($$delete from public.broadcast_delivery_receipts$$, '42501', null, 'sender cannot erase successful delivery');
reset role;
select * from finish();
rollback;
