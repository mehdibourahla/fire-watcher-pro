begin;
set local search_path = public, extensions;
select plan(11);

insert into auth.users(id,email) values ('2b000000-0000-4000-8000-000000000001','hazards-owner@example.invalid');
insert into zones(id,user_id,name,lat,lon) values
  ('2b000000-0000-4000-8000-000000000010','2b000000-0000-4000-8000-000000000001','Home',36.7,3.06);

select is((select notify_weather and notify_official and notify_road from zones where id='2b000000-0000-4000-8000-000000000010'),
  true,'a new zone follows weather, official and road hazards');
select is((select count(*) from zones where not (notify_weather and notify_official and notify_road)),
  0::bigint,'every existing zone follows all hazards after the backfill');

select lives_ok($$insert into alerts(user_id,kind,severity,dedupe_key,title,body,source_table,source_id)
  values ('2b000000-0000-4000-8000-000000000001','weather',3,'weather:z:1','t','b','onm_vigilance',gen_random_uuid())$$,
  'a weather alert is accepted');
select lives_ok($$insert into alerts(user_id,kind,severity,dedupe_key,title,body,source_table,source_id)
  values ('2b000000-0000-4000-8000-000000000001','official',4,'official:z:1','t','b','official_incidents',gen_random_uuid())$$,
  'an official alert is accepted');
select lives_ok($$insert into alerts(user_id,kind,severity,dedupe_key,title,body,source_table,source_id)
  values ('2b000000-0000-4000-8000-000000000001','road',2,'road:z:1','t','b','civil_publications',gen_random_uuid())$$,
  'a road alert is accepted');
select throws_ok($$insert into alerts(user_id,kind,severity,dedupe_key,title,body)
  values ('2b000000-0000-4000-8000-000000000001','flood',2,'flood:z:1','t','b')$$,
  '23514',null,'an unknown kind is still refused');
select throws_ok($$insert into alerts(user_id,kind,severity,dedupe_key,title,body,source_table)
  values ('2b000000-0000-4000-8000-000000000001','road',2,'road:z:2','t','b','civil_publications')$$,
  '23514',null,'a source table without its id is refused');
select lives_ok($$insert into alerts(user_id,kind,severity,dedupe_key,title,body)
  values ('2b000000-0000-4000-8000-000000000001','risk',3,'risk:z:1','t','b')$$,
  'fire and risk alerts still need no source reference');

select lives_ok($$insert into webhook_endpoints(user_id,label,url,secret,kinds)
  values ('2b000000-0000-4000-8000-000000000001','Road feed','https://example.invalid/hook','s3cret-s3cret-s3cret-s3cret',array['road','weather'])$$,
  'a webhook can subscribe to the new kinds');
select throws_ok($$insert into webhook_endpoints(user_id,label,url,secret,kinds)
  values ('2b000000-0000-4000-8000-000000000001','Dup','https://example.invalid/hook2','s3cret-s3cret-s3cret-s3cret',array['road','road'])$$,
  '23514',null,'a webhook cannot list a kind twice');
select throws_ok($$insert into webhook_endpoints(user_id,label,url,secret,kinds)
  values ('2b000000-0000-4000-8000-000000000001','Flood','https://example.invalid/hook3','s3cret-s3cret-s3cret-s3cret',array['flood'])$$,
  '23514',null,'a webhook cannot subscribe to an unknown kind');

select * from finish();
rollback;
