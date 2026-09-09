begin;
set local search_path=public,extensions;
select no_plan();
select has_table('public','source_captures','capture catalog exists');
select is((select public from storage.buckets where id='source-archive'),false,'archive bucket is private');
insert into auth.users(id,email) values
 ('16000000-0000-4000-8000-000000000001','archive-admin@example.invalid'),
 ('16000000-0000-4000-8000-000000000002','archive-operator@example.invalid');
insert into user_roles(user_id,role) values
 ('16000000-0000-4000-8000-000000000001','admin'),
 ('16000000-0000-4000-8000-000000000002','operator');
insert into source_captures(source_key,endpoint,source_origin,requested_at,fetched_at,status,http_status,sha256,storage_path,byte_length)
 values('ita_website','feed','https://example.org',now(),now(),'captured',200,repeat('a',64),'sha256/aa/'||repeat('a',64),4);
insert into storage.objects(bucket_id,name) values('source-archive','sha256/aa/'||repeat('a',64));
set local role anon;
select throws_ok($$select * from source_captures$$,'42501',null,'anonymous cannot read catalog');
select is((select count(*) from storage.objects where bucket_id='source-archive'),0::bigint,'anonymous cannot download archive');
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000003',true);
select is((select count(*) from source_captures),0::bigint,'ordinary user cannot read catalog');
select set_config('request.jwt.claims','{"user_metadata":{"role":"admin"}}',true);
select is((select count(*) from source_captures),0::bigint,'forged metadata does not grant access');
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000002',true);
select is((select count(*) from source_captures),0::bigint,'operator cannot read catalog');
select is((select count(*) from storage.objects where bucket_id='source-archive'),0::bigint,'operator cannot download archive');
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000001',true);
select is((select count(*) from source_captures where sha256=repeat('a',64)),1::bigint,'admin can read catalog fixture');
select is((select count(*) from storage.objects where bucket_id='source-archive' and name='sha256/aa/'||repeat('a',64)),1::bigint,'admin can download archive fixture');
select throws_ok($$insert into source_captures default values$$,'42501',null,'admin cannot insert catalog');
select throws_ok($$update source_captures set endpoint='changed'$$,'42501',null,'admin cannot update catalog');
select throws_ok($$delete from source_captures$$,'42501',null,'admin cannot delete catalog');
select throws_ok($$insert into storage.objects(bucket_id,name) values('source-archive','new')$$,'42501',null,'admin cannot upload archive');
set local storage.allow_delete_query='true';
with deleted as (delete from storage.objects where bucket_id='source-archive' returning id)
select is((select count(*) from deleted),0::bigint,'admin cannot delete payload');
reset role;
set local role service_role;
select lives_ok($$insert into source_captures(source_key,endpoint,source_origin,requested_at,fetched_at,status,error_code,job_id,attempt,contract_version)
 values('onm','feed','https://example.org',now(),now(),'failed','network_error',gen_random_uuid(),1,1)$$,'service inserts capture with independent job provenance');
select throws_ok($$update source_captures set endpoint='changed'$$,'42501',null,'service cannot update capture');
select throws_ok($$delete from source_captures$$,'42501',null,'service cannot delete capture');
select throws_ok($$insert into source_captures(source_key,endpoint,source_origin,requested_at,fetched_at,status,http_status,sha256,byte_length)
 values('onm','feed','https://example.org',now(),now(),'captured',200,repeat('b',64),4)$$,'23514',null,'successful capture requires a payload path');
select throws_ok($$insert into source_captures(source_key,endpoint,source_origin,requested_at,fetched_at,status,http_status,sha256,storage_path,byte_length)
 values('onm','feed','https://example.org',now(),now(),'captured',200,repeat('b',64),'sha256/bb/'||repeat('c',64),4)$$,'23514',null,'payload path must match checksum');
select throws_ok($$insert into source_captures(source_key,endpoint,source_origin,requested_at,fetched_at,status,http_status)
 values('onm','feed','https://example.org',now(),now(),'not_modified',304)$$,'23514',null,'304 requires explicit zero byte length');
select ok((select bool_and(recorded_at is not null) from source_captures),'database records insertion time');
select * from finish();
rollback;
