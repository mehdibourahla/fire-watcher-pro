begin;
set local search_path = public, extensions;
select plan(6);

insert into public.onm_vigilance(cap_id,title,event,severity,urgency,certainty,onset,expires,sent,area_desc) values
 ('key-first','Rain','Rain','Moderate','Expected','Likely',now(),now()+interval '6 hours',now()-interval '2 hours','KEYTEST'),
 ('key-renewal','Rain','Rain','Moderate','Expected','Likely',now()+interval '3 hours',now()+interval '9 hours',now()-interval '1 hour','KEYTEST'),
 ('key-raised','Rain','Rain','Severe','Expected','Likely',now()+interval '4 hours',now()+interval '10 hours',now(),'KEYTEST'),
 ('key-lowered','Rain','Rain','Moderate','Expected','Likely',now()+interval '5 hours',now()+interval '11 hours',now(),'KEYTEST'),
 ('key-later','Rain','Rain','Moderate','Expected','Likely',now()+interval '20 hours',now()+interval '26 hours',now(),'KEYTEST'),
 ('key-wind','Wind','Wind','Moderate','Expected','Likely',now(),now()+interval '6 hours',now(),'KEYTEST');

create temp table keys as
  select v.cap_id, k.alert_key
  from public.onm_alert_keys(array(select id from public.onm_vigilance where area_desc = 'KEYTEST')) k
  join public.onm_vigilance v on v.id = k.warning_id;

select is((select alert_key from keys where cap_id = 'key-renewal'), (select alert_key from keys where cap_id = 'key-first'),
  'a renewal with a later onset keeps the episode key, so it stays silent');
select isnt((select alert_key from keys where cap_id = 'key-raised'), (select alert_key from keys where cap_id = 'key-first'),
  'a raised severity inside the episode alerts again');
select is((select alert_key from keys where cap_id = 'key-lowered'), (select alert_key from keys where cap_id = 'key-raised'),
  'a lowered severity does not alert again');
select isnt((select alert_key from keys where cap_id = 'key-later'), (select alert_key from keys where cap_id = 'key-first'),
  'a warning after a gap opens a new episode');
select isnt((select alert_key from keys where cap_id = 'key-wind'), (select alert_key from keys where cap_id = 'key-first'),
  'another event is another episode');

set local role authenticated;
select throws_ok($$select * from public.onm_alert_keys(array[]::uuid[])$$, '42501', null,
  'only the alert engine reads episode keys');

select * from finish();
rollback;
