begin;
set local search_path = public, extensions;
select no_plan();
delete from public.broadcast_delivery_queue;
update public.broadcast_settings set enabled=true;
update public.delivery_channel_settings set paused=false;

insert into public.onm_vigilance(id,cap_id,title,event,severity,urgency,certainty,sent,onset,expires,area_desc)
select ('94000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'delivery-validity-'||n,'Test','Rain','Severe','Immediate','Observed',
  now()-interval '2 hours',now()-interval '1 hour',
  case n when 1 then now()+interval '1 hour' when 2 then now()-interval '1 minute'
    when 3 then null when 4 then now()+interval '48 hours' else now()+interval '2 hours' end,'Test'
from generate_series(1,6) n;
insert into public.broadcasts(id,kind,onm_vigilance_id,severity,commune_codes,push_codes)
select ('95000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'onm',
  ('94000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Severe','{1501}','{1501}'
from generate_series(1,6) n;
select is((select count(*) from broadcast_delivery_queue where broadcast_id='95000000-0000-4000-8000-000000000001' and expires_at=now()+interval '1 hour'),2::bigint,'both channel deadlines respect explicit expiry');
select is((select min(expires_at) from broadcast_delivery_queue where broadcast_id='95000000-0000-4000-8000-000000000003'),now()+interval '23 hours','null expiry uses onset plus 24 hours');
select is((select min(expires_at) from broadcast_delivery_queue where broadcast_id='95000000-0000-4000-8000-000000000004'),now()+interval '24 hours','source validity cannot extend delivery retry window');
create temporary table claims as select 'fcm'::text channel,job from claim_broadcast_delivery('fcm',100);
insert into claims select 'telegram',job from claim_broadcast_delivery('telegram',100);
select is((select count(*) from claims where job->>'id'='95000000-0000-4000-8000-000000000002'),0::bigint,'expired ONM cannot be claimed on either channel');
select is((select count(*) from claims where job->>'id'='95000000-0000-4000-8000-000000000001'),2::bigint,'valid ONM can be claimed independently');
insert into broadcast_delivery_receipts(broadcast_id,channel,destination) values ('95000000-0000-4000-8000-000000000001','fcm','test-topic');
update onm_vigilance set expires=now()-interval '1 minute' where id='94000000-0000-4000-8000-000000000001';
select is((select count(*) from claims where job->>'id'='95000000-0000-4000-8000-000000000001' and renew_broadcast_delivery((job->>'id')::uuid,channel,(job->>'lease_token')::uuid)),0::bigint,'shortened validity blocks renewal of both active leases');
select is((select sum(attempts) from broadcast_delivery_queue where broadcast_id='95000000-0000-4000-8000-000000000001'),2::bigint,'source correction preserves attempts');
select is((select count(*) from broadcast_delivery_receipts where broadcast_id='95000000-0000-4000-8000-000000000001'),1::bigint,'source correction preserves delivery receipts');
update onm_vigilance set expires=now()+interval '3 hours' where id='94000000-0000-4000-8000-000000000001';
select is((select max(expires_at) from broadcast_delivery_queue where broadcast_id='95000000-0000-4000-8000-000000000001'),now()-interval '1 minute','source extension never reopens retry window');
select ok(finish_broadcast_delivery((job->>'id')::uuid,channel,(job->>'lease_token')::uuid,1,null),'already-sent work may record completion after correction') from claims where job->>'id'='95000000-0000-4000-8000-000000000001';
update onm_vigilance set expires=now()-interval '2 minutes' where id='94000000-0000-4000-8000-000000000001';
select is((select count(*) from broadcast_delivery_queue where broadcast_id='95000000-0000-4000-8000-000000000001' and state='delivered'),2::bigint,'completed queues remain delivered');
update onm_vigilance set onset=null where id='94000000-0000-4000-8000-000000000003';
select is((select min(expires_at) from broadcast_delivery_queue where broadcast_id='95000000-0000-4000-8000-000000000003'),now()+interval '22 hours','missing onset falls back to sent plus 24 hours');
update onm_vigilance set expires=onset where id='94000000-0000-4000-8000-000000000005';
select ok((select bool_and(expires_at<=now()) from broadcast_delivery_queue where broadcast_id='95000000-0000-4000-8000-000000000005'),'empty validity interval fails closed');
update onm_vigilance set sent=now()+interval '1 hour' where id='94000000-0000-4000-8000-000000000006';
select ok((select bool_and(expires_at<=now()) from broadcast_delivery_queue where broadcast_id='95000000-0000-4000-8000-000000000006'),'future issued alert fails closed');
insert into authority_warnings(id,source,received_via,body,severity,commune_codes) values ('96000000-0000-4000-8000-000000000001','test','phone','test','Severe','{1501}');
insert into broadcasts(kind,authority_warning_id,severity,commune_codes,push_codes) values ('authority','96000000-0000-4000-8000-000000000001','Severe','{1501}','{1501}');
select is((select count(*) from broadcast_delivery_queue q join broadcasts b on b.id=q.broadcast_id where b.authority_warning_id='96000000-0000-4000-8000-000000000001' and q.expires_at=b.created_at+interval '24 hours'),2::bigint,'non-ONM delivery deadlines are unchanged');
select ok(not has_function_privilege('authenticated','public.renew_broadcast_delivery(uuid,text,uuid)','execute'),'users cannot renew leases');
select ok(not has_table_privilege('anon','public.broadcast_delivery_queue','update'),'anonymous cannot alter deadline');
select ok(not has_function_privilege('anon','public.onm_delivery_deadline(timestamptz,timestamptz,timestamptz)','execute'),'deadline helper is not a public API');
select ok(not has_function_privilege('authenticated','public.clamp_onm_delivery_deadline()','execute'),'queue trigger function is private');
select ok(not has_function_privilege('service_role','public.shorten_onm_delivery_deadlines()','execute'),'source trigger function cannot be called directly');
-- Reproduce a source correction that could not see an uncommitted leased queue.
-- The queue is still apparently live when renewal evaluates its WHERE clause.
alter table public.onm_vigilance disable trigger shorten_onm_delivery_deadlines;
update public.onm_vigilance set expires=now()-interval '1 minute'
  where id='94000000-0000-4000-8000-000000000004';
alter table public.onm_vigilance enable trigger shorten_onm_delivery_deadlines;
select ok(not renew_broadcast_delivery((job->>'id')::uuid,channel,(job->>'lease_token')::uuid),
  'renewal rejects final trigger-clamped expiry on '||channel)
from claims where job->>'id'='95000000-0000-4000-8000-000000000004';
select is((select count(*) from broadcast_delivery_queue where broadcast_id='95000000-0000-4000-8000-000000000004' and expires_at=now()-interval '1 minute' and attempts=1),2::bigint,
  'rejected renewal persists corrected deadline without losing attempts');
select ok(has_function_privilege('service_role','public.renew_broadcast_delivery(uuid,text,uuid)','execute'),'sender retains renewal permission');
-- Recreate a pre-migration queue state transactionally, then run the actual
-- migration backfill. This also proves that deployment preserves active leases.
drop trigger clamp_onm_delivery_deadline on public.broadcast_delivery_queue;
drop trigger shorten_onm_delivery_deadlines on public.onm_vigilance;
drop function public.clamp_onm_delivery_deadline();
drop function public.shorten_onm_delivery_deadlines();
drop function public.onm_delivery_deadline(timestamptz,timestamptz,timestamptz);
update public.broadcast_delivery_queue set expires_at=now()+interval '24 hours'
  where broadcast_id in ('95000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000003');
update public.broadcast_delivery_queue set state='pending',lease_token=null,lease_until=null,attempts=3
  where broadcast_id='95000000-0000-4000-8000-000000000002';
\ir ../migrations/20260921150452_onm_delivery_validity.sql
select is((select count(*) from broadcast_delivery_queue where broadcast_id='95000000-0000-4000-8000-000000000002' and expires_at=now()-interval '1 minute' and attempts=3),2::bigint,'migration backfills existing pending jobs and preserves attempts');
select is((select count(*) from broadcast_delivery_queue where broadcast_id='95000000-0000-4000-8000-000000000003' and expires_at=now()+interval '22 hours' and state='leased' and lease_token is not null and attempts=1),2::bigint,'migration backfills existing leases without discarding lease evidence');
select is((select count(*) from claim_broadcast_delivery('fcm',100) where job->>'id'='95000000-0000-4000-8000-000000000002'),0::bigint,'backfilled expired queue cannot be claimed');
select is((select count(*) from broadcast_delivery_receipts where broadcast_id='95000000-0000-4000-8000-000000000001'),1::bigint,'backfill preserves completed receipts');
select is((select count(*) from broadcast_delivery_queue where broadcast_id='95000000-0000-4000-8000-000000000001' and state='delivered'),2::bigint,'backfill never reopens completed deliveries');
select * from finish();
rollback;
