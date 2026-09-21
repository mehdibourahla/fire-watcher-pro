begin;
set local search_path = public, extensions;
select no_plan();
select has_table('public','civil_publications','reviewed public records exist');
select has_table('public','civil_publication_revisions','private revisions exist');

insert into auth.users(id,email) values
 ('16000000-0000-4000-8000-000000000001','civil-admin@example.invalid'),
 ('16000000-0000-4000-8000-000000000002','civil-operator@example.invalid'),
 ('16000000-0000-4000-8000-000000000003','civil-member@example.invalid');
insert into user_roles(user_id,role) values
 ('16000000-0000-4000-8000-000000000001','admin'),
 ('16000000-0000-4000-8000-000000000002','operator');
insert into admin_units(id,level,code,name_ar,name_fr,name_en,lat,lon) values
 ('16000000-0000-4000-8000-000000000010','wilaya','civil-test','Test','Test','Test',36,3);
insert into ita_reports(id,source_post_id,source_page,source_url,published_at,content_hash,body,raw,extraction,extracted_at)
select ('16000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,n::text,'traficalg',
 'https://www.facebook.com/traficalg/posts/' || n,now()-case when n=22 then interval '4 days' else interval '1 hour' end,
 lpad(n::text,64,'a'),'private raw source','{"private":"payload"}',
 case when n=21 then '{"disposition":"general_information","incidents":[],"review_reasons":[]}'::jsonb
 else '{"disposition":"incident_report","incidents":[{"kind":"collision","summary_fr":"Collision","evidence":"private raw source","location_text":null,"location_evidence":null,"direction_text":null,"direction_evidence":null,"current_status":"unknown","status_evidence":null,"region_assessment":"unverified","review_reasons":[]}],"review_reasons":[]}'::jsonb end,now()
from generate_series(20,23) n;

set local role anon;
select is((select count(*) from civil_publications),0::bigint,'anonymous can query reviewed records');
select throws_ok($$select * from civil_publication_revisions$$,'42501',null,'anonymous audit denied');
select throws_ok($$select publish_ita_publication('16000000-0000-4000-8000-000000000020',0,'road','Reviewed','16000000-0000-4000-8000-000000000010',now()+interval '1 hour','reviewed')$$,'42501',null,'anonymous publish denied');
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"user_metadata":{"role":"admin"}}',true);
select throws_ok($$select publish_ita_publication('16000000-0000-4000-8000-000000000020',0,'road','Reviewed','16000000-0000-4000-8000-000000000010',now()+interval '1 hour','reviewed')$$,'42501',null,'member metadata cannot authorize publishing');
select is((select count(*) from civil_publication_revisions),0::bigint,'member audit hidden');
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000002',true);
select throws_ok($$select publish_ita_publication('16000000-0000-4000-8000-000000000020',9,'road','Reviewed','16000000-0000-4000-8000-000000000010',now()+interval '1 hour','reviewed')$$,'22023',null,'invalid extracted item denied');
select throws_ok($$select publish_ita_publication('16000000-0000-4000-8000-000000000021',0,'road','Reviewed','16000000-0000-4000-8000-000000000010',now()+interval '1 hour','reviewed')$$,'22023',null,'general information denied');
select throws_ok($$select publish_ita_publication('16000000-0000-4000-8000-000000000022',0,'road','Reviewed','16000000-0000-4000-8000-000000000010',now()+interval '1 hour','reviewed')$$,'22023',null,'stale media denied');
select throws_ok($$select publish_ita_publication('16000000-0000-4000-8000-000000000020',0,'road','Reviewed','16000000-0000-4000-8000-000000000010',now()-interval '1 hour','reviewed')$$,'22023',null,'past expiry denied');
select throws_ok($$select publish_ita_publication('16000000-0000-4000-8000-000000000020',0,'road','Reviewed','16000000-0000-4000-8000-000000000010','infinity','reviewed')$$,'22023',null,'unbounded expiry denied');
select throws_ok($$select publish_ita_publication('16000000-0000-4000-8000-000000000020',0,'road','Reviewed','16000000-0000-4000-8000-000000000010',now()+interval '1 hour',' ')$$,'22023',null,'blank reason denied');
select throws_ok($$select publish_ita_publication('16000000-0000-4000-8000-000000000020',0,'road','Reviewed','16000000-0000-4000-8000-000000000099',now()+interval '1 hour','reviewed')$$,'23503',null,'unknown administrative area denied');
select throws_ok($$select publish_ita_publication('16000000-0000-4000-8000-000000000020',0,'alien','Reviewed','16000000-0000-4000-8000-000000000010',now()+interval '1 hour','reviewed')$$,'23514',null,'unknown hazard denied');
select lives_ok($$select publish_ita_publication('16000000-0000-4000-8000-000000000020',0,'road','Reviewed public summary','16000000-0000-4000-8000-000000000010',now()+interval '1 hour','private reviewer reason')$$,'operator publishes reviewed item');
select set_config('civil.id',(select id::text from civil_publications where ita_report_id='16000000-0000-4000-8000-000000000020'),true);
select is((select source_name from civil_publications where id=current_setting('civil.id')::uuid),'Info Trafic Algérie','fixed attribution');
select is((select source_url from civil_publications where id=current_setting('civil.id')::uuid),'https://www.facebook.com/traficalg/posts/20','source URL copied from evidence');
select is((select source_published_at from civil_publications where id=current_setting('civil.id')::uuid),(select published_at from ita_reports where id='16000000-0000-4000-8000-000000000020'),'source timestamp copied');
select throws_ok($$select publish_ita_publication('16000000-0000-4000-8000-000000000020',0,'road','Overwrite','16000000-0000-4000-8000-000000000010',now()+interval '1 hour','duplicate')$$,'23505',null,'duplicate publish cannot overwrite');
select throws_ok($$update civil_publications set summary='bypass'$$,'42501',null,'operator direct update denied');
select throws_ok($$insert into civil_publications default values$$,'42501',null,'operator direct insert denied');
select throws_ok($$delete from civil_publications$$,'42501',null,'operator direct delete denied');
select throws_ok($$update civil_publication_revisions set reason='erased'$$,'42501',null,'operator audit edit denied');
select throws_ok($$select revise_civil_publication(current_setting('civil.id')::uuid,1,'update','{"source_url":"https://fake.invalid"}','forge')$$,'22023',null,'source provenance cannot be patched');
select throws_ok($$select revise_civil_publication(current_setting('civil.id')::uuid,1,'update','{"lat":42}','invent')$$,'22023',null,'invented coordinates denied');
select throws_ok($$select revise_civil_publication(current_setting('civil.id')::uuid,1,'update','{"summary":null}','null')$$,'22023',null,'null patch fields denied');
select throws_ok($$select revise_civil_publication(current_setting('civil.id')::uuid,1,'update','[]','array')$$,'22023',null,'nonobject patch denied');
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000001',true);
select lives_ok($$select revise_civil_publication(current_setting('civil.id')::uuid,1,'update','{"summary":"Updated reviewed summary","hazard":"flood"}','correction')$$,'admin revision accepted');
select is((select revision from civil_publications where id=current_setting('civil.id')::uuid),2,'revision increments');
select is((select (cap_references->0->>'sent')::timestamptz from civil_publications where id=current_setting('civil.id')::uuid),(select published_at from civil_publications where id=current_setting('civil.id')::uuid),'first update references stable original CAP time');
select throws_ok($$select revise_civil_publication(current_setting('civil.id')::uuid,2,'update','{"cap_references":[]}','forge')$$,'22023',null,'CAP history cannot be patched');
select throws_ok($$select revise_civil_publication(current_setting('civil.id')::uuid,1,'update','{"summary":"Stale"}','race')$$,'40001',null,'stale revision denied');
select is((select count(*) from civil_publication_revisions where publication_id=current_setting('civil.id')::uuid),2::bigint,'rejected operations add no audit rows');
select is((select prior_payload->>'summary' from civil_publication_revisions where publication_id=current_setting('civil.id')::uuid and revision=2),'Reviewed public summary','audit captures prior reviewed state');
select is((select actor_id from civil_publication_revisions where publication_id=current_setting('civil.id')::uuid and revision=2),'16000000-0000-4000-8000-000000000001'::uuid,'audit actor is authenticated identity');
select lives_ok($$select revise_civil_publication(current_setting('civil.id')::uuid,2,'withdraw','{}','withdraw evidence')$$,'withdraw succeeds');
select is((select jsonb_array_length(cap_references) from civil_publications where id=current_setting('civil.id')::uuid),2,'withdraw references both previous CAP messages');
select is((select (cap_references->1->>'sent')::timestamptz from civil_publications where id=current_setting('civil.id')::uuid),(select (new_payload->>'updated_at')::timestamptz from civil_publication_revisions where publication_id=current_setting('civil.id')::uuid and revision=2),'withdraw references previous update timestamp');
select throws_ok($$select revise_civil_publication(current_setting('civil.id')::uuid,3,'update','{"summary":"Reactivate"}','retry')$$,'55000',null,'withdrawal terminal');
select throws_ok($$select revise_civil_publication(current_setting('civil.id')::uuid,3,'withdraw','{}','retry')$$,'55000',null,'duplicate withdrawal rejected');
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000003',true);
select throws_ok($$select revise_civil_publication(current_setting('civil.id')::uuid,3,'withdraw','{}','member')$$,'42501',null,'member revision denied');
select is((select count(*) from civil_publication_revisions),0::bigint,'populated audit still hidden from member');
set local role anon;
select is((select state from civil_publications where id=current_setting('civil.id')::uuid),'withdrawn','withdrawal tombstone public');
select is((select count(*) from civil_publications where state='published' and expires_at>now()),0::bigint,'withdrawn absent from current map');
select ok((select not (to_jsonb(c)::text like '%private%') from civil_publications c where id=current_setting('civil.id')::uuid),'public payload contains neither raw input nor reason');
select throws_ok($$select * from ita_reports$$,'42501',null,'raw evidence stays private');
reset role;
insert into civil_publications(ita_report_id,incident_index,hazard,summary,area_id,source_name,source_url,source_published_at,expires_at)
values ('16000000-0000-4000-8000-000000000023',0,'weather','Expired reviewed summary','16000000-0000-4000-8000-000000000010','Info Trafic Algérie','https://www.facebook.com/traficalg/posts/23',now()-interval '1 hour',now()-interval '1 minute');
set local role anon;
select is((select count(*) from civil_publications where state='published' and expires_at>now()),0::bigint,'expired publication is never current without a scheduler');
select is((select count(*) from civil_publications where ita_report_id='16000000-0000-4000-8000-000000000023'),1::bigint,'expired publication retained for history');
reset role;
select throws_ok($$update civil_publications set source_name='Fake' where id=current_setting('civil.id')::uuid$$,'55000',null,'provenance immutable even for privileged direct edits');
select throws_ok($$update civil_publication_revisions set reason='erased'$$,'55000',null,'audit immutable even for privileged direct edits');
select throws_ok($$delete from civil_publication_revisions$$,'55000',null,'audit cannot be deleted');
set local role service_role;
select throws_ok($$update civil_publications set summary='collector bypass'$$,'42501',null,'collector direct mutation denied');
reset role;
select * from finish();
rollback;
