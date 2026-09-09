begin;
set local search_path=public,extensions;
select plan(6);
insert into auth.users(id,email) values
 ('acdd0000-0000-4000-8000-000000000001','delete-a@example.invalid'),
 ('acdd0000-0000-4000-8000-000000000002','delete-b@example.invalid');
insert into public.admin_audit(id,actor_kind,actor_user_id,domain,action,target_table,before,after,reason)
values('acdd0000-0000-4000-8000-000000000003','user','acdd0000-0000-4000-8000-000000000001','people','test.delete','profiles','{}','{}','personal note');
insert into public.citizen_reports(id,user_id,lat,lon,reviewed_by)
values('acdd0000-0000-4000-8000-000000000004','acdd0000-0000-4000-8000-000000000002',36,3,'acdd0000-0000-4000-8000-000000000001');
insert into public.zones(user_id,name,lat,lon,radius_km)
values('acdd0000-0000-4000-8000-000000000001','Delete test',36,3,5);
select lives_ok($$delete from auth.users where id='acdd0000-0000-4000-8000-000000000001'$$,'Account with an audit history and moderation references can be deleted');
select is((select count(*)::integer from public.profiles where id='acdd0000-0000-4000-8000-000000000001'),0,'Profile cascades');
select is((select count(*)::integer from public.zones where user_id='acdd0000-0000-4000-8000-000000000001'),0,'Zones cascade');
select ok((select reviewed_by is null from public.citizen_reports where id='acdd0000-0000-4000-8000-000000000004'),'Other user report survives without the deleted reviewer');
select ok((select actor_user_id is null and actor_kind='system' and before is null and after is null and reason is null from public.admin_audit where id='acdd0000-0000-4000-8000-000000000003'),'Audit metadata survives without actor details');
select ok(not has_function_privilege('authenticated','public.anonymize_deleted_account_audit()','EXECUTE'),'Account anonymization cannot be invoked directly');
select * from finish();
rollback;
