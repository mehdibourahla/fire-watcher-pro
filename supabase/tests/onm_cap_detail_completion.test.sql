begin;
set local search_path=public,extensions;
select no_plan();
select has_column('public','onm_vigilance','cap_detail_fetched_at','CAP fetch completion is independent from optional headline');
select has_index('public','onm_vigilance','onm_vigilance_pending_detail_idx','pending detail scan has an index');
set local role service_role;
insert into onm_vigilance(id,cap_id,title,event,severity,urgency,certainty,sent,area_desc,cap_url)
values('19000000-0000-4000-8000-000000000001','test.cap-completion','Original authority title','Rain','Moderate','Expected','Likely',now(),'ALGER','https://ametvigilance.meteo.dz/CAPs/fixture.xml');
select is((select count(*) from onm_vigilance where id='19000000-0000-4000-8000-000000000001' and cap_detail_fetched_at is null),1::bigint,'new CAP remains pending');
update onm_vigilance set cap_detail_fetched_at=now(),instruction_fr='Original authority instruction',polygon='[[3,36],[4,36],[3,36]]' where id='19000000-0000-4000-8000-000000000001';
select is((select count(*) from onm_vigilance where id='19000000-0000-4000-8000-000000000001' and cap_detail_fetched_at is null),0::bigint,'successful detail without headline leaves pending queue');
select is((select headline_fr from onm_vigilance where id='19000000-0000-4000-8000-000000000001'),null::text,'no fabricated headline');
select is((select title from onm_vigilance where id='19000000-0000-4000-8000-000000000001'),'Original authority title','original summary retained');
set local role authenticated;
do $$begin
  update onm_vigilance set cap_detail_fetched_at=now()+interval '1 day' where id='19000000-0000-4000-8000-000000000001';
exception when insufficient_privilege then null;
end;$$;
reset role;
select is((select cap_detail_fetched_at from onm_vigilance where id='19000000-0000-4000-8000-000000000001'),now(),'clients cannot change CAP completion metadata');
select * from finish();
rollback;
