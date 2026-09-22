begin;
set local search_path = public, extensions;
select plan(9);

insert into public.onm_vigilance(cap_id,title,event,severity,urgency,certainty,onset,expires,sent,area_desc) values
 ('sup-morning','Rain','Rain','Severe','Immediate','Observed',now(),now()+interval '6 hours',now()-interval '10 hours','A'),
 ('sup-kept','Rain','Rain','Severe','Immediate','Observed',now(),now()+interval '6 hours',now()-interval '1 hour','A'),
 ('sup-newer','Rain','Rain','Severe','Immediate','Observed',now(),now()+interval '6 hours',now(),'A'),
 ('sup-expired','Rain','Rain','Severe','Immediate','Observed',now()-interval '9 hours',now()-interval '1 hour',now()-interval '10 hours','A'),
 ('sup-open','Heat','Heat','Moderate','Immediate','Observed',null,null,now()-interval '10 hours','A');

select is(
  public.supersede_onm_absent(array['sup-kept'], now()-interval '1 hour'),
  2,
  'stamps live rows absent from the feed and older than its newest bulletin'
);
select ok((select superseded_at is not null from public.onm_vigilance where cap_id='sup-morning'),'replaced bulletin is superseded');
select ok((select superseded_at is not null from public.onm_vigilance where cap_id='sup-open'),'a warning without expiry is superseded too');
select ok((select superseded_at is null from public.onm_vigilance where cap_id='sup-kept'),'a bulletin still in the feed stays current');
select ok((select superseded_at is null from public.onm_vigilance where cap_id='sup-newer'),'a stale or replayed feed never retires a newer bulletin');
select ok((select superseded_at is null from public.onm_vigilance where cap_id='sup-expired'),'an already expired bulletin keeps its own end');
select is(public.supersede_onm_absent(array['sup-kept'], now()-interval '1 hour'),0,'a second pass stamps nothing');
select throws_ok($$select public.supersede_onm_absent(array[]::text[], now())$$,'22023',null,'an empty feed can never retire every warning');

set local role authenticated;
select throws_ok($$select public.supersede_onm_absent(array['x'], now())$$,'42501',null,'only the service role can supersede');
reset role;

select * from finish();
rollback;
