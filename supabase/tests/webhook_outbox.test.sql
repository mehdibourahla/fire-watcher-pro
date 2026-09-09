begin;
set local search_path = public, extensions;
select plan(30);
insert into auth.users(id,email) values
 ('52000000-0000-4000-8000-000000000001','webhook-owner@example.invalid'),
 ('52000000-0000-4000-8000-000000000002','webhook-other@example.invalid');
insert into public.webhook_endpoints(id,user_id,label,url,kinds,min_severity,active) values
 ('52000000-0000-4000-8000-000000000011','52000000-0000-4000-8000-000000000001','active','https://example.com',array['risk'],3,true),
 ('52000000-0000-4000-8000-000000000012','52000000-0000-4000-8000-000000000001','inactive','https://example.com',array['risk'],3,false),
 ('52000000-0000-4000-8000-000000000013','52000000-0000-4000-8000-000000000002','other','https://example.com',array['risk'],3,true);
insert into public.alerts(id,user_id,kind,severity,dedupe_key,title,body) values
 ('52000000-0000-4000-8000-000000000021','52000000-0000-4000-8000-000000000001','risk',4,'outbox-risk','Fixture','Fixture'),
 ('52000000-0000-4000-8000-000000000022','52000000-0000-4000-8000-000000000001','fire',4,'outbox-fire','Fixture','Fixture'),
 ('52000000-0000-4000-8000-000000000023','52000000-0000-4000-8000-000000000001','risk',2,'outbox-low','Fixture','Fixture');
