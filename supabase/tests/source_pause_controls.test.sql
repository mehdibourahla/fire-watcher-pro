begin;
set local search_path = public, extensions;
select plan(20);
select has_function('public', 'set_source_paused', array['text','boolean'], 'source pause control exists');

insert into auth.users(id,email) values
  ('14000000-0000-4000-8000-000000000001','source-admin@example.invalid'),
  ('14000000-0000-4000-8000-000000000002','source-operator@example.invalid');
insert into public.user_roles(user_id,role) values
  ('14000000-0000-4000-8000-000000000001','admin'),
  ('14000000-0000-4000-8000-000000000002','operator');
insert into public.source_contracts (
  key,version,label,family,criticality,freshness_basis,cadence_minutes,
  warning_after_minutes,stale_after_minutes,parser_version,licence,attribution,owner
) values ('test.pause',1,'Pause fixture','reference_enrichment','optional','last_success_at',5,10,20,'1','test','test','test');
insert into public.source_checkpoints(contract_key,replay_cursor)
values ('test.pause','{"keep":"cursor"}');
select public.enqueue_due_source_jobs(now(),'database');
create temporary table preserved as select
  to_jsonb(c)-'enabled'-'updated_at' as contract,
  (select to_jsonb(p) from public.source_checkpoints p where p.contract_key=c.key) as checkpoint,
  (select count(*) from public.source_jobs j where j.contract_key=c.key) as jobs
from public.source_contracts c where key='test.pause';

set local role anon;
select throws_ok($$select public.set_source_paused('test.pause',true)$$,'42501',null,'anonymous callers cannot pause');
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.set_source_paused('test.pause',true)$$,'42501','admin_role_required','ordinary users cannot pause');
select set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.set_source_paused('test.pause',true)$$,'42501','admin_role_required','operators cannot pause');
select set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000001',true);
select throws_ok($$update public.source_contracts set enabled=false where key='test.pause'$$,'42501',null,'admins cannot bypass the audited control');
select throws_ok($$select public.set_source_paused('missing',true)$$,'P0002','source_not_found','unknown source fails explicitly');
select throws_ok($$select public.set_source_paused('test.pause',null)$$,'22004','paused_required','null cannot change the source');
select lives_ok($$select public.set_source_paused('test.pause',true)$$,'admin pauses source');
select public.set_source_paused('test.pause',true);
select is((select enabled from public.source_contracts where key='test.pause'),false,'source is paused');
select is((select count(*) from public.admin_audit where target_table='source_contracts' and target_id='test.pause' and action='source.pause'),1::bigint,'duplicate pause records one audit');
reset role;
select is((select count(*) from public.claim_source_job('pause-test','cloudflare','test.pause')),0::bigint,'paused queued job cannot be claimed');
select public.enqueue_due_source_jobs(now()+interval '5 minutes','database');
select is((select count(*) from public.source_jobs where contract_key='test.pause'),(select jobs from preserved),'paused source is not scheduled and existing job is preserved');
select is((select to_jsonb(c)-'enabled'-'updated_at' from public.source_contracts c where key='test.pause'),(select contract from preserved),'pause preserves scheduling and configuration');
select is((select to_jsonb(p) from public.source_checkpoints p where contract_key='test.pause'),(select checkpoint from preserved),'pause preserves checkpoint');
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.set_source_paused('test.pause',false)$$,'admin resumes source');
select public.set_source_paused('test.pause',false);
select is((select enabled from public.source_contracts where key='test.pause'),true,'source is resumed');
select is((select count(*) from public.admin_audit where target_table='source_contracts' and target_id='test.pause' and action='source.resume'),1::bigint,'duplicate resume records one audit');
select is((select count(*) from public.admin_audit where target_table='source_contracts' and target_id='test.pause' and actor_user_id='14000000-0000-4000-8000-000000000001' and ((action='source.pause' and before='{"enabled":true}' and after='{"enabled":false}') or (action='source.resume' and before='{"enabled":false}' and after='{"enabled":true}'))),2::bigint,'audit records actor and both state transitions');
reset role;
select is((select count(*) from public.claim_source_job('pause-test','cloudflare','test.pause')),1::bigint,'resume allows preserved queued job to execute');
select is((select to_jsonb(c)-'enabled'-'updated_at' from public.source_contracts c where key='test.pause'),(select contract from preserved),'resume preserves scheduling and configuration');
select * from finish();
rollback;
