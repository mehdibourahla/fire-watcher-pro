begin;
set local search_path=public,extensions;
select no_plan();
select has_function('public','write_text_source',array['text','text','jsonb','uuid','integer'],'source writes are fenced');
insert into public.source_contracts(key,version,label,family,criticality,freshness_basis,cadence_minutes,warning_after_minutes,stale_after_minutes,parser_version,licence,attribution,owner)
values('test.dgpc-recovery',1,'test','official_text','optional','last_success_at',15,30,60,'test','test','test','test');
insert into public.source_checkpoints(contract_key) values('test.dgpc-recovery');
insert into public.text_sources(id,key,label,kind,url,authority_tier)
values('17000000-0000-4000-8000-000000000001','test.dgpc-recovery','test','telegram_public','https://t.me/s/DGPCDZ','national');
insert into public.admin_units(id,level,code,name_ar,name_fr,name_en,lat,lon) values
('17000000-0000-4000-8000-000000000002','wilaya','R21','سكيكدة','Skikda','Skikda',36.8,6.9),
('17000000-0000-4000-8000-000000000003','commune','R2115','عزابة','Azzaba','Azzaba',36.7,7.1);
set local role service_role;
select set_config('test.recovery.document', (public.write_text_source('test.dgpc-recovery','documents',
'[{"text_source_id":"17000000-0000-4000-8000-000000000001","external_id":"DGPCDZ/recovery","url":"https://t.me/DGPCDZ/recovery","published_at":"2026-09-09T08:00:00Z","content_hash":"fixture","body":"حريق ببلدية عزابة"}]')->0->>'id'),true);
select is((select attempts from document_extractions where document_id=current_setting('test.recovery.document')::uuid),0,'document insert atomically creates unfinished work');
select is(jsonb_array_length(public.write_text_source('test.dgpc-recovery','documents',
'[{"text_source_id":"17000000-0000-4000-8000-000000000001","external_id":"DGPCDZ/recovery","url":"https://t.me/DGPCDZ/recovery","published_at":"2026-09-09T08:00:00Z","content_hash":"fixture","body":"حريق ببلدية عزابة"}]')),0,'replayed document does not duplicate evidence');
select set_config('test.recovery.mentions',jsonb_build_array(jsonb_build_object('document_id',current_setting('test.recovery.document'),'text_source_id','17000000-0000-4000-8000-000000000001','wilaya_id','17000000-0000-4000-8000-000000000002','commune_id','17000000-0000-4000-8000-000000000003','kind','vegetation','status','ongoing','fire_count',1,'as_of','2026-09-09T08:00:00Z','precision','commune','evidence','حريق ببلدية عزابة','extractor','llm'))::text,true);
select set_config('test.recovery.response',public.write_text_source('test.dgpc-recovery','mentions',current_setting('test.recovery.mentions')::jsonb)::text,true);
select set_config('test.recovery.mention',current_setting('test.recovery.response')::jsonb->0->>'id',true);
select is(current_setting('test.recovery.response')::jsonb->0->>'inserted','true','first interpretation counts a newly inserted mention');
select is(public.write_text_source('test.dgpc-recovery','mentions',current_setting('test.recovery.mentions')::jsonb)->0->>'id',current_setting('test.recovery.mention'),'replayed interpretation returns same mention');
select is(public.write_text_source('test.dgpc-recovery','mentions',current_setting('test.recovery.mentions')::jsonb)->0->>'inserted','false','reused mention is not reported as newly inserted');
select is(public.write_text_source('test.dgpc-recovery','mentions',jsonb_set(current_setting('test.recovery.mentions')::jsonb,'{0,evidence}','"different grounded excerpt"'))->0->>'id',current_setting('test.recovery.mention'),'changed evidence excerpt on retry cannot duplicate same document and area');
select set_config('test.recovery.application',jsonb_build_object('mentionId',current_setting('test.recovery.mention'),'insert',jsonb_build_object('wilaya_id','17000000-0000-4000-8000-000000000002','commune_id','17000000-0000-4000-8000-000000000003','kind','vegetation','status','ongoing','precision','commune','authority_tier','national','first_reported_at','2026-09-09T08:00:00Z','last_reported_at','2026-09-09T08:00:00Z','as_of','2026-09-09T08:00:00Z','latest_mention_id',current_setting('test.recovery.mention'),'evidence','حريق ببلدية عزابة'))::text,true);
select is(public.write_text_source('test.dgpc-recovery','apply_mention',current_setting('test.recovery.application')::jsonb)->>'applied','true','first application creates and attaches incident');
select is(public.write_text_source('test.dgpc-recovery','apply_mention',current_setting('test.recovery.application')::jsonb)->>'applied','false','replay after interrupted acknowledgement has no second side effect');
select is((select count(*) from official_incidents where commune_id='17000000-0000-4000-8000-000000000003'),1::bigint,'single incident after replay');
select is((select mention_count from official_incidents where commune_id='17000000-0000-4000-8000-000000000003'),1,'mention counted once');
reset role;
update official_incidents set status='extinguished',as_of='2026-09-09T10:00:00Z',last_reported_at='2026-09-09T10:00:00Z',unlisted_at='2026-09-09T10:00:00Z' where commune_id='17000000-0000-4000-8000-000000000003';
set local role service_role;
select set_config('test.recovery.extra_doc',(public.write_text_source('test.dgpc-recovery','documents','[{"text_source_id":"17000000-0000-4000-8000-000000000001","external_id":"DGPCDZ/historical","url":"https://t.me/DGPCDZ/historical","published_at":"2026-09-09T09:00:00Z","content_hash":"historical","body":"fixture"}]')->0->>'id'),true);
select set_config('test.recovery.extra_mention',(public.write_text_source('test.dgpc-recovery','mentions',jsonb_set(jsonb_set(current_setting('test.recovery.mentions')::jsonb,'{0,document_id}',to_jsonb(current_setting('test.recovery.extra_doc'))),'{0,as_of}','"2026-09-09T09:00:00Z"'))->0->>'id'),true);
select public.write_text_source('test.dgpc-recovery','apply_mention',jsonb_build_object('mentionId',current_setting('test.recovery.extra_mention'),'incidentId',(select id from official_incidents where commune_id='17000000-0000-4000-8000-000000000003'),'update',jsonb_build_object('status','ongoing','as_of','2026-09-09T09:00:00Z','last_reported_at','2026-09-09T09:00:00Z','unlisted_at',null)));
select is((select unlisted_at from official_incidents where commune_id='17000000-0000-4000-8000-000000000003'),'2026-09-09T10:00:00Z'::timestamptz,'historical mention cannot undo newer absence');
select is((select status from official_incidents where commune_id='17000000-0000-4000-8000-000000000003'),'extinguished','historical mention cannot reopen extinguished status');
select is((select as_of from official_incidents where commune_id='17000000-0000-4000-8000-000000000003'),'2026-09-09T10:00:00Z'::timestamptz,'historical patch cannot regress state time');
select set_config('test.recovery.extra_doc',(public.write_text_source('test.dgpc-recovery','documents','[{"text_source_id":"17000000-0000-4000-8000-000000000001","external_id":"DGPCDZ/newer","url":"https://t.me/DGPCDZ/newer","published_at":"2026-09-09T11:00:00Z","content_hash":"newer","body":"fixture"}]')->0->>'id'),true);
select set_config('test.recovery.extra_mention',(public.write_text_source('test.dgpc-recovery','mentions',jsonb_set(jsonb_set(current_setting('test.recovery.mentions')::jsonb,'{0,document_id}',to_jsonb(current_setting('test.recovery.extra_doc'))),'{0,as_of}','"2026-09-09T11:00:00Z"'))->0->>'id'),true);
select public.write_text_source('test.dgpc-recovery','apply_mention',jsonb_build_object('mentionId',current_setting('test.recovery.extra_mention'),'incidentId',(select id from official_incidents where commune_id='17000000-0000-4000-8000-000000000003'),'update',jsonb_build_object('status','ongoing','as_of','2026-09-09T11:00:00Z','last_reported_at','2026-09-09T11:00:00Z','unlisted_at',null)));
select is((select unlisted_at from official_incidents where commune_id='17000000-0000-4000-8000-000000000003'),null::timestamptz,'newer mention relists incident');
select is((select status from official_incidents where commune_id='17000000-0000-4000-8000-000000000003'),'ongoing','newer mention updates incident state');
reset role;
select public.enqueue_due_source_jobs(now(),'database');
select set_config('test.recovery.job',id::text,true),set_config('test.recovery.attempt',attempt_count::text,true)
from public.claim_source_job('source-recovery-test','cloudflare','test.dgpc-recovery');
set local role service_role;
select throws_ok($$select public.write_text_source('test.dgpc-recovery','complete',jsonb_build_object('documentId',current_setting('test.recovery.document')),current_setting('test.recovery.job')::uuid,99)$$,'55000','text_source_lease_lost','wrong lease attempt cannot complete work');
select throws_ok($$select public.write_text_source('test.dgpc-recovery','complete',jsonb_build_object('documentId',current_setting('test.recovery.document')))$$,'55000','text_source_lease_required','contextless writer cannot bypass active lease');
reset role;
update source_job_leases set leased_at=clock_timestamp()-interval '1 hour',lease_expires_at=clock_timestamp()-interval '1 second' where contract_key='test.dgpc-recovery';
set local role service_role;
select throws_ok($$select public.write_text_source('test.dgpc-recovery','complete',jsonb_build_object('documentId',current_setting('test.recovery.document')),current_setting('test.recovery.job')::uuid,current_setting('test.recovery.attempt')::integer)$$,'55000','text_source_lease_lost','expired worker cannot clear unfinished work');
select is((select count(*) from document_extractions where document_id=current_setting('test.recovery.document')::uuid),1::bigint,'unfinished work survives stale worker');
reset role;
insert into auth.users(id,email) values('17000000-0000-4000-8000-000000000004','source-recovery-admin@example.invalid');
insert into user_roles(user_id,role) values('17000000-0000-4000-8000-000000000004','admin');
insert into ita_reports(id,source_post_id,source_page,source_url,published_at,content_hash,body,raw,extraction_attempts,extraction_error)
values('17000000-0000-4000-8000-000000000005','fixture','traficalg','https://www.facebook.com/traficalg',now(),repeat('a',64),'fixture','{}',5,'provider failed');
set local role anon;
select throws_ok($$select public.retry_ita_report('17000000-0000-4000-8000-000000000005')$$,'42501',null,'anonymous retry denied');
set local role authenticated;
select throws_ok($$select public.write_text_source('test.dgpc-recovery','documents','[]')$$,'42501',null,'authenticated source writes denied');
select set_config('request.jwt.claim.sub','17000000-0000-4000-8000-000000000006',true);
select throws_ok($$select public.retry_ita_report('17000000-0000-4000-8000-000000000005')$$,'42501','admin_role_required','ordinary-user retry denied');
select set_config('request.jwt.claim.sub','17000000-0000-4000-8000-000000000004',true);
select lives_ok($$select public.retry_ita_report('17000000-0000-4000-8000-000000000005')$$,'admin requeues exhausted work');
select is((select extraction_attempts from ita_reports where id='17000000-0000-4000-8000-000000000005'),0,'retry budget reset');
select is((select count(*) from admin_audit where action='ita.retry' and target_id='17000000-0000-4000-8000-000000000005'),1::bigint,'retry creates one truthful audit');
reset role;
update ita_reports set extraction_attempts=5 where id='17000000-0000-4000-8000-000000000005';
set local role authenticated;
select throws_ok($$select public.retry_ita_report('17000000-0000-4000-8000-000000000005')$$,'55000','ita_retry_cooldown','repeated exhausted recovery is bounded');
select * from finish();
rollback;
