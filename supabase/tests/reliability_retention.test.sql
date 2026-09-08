begin;
set local search_path=public,extensions;
select plan(15);
insert into public.source_contracts(key,version,label,family,criticality,freshness_basis,cadence_minutes,warning_after_minutes,stale_after_minutes,parser_version,licence,attribution,owner)
values('test.retention',1,'Retention fixture','reference_enrichment','optional','last_success_at',5,10,20,'1','test','test','test');
select has_table('public','source_run_retired_keys','retired idempotency keys are preserved');
select ok(not has_function_privilege('authenticated','public.prune_reliability_history()','execute'),'users cannot purge evidence');
insert into public.source_runs(id,contract_key,contract_version,trigger_kind,idempotency_key,scheduled_for,started_at,finished_at,outcome,records_seen)
values
('18000000-0000-4000-8000-000000000001','test.retention',1,'manual','retention-fixture-old',now()-interval '182 days',now()-interval '182 days',now()-interval '181 days','succeeded',7),
('18000000-0000-4000-8000-000000000002','test.retention',1,'manual','retention-fixture-new',now(),now(),now(),'succeeded',3),
('18000000-0000-4000-8000-000000000003','test.retention',1,'manual','retention-fixture-referenced',now()-interval '182 days',now()-interval '182 days',now()-interval '181 days','succeeded',9),
('18000000-0000-4000-8000-000000000004','test.retention',1,'manual','retention-fixture-running',now()-interval '182 days',now()-interval '182 days',null,'running',0);
insert into public.source_gaps(contract_key,data_from,data_through,state,resolved_by_run_id)
values('test.retention',now()-interval '183 days',now()-interval '182 days','resolved','18000000-0000-4000-8000-000000000003');
insert into public.operational_incidents(id,contract_key,reason_code,first_seen_at,last_seen_at,resolved_at)
values ('18000000-0000-4000-8000-000000000005','retention-fixture','old',now()-interval '182 days',now()-interval '181 days',now()-interval '181 days'),
('18000000-0000-4000-8000-000000000006','retention-fixture','open',now()-interval '182 days',now()-interval '181 days',null);
select public.prune_reliability_history();
select is((select count(*) from public.source_runs where id='18000000-0000-4000-8000-000000000001'),0::bigint,'old terminal run removed');
select is((select count(*) from public.source_runs where id in ('18000000-0000-4000-8000-000000000002','18000000-0000-4000-8000-000000000003','18000000-0000-4000-8000-000000000004')),3::bigint,'recent, referenced and running evidence remains');
select is((select count(*) from public.source_run_retired_keys where idempotency_key='retention-fixture-old'),1::bigint,'replay key retained');
select is((select runs from public.source_run_archive_daily where contract_key='test.retention' and day=(now()-interval '182 days')::date and outcome='succeeded'),1::bigint,'daily run count preserved');
select is((select records_seen from public.source_run_archive_daily where contract_key='test.retention' and day=(now()-interval '182 days')::date and outcome='succeeded'),7::bigint,'daily record count preserved');
select is((select count(*) from public.operational_incidents where id='18000000-0000-4000-8000-000000000006'),1::bigint,'open incident never pruned');
select is((select incidents from public.incident_archive_daily where contract_key='retention-fixture' and reason_code='old'),1::bigint,'resolved incident aggregate preserved');
select public.prune_reliability_history();
select is((select runs from public.source_run_archive_daily where contract_key='test.retention' and day=(now()-interval '182 days')::date and outcome='succeeded'),1::bigint,'repeat maintenance never double counts');
select throws_ok($$insert into public.source_runs(contract_key,contract_version,trigger_kind,idempotency_key,scheduled_for,started_at,outcome) values('test.retention',1,'manual','retention-fixture-old',now(),now(),'running')$$,'23514','retired_source_run_key','retired idempotency key cannot be reused');
select ok(not has_table_privilege('anon','public.source_run_archive_daily','select'),'archived history remains private');
insert into public.source_runs(contract_key,contract_version,trigger_kind,scheduled_for,started_at,finished_at,outcome,records_seen)
select 'test.retention',1,'manual',now()-interval '184 days',now()-interval '184 days',now()-interval '183 days','succeeded',1 from generate_series(1,5001);
select public.prune_reliability_history();
select is((select count(*) from public.source_runs where contract_key='test.retention' and finished_at<now()-interval '182 days'),1::bigint,'maintenance stops at 5000 runs');
select is((select runs from public.source_run_archive_daily where contract_key='test.retention' and day=(now()-interval '184 days')::date),5000::bigint,'bounded batch aggregates exactly once');
select public.prune_reliability_history();
select is((select runs from public.source_run_archive_daily where contract_key='test.retention' and day=(now()-interval '184 days')::date),5001::bigint,'next batch adds only remaining run');
select * from finish();
rollback;
