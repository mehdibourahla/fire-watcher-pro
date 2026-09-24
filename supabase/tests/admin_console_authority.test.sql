begin;
set local search_path = public, extensions;
select plan(20);

insert into auth.users(id,email) values
 ('1b000000-0000-4000-8000-000000000001','console-admin@example.invalid'),
 ('1b000000-0000-4000-8000-000000000002','console-moderator@example.invalid'),
 ('1b000000-0000-4000-8000-000000000003','console-operator@example.invalid'),
 ('1b000000-0000-4000-8000-000000000004','console-translator@example.invalid'),
 ('1b000000-0000-4000-8000-000000000005','console-member@example.invalid');
insert into user_roles(user_id,role) values
 ('1b000000-0000-4000-8000-000000000001','admin'),
 ('1b000000-0000-4000-8000-000000000002','report_moderator'),
 ('1b000000-0000-4000-8000-000000000003','operator'),
 ('1b000000-0000-4000-8000-000000000004','translator');
insert into admin_units(id,level,code,name_ar,name_fr,name_en,lat,lon) values
 ('1b000000-0000-4000-8000-000000000010','wilaya','console-test','T','T','T',36,3);
insert into citizen_reports(id,user_id,lat,lon,note) values
 ('1b000000-0000-4000-8000-000000000020','1b000000-0000-4000-8000-000000000005',36.7,3.0,'smoke above the ridge');
insert into fire_clusters(id,short_id,state,first_detected_at,last_detected_at,lat,lon,confidence) values
 ('1b000000-0000-4000-8000-000000000030','DZCONS1','active',now()-interval '3 hours',now()-interval '1 hour',36.7,3.0,0.9);

set local role authenticated;

select set_config('request.jwt.claim.sub','1b000000-0000-4000-8000-000000000005',true);
select throws_ok($$select moderate_citizen_report('1b000000-0000-4000-8000-000000000020','approved',null,null)$$,'42501',null,'a member cannot moderate');
select throws_ok($$select admin_attention_counts()$$,'42501',null,'a member has no attention queue');

select set_config('request.jwt.claim.sub','1b000000-0000-4000-8000-000000000002',true);
update citizen_reports set note='rewritten' where id='1b000000-0000-4000-8000-000000000020';
select is((select note from citizen_reports where id='1b000000-0000-4000-8000-000000000020'),'smoke above the ridge','a moderator can no longer rewrite a report directly');
select throws_ok($$select moderate_citizen_report('1b000000-0000-4000-8000-000000000020','maybe',null,null)$$,'22023',null,'an unknown status is refused');
select lives_ok($$select moderate_citizen_report('1b000000-0000-4000-8000-000000000020','approved','seen from the road','1b000000-0000-4000-8000-000000000030')$$,'a moderator approves and links a fire');
select is((select status||'|'||cluster_id::text||'|'||reviewed_by::text from citizen_reports where id='1b000000-0000-4000-8000-000000000020'),
  'approved|1b000000-0000-4000-8000-000000000030|1b000000-0000-4000-8000-000000000002','status, fire link and reviewer are written server-side');
select is((select array_agg(item order by item) from admin_attention_counts()),array['citizen_reports','ideas'],'a moderator counts only the queues they can act on');

select set_config('request.jwt.claim.sub','1b000000-0000-4000-8000-000000000004',true);
select is((select array_agg(item order by item) from admin_attention_counts()),array['translations'],'a translator counts only translations');

select set_config('request.jwt.claim.sub','1b000000-0000-4000-8000-000000000003',true);
select throws_ok($$select relay_authority_warning('Protection Civile','phone','Evacuate the forest road','Severe','1b000000-0000-4000-8000-000000000010')$$,'42501',null,'an operator cannot relay an authority warning');
update fire_clusters set state='false_positive' where id='1b000000-0000-4000-8000-000000000030';
select is((select state from fire_clusters where id='1b000000-0000-4000-8000-000000000030'),'active','an operator can no longer resolve a fire around resolve_fire');
select ok((select count(*) from admin_attention_counts() where item='fires' and count=1)=1,'an operator sees the unresolved fire');
select ok(not exists(select 1 from admin_attention_counts() where item in ('citizen_reports','translations')),'an operator does not count moderation queues');

select set_config('request.jwt.claim.sub','1b000000-0000-4000-8000-000000000001',true);
select throws_ok($$insert into authority_warnings(source,received_via,body,severity,wilaya_id,created_by) values ('X','phone','Y','Severe','1b000000-0000-4000-8000-000000000010','1b000000-0000-4000-8000-000000000001')$$,'42501',null,'an admin cannot insert a warning around the audit');
select throws_ok($$select relay_authority_warning('Protection Civile','phone','  ','Severe','1b000000-0000-4000-8000-000000000010')$$,'22023',null,'a blank warning is refused');
select lives_ok($$select relay_authority_warning('Protection Civile','phone','Evacuate the forest road','Severe','1b000000-0000-4000-8000-000000000010')$$,'an admin relays a warning');
select ok((select count(*) from admin_attention_counts() where item in ('fires','citizen_reports','translations','ideas'))=4,'an admin counts every queue');
reset role;
select is((select created_by::text from authority_warnings where body='Evacuate the forest road'),'1b000000-0000-4000-8000-000000000001','the relay is attributed server-side');

select is((select count(*) from admin_audit where action='report.moderate' and target_id='1b000000-0000-4000-8000-000000000020' and actor_user_id='1b000000-0000-4000-8000-000000000002'),1::bigint,'moderation is audited with its actor');
select is((select after->>'status' from admin_audit where action='report.moderate' and target_id='1b000000-0000-4000-8000-000000000020'),'approved','the audit records the new status');
select is((select count(*) from admin_audit where action='authority_warning.relay' and actor_user_id='1b000000-0000-4000-8000-000000000001'),1::bigint,'the relay is audited with its actor');

select * from finish();
rollback;