select is((select count(*) from public.webhook_outbox where user_id='52000000-0000-4000-8000-000000000001'),1::bigint,'alert transaction creates only matching active owned delivery');
set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.webhook_outbox),0::bigint,'another owner cannot read the payload');
select throws_ok($$select public.record_admin_audit('people','role.grant','user_roles')$$,'42501',null,'ordinary users cannot fabricate audit entries');
select throws_ok($$select public.claim_webhook_delivery()$$,'42501',null,'ordinary users cannot claim deliveries');
select throws_ok($$select public.finish_webhook_delivery(gen_random_uuid(),gen_random_uuid(),200,null)$$,'42501',null,'ordinary users cannot forge receipts');
select set_config('request.jwt.claim.sub','52000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.webhook_outbox),1::bigint,'owner sees queued delivery');
select throws_ok($$update public.webhook_outbox set state='sent'$$,'42501',null,'owner cannot rewrite queue');
reset role;
insert into public.user_roles(user_id,role) values ('52000000-0000-4000-8000-000000000001','admin');
insert into public.source_contracts(key,version,label,family,criticality,freshness_basis,cadence_minutes,warning_after_minutes,stale_after_minutes,parser_version,licence,attribution,owner)
 values ('test.audit.outbox',1,'Audit fixture','reference_enrichment','optional','last_success_at',5,10,20,'1','test','test','test');
set local role authenticated;
select throws_ok($$select public.record_admin_audit('people','role.grant','user_roles')$$,'42501',null,'admins cannot fabricate audit directly either');
select lives_ok($$select public.set_source_paused('test.audit.outbox',true)$$,'legitimate authorized operation still succeeds');
select public.set_source_paused('test.audit.outbox',true);
select is((select count(*) from public.admin_audit where target_id='test.audit.outbox' and action='source.pause'),1::bigint,'legitimate operation is audited exactly once');
reset role;
update public.webhook_outbox set available_at = now() - interval '100 years' where user_id='52000000-0000-4000-8000-000000000001';
create temporary table claimed as select * from public.claim_webhook_delivery();
select is((select payload->>'event_id' from claimed),(select id::text from claimed),'payload carries stable event id');
select is((select count(*) from public.claim_webhook_delivery() where id in(select id from claimed)),0::bigint,'second claimant cannot claim active lease');
select is(public.finish_webhook_delivery((select id from claimed),gen_random_uuid(),200,null),false,'wrong lease cannot write receipt');
select is(public.finish_webhook_delivery((select id from claimed),(select lease_token from claimed),503,'http_503'),true,'failed delivery persists receipt');
select is((select state from public.webhook_outbox where id=(select id from claimed)),'pending','failure returns to pending');
select is((select delivered_webhook from public.alerts where id='52000000-0000-4000-8000-000000000021'),false,'failed receipt cannot claim delivery');
update public.webhook_outbox set available_at=now()-interval '100 years' where id=(select id from claimed);
create temporary table retried as select * from public.claim_webhook_delivery();
select isnt((select lease_token from claimed),(select lease_token from retried),'retry gets fresh fence');
select is((select payload from claimed),(select payload from retried),'retry payload and event id remain identical');
select is(public.finish_webhook_delivery((select id from claimed),(select lease_token from claimed),200,null),false,'stale claimant cannot overwrite retry');
create function pg_temp.fail_webhook_receipt() returns trigger language plpgsql as $$ begin raise exception 'receipt_unavailable'; end; $$;
create trigger test_receipt_failure before insert on public.webhook_deliveries for each row execute function pg_temp.fail_webhook_receipt();
select throws_ok($$select public.finish_webhook_delivery((select id from retried),(select lease_token from retried),204,null)$$,'P0001','receipt_unavailable','receipt write failure is propagated');
select is((select state from public.webhook_outbox where id=(select id from retried)),'leased','receipt failure preserves recoverable lease');
select is((select delivered_webhook from public.alerts where id='52000000-0000-4000-8000-000000000021'),false,'receipt failure never marks the alert delivered');
drop trigger test_receipt_failure on public.webhook_deliveries;
select is(public.finish_webhook_delivery((select id from retried),(select lease_token from retried),204,null),true,'retry records success');
select is((select delivered_webhook from public.alerts where id='52000000-0000-4000-8000-000000000021'),true,'durable receipt marks delivery');
select is(public.finish_webhook_delivery((select id from retried),(select lease_token from retried),204,null),false,'duplicate finish is fenced');
select is((select count(*) from public.webhook_deliveries where alert_id='52000000-0000-4000-8000-000000000021'),2::bigint,'exactly one receipt per accepted attempt');
insert into public.alerts(id,user_id,kind,severity,dedupe_key,title,body) values
 ('52000000-0000-4000-8000-000000000024','52000000-0000-4000-8000-000000000001','risk',4,'outbox-cancel','Fixture','Fixture');
update public.webhook_endpoints set active=false where id='52000000-0000-4000-8000-000000000011';
select count(*) from public.claim_webhook_delivery();
select is((select state from public.webhook_outbox where alert_id='52000000-0000-4000-8000-000000000024'),'cancelled','deactivated endpoints are cancelled before sending');
update public.webhook_endpoints set active=true where id='52000000-0000-4000-8000-000000000011';
insert into public.alerts(id,user_id,kind,severity,dedupe_key,title,body) values
 ('52000000-0000-4000-8000-000000000025','52000000-0000-4000-8000-000000000001','risk',4,'outbox-expired','Fixture','Fixture');
update public.webhook_outbox set state='leased',lease_token=gen_random_uuid(),lease_until=now()-interval '1 second',available_at=now()-interval '100 years',attempts=1 where alert_id='52000000-0000-4000-8000-000000000025';
create temporary table recovered as select * from public.claim_webhook_delivery();
select is((select attempts from public.webhook_outbox where id=(select id from recovered)),2,'expired lease is recovered after a lost worker');
update public.webhook_outbox set attempts=8 where id=(select id from recovered);
select is(public.finish_webhook_delivery((select id from recovered),(select lease_token from recovered),500,'http_500'),true,'last failed attempt persists');
select is((select state from public.webhook_outbox where id=(select id from recovered)),'dead','retry exhaustion remains visible instead of looping forever');
select * from finish();
rollback;
