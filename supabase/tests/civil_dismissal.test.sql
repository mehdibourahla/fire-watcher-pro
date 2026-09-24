begin;
set local search_path = public, extensions;
select plan(8);

insert into auth.users(id,email) values
 ('1d000000-0000-4000-8000-000000000001','dismiss-operator@example.invalid'),
 ('1d000000-0000-4000-8000-000000000002','dismiss-moderator@example.invalid');
insert into user_roles(user_id,role) values
 ('1d000000-0000-4000-8000-000000000001','operator'),
 ('1d000000-0000-4000-8000-000000000002','report_moderator');
insert into ita_reports(id,source_post_id,source_page,source_url,published_at,content_hash,body,raw,extraction)
values ('1d000000-0000-4000-8000-000000000010','dismiss-post','traficalg','https://www.facebook.com/traficalg/posts/dismiss-post',now()-interval '1 hour',repeat('d',64),'Source','{}',
 '{"disposition":"incident_report","incidents":[{"kind":"collision","summary_fr":"Accident","evidence":"Source"}],"review_reasons":[]}');
insert into civil_investigations(id,report_id,incident_index,state) values
 ('1d000000-0000-4000-8000-000000000020','1d000000-0000-4000-8000-000000000010',0,'review');

set local role authenticated;
select set_config('request.jwt.claim.sub','1d000000-0000-4000-8000-000000000002',true);
select throws_ok($$select dismiss_civil_investigation('1d000000-0000-4000-8000-000000000020','not a hazard')$$,'42501',null,'a report moderator cannot dismiss ITA work');

select set_config('request.jwt.claim.sub','1d000000-0000-4000-8000-000000000001',true);
select throws_ok($$select dismiss_civil_investigation('1d000000-0000-4000-8000-000000000020','  ')$$,'22023',null,'a dismissal needs a reason');
select lives_ok($$select dismiss_civil_investigation('1d000000-0000-4000-8000-000000000020','Complaint about road works, not a live hazard')$$,'an operator dismisses a review item');
select throws_ok($$select dismiss_civil_investigation('1d000000-0000-4000-8000-000000000020','again')$$,'55000',null,'a decided item cannot be dismissed twice');
select throws_ok($$select dismiss_civil_investigation('1d000000-0000-4000-8000-000000000099','x')$$,'P0002',null,'an unknown item is reported');
reset role;

select is((select state from civil_investigations where id='1d000000-0000-4000-8000-000000000020'),'discard','the item leaves the queue as discarded');
select is((select count(*) from admin_audit where action='ita.dismiss' and target_id='1d000000-0000-4000-8000-000000000020' and actor_user_id='1d000000-0000-4000-8000-000000000001'),1::bigint,'the dismissal is audited with its actor');
select is((select reason from admin_audit where action='ita.dismiss' and target_id='1d000000-0000-4000-8000-000000000020'),'Complaint about road works, not a live hazard','the audit keeps the reason');

select * from finish();
rollback;
