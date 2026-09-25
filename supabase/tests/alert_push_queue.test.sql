begin;
set local search_path = public, extensions;
select plan(13);

insert into auth.users(id,email) values ('2c000000-0000-4000-8000-000000000001','push-owner@example.invalid');
insert into alerts(id,user_id,kind,severity,dedupe_key,title,body,created_at) values
  ('2c000000-0000-4000-8000-000000000010','2c000000-0000-4000-8000-000000000001','risk',3,'risk:a','t','b',now()),
  ('2c000000-0000-4000-8000-000000000011','2c000000-0000-4000-8000-000000000001','risk',3,'risk:b','t','b',now() - interval '7 hours');

select is((select push_state from alerts where id='2c000000-0000-4000-8000-000000000010'),'pending','a new alert waits to be pushed');

select is((select array_agg(id) from claim_alert_pushes(10)),array['2c000000-0000-4000-8000-000000000010'::uuid],
  'only recent pending alerts are claimed');
select is((select count(*) from claim_alert_pushes(10)),0::bigint,'a claimed alert is not handed out twice');

update alerts set push_claimed_at = now() - interval '6 minutes' where id='2c000000-0000-4000-8000-000000000010';
select is((select count(*) from claim_alert_pushes(10)),1::bigint,'a stale claim is retried');

update alerts set push_claimed_at = now() - interval '6 minutes', push_attempts = 5 where id='2c000000-0000-4000-8000-000000000010';
select is((select count(*) from claim_alert_pushes(10)),0::bigint,'an alert is abandoned after five attempts');

set local role authenticated;
select set_config('request.jwt.claim.sub','2c000000-0000-4000-8000-000000000001',true);
select throws_ok($$select * from claim_alert_pushes(10)$$,'42501',null,'users cannot claim pushes');
select throws_ok($$update alerts set push_state='pending', push_attempts=0 where id='2c000000-0000-4000-8000-000000000010'$$,
  '42501',null,'a user cannot re-queue their own alert for push');
select lives_ok($$update alerts set read_at=now() where id='2c000000-0000-4000-8000-000000000010'$$,
  'a user can still mark their own alert read');
select throws_ok($$select * from user_push_devices$$,'42501',null,'users cannot read the device registry');
select throws_ok($$insert into user_push_devices(user_id,device_hash) values ('2c000000-0000-4000-8000-000000000001',repeat('a',64))$$,
  '42501',null,'users cannot register a device directly');
reset role;

select throws_ok($$insert into user_push_devices(user_id,device_hash) values ('2c000000-0000-4000-8000-000000000001','raw-fcm-token')$$,
  '23514',null,'only a token hash is stored, never the token');
select lives_ok($$update alerts set push_state='no_device' where id='2c000000-0000-4000-8000-000000000010'$$,
  'an alert can be marked as having no device to reach');

select throws_ok($$update alerts set push_state='maybe' where id='2c000000-0000-4000-8000-000000000010'$$,
  '23514',null,'push_state is constrained');

select * from finish();
rollback;
