begin;
set local search_path=public,extensions;
select plan(8);

insert into public.source_contracts(key,version,label,family,criticality,freshness_basis,cadence_minutes,warning_after_minutes,stale_after_minutes,parser_version,licence,attribution,owner)
values('test.dgpc-hazards',1,'test','official_text','optional','last_success_at',15,30,60,'test','test','test','test');
insert into public.source_checkpoints(contract_key) values('test.dgpc-hazards');
insert into public.text_sources(id,key,label,kind,url,authority_tier)
values('18000000-0000-4000-8000-000000000001','test.dgpc-hazards','test','telegram_public','https://t.me/s/DGPCDZ','national');
insert into public.admin_units(id,level,code,name_ar,name_fr,name_en,lat,lon) values
('18000000-0000-4000-8000-000000000002','wilaya','H22','سيدي بلعباس','Sidi Bel Abbès','Sidi Bel Abbes',35.2,-0.6),
('18000000-0000-4000-8000-000000000003','commune','H2201','مرحومة','Marhoum','Marhoum',34.4,-0.2);

set local role service_role;
select set_config('test.hazards.doc',(public.write_text_source('test.dgpc-hazards','documents',
'[{"text_source_id":"18000000-0000-4000-8000-000000000001","external_id":"DGPCDZ/weather","url":"https://t.me/DGPCDZ/weather","published_at":"2026-09-19T19:50:00Z","content_hash":"weather","body":"situation"}]')->0->>'id'),true);

create temp table road_mentions as
  select value as mention from jsonb_array_elements(public.write_text_source('test.dgpc-hazards','mentions',jsonb_build_array(
    jsonb_build_object('document_id',current_setting('test.hazards.doc'),'text_source_id','18000000-0000-4000-8000-000000000001',
      'wilaya_id','18000000-0000-4000-8000-000000000002','commune_id','18000000-0000-4000-8000-000000000003',
      'place_text','الطريق الوطني رقم 104','kind','road','status','ongoing','fire_count',1,'as_of','2026-09-19T19:00:00Z',
      'precision','commune','evidence','الطريق الوطني رقم 104 مقطوع','extractor','llm'),
    jsonb_build_object('document_id',current_setting('test.hazards.doc'),'text_source_id','18000000-0000-4000-8000-000000000001',
      'wilaya_id','18000000-0000-4000-8000-000000000002','commune_id','18000000-0000-4000-8000-000000000003',
      'place_text','الطريق الولائي رقم 7','kind','road','status','ongoing','fire_count',1,'as_of','2026-09-19T19:00:00Z',
      'precision','commune','evidence','الطريق الولائي رقم 7 مقطوع','extractor','llm'))));

select is((select count(distinct mention->>'id') from road_mentions), 2::bigint,
  'two cut roads of one commune in one post stay two mentions');

select throws_ok(
  format($$select public.write_text_source('test.dgpc-hazards','confirm',
    '[{"mentionId":"%s","communeId":"18000000-0000-4000-8000-000000000003","asOf":"2026-09-19T19:00:00Z"}]')$$,
    (select mention->>'id' from road_mentions limit 1)),
  'P0001', 'confirmation_kind_mismatch', 'a road report can never confirm a satellite fire');

select is(public.write_text_source('test.dgpc-hazards','apply_mention',jsonb_build_object(
  'mentionId',(select mention->>'id' from road_mentions limit 1),
  'insert',jsonb_build_object('wilaya_id','18000000-0000-4000-8000-000000000002','commune_id','18000000-0000-4000-8000-000000000003',
    'kind','road','status','ongoing','precision','commune','authority_tier','national','place_text','الطريق الوطني رقم 104',
    'first_reported_at','2026-09-19T19:00:00Z','last_reported_at','2026-09-19T19:00:00Z','as_of','2026-09-19T19:00:00Z',
    'latest_mention_id',(select mention->>'id' from road_mentions limit 1),'evidence','الطريق الوطني رقم 104 مقطوع')))->>'applied',
  'true', 'a cut road becomes an official incident');

select public.write_text_source('test.dgpc-hazards','unlist',jsonb_build_object(
  'ids',jsonb_build_array((select id from official_incidents where kind='road' and commune_id='18000000-0000-4000-8000-000000000003')),
  'asOf','2026-09-20T08:00:00Z'));
select is((select unlisted_at from official_incidents where kind='road' and commune_id='18000000-0000-4000-8000-000000000003'), null,
  'a fire bulletin that omits a cut road never unlists it');

select is((select mentions from official_incident_recall_daily where day = '2026-09-19'), null,
  'road mentions stay out of the satellite recall statistic');

select public.write_text_source('test.dgpc-hazards','advice',jsonb_build_object(
  'documentId',current_setting('test.hazards.doc'),'advice','يُرجى توخي الحيطة والحذر أثناء السياقة',
  'wilayaIds',jsonb_build_array('18000000-0000-4000-8000-000000000002'),
  'validFrom','2026-09-20T12:00:00+01:00','validTo','2026-09-20T21:00:00+01:00'));
select public.write_text_source('test.dgpc-hazards','advice',jsonb_build_object(
  'documentId',current_setting('test.hazards.doc'),'advice','يُرجى توخي الحيطة والحذر أثناء السياقة',
  'wilayaIds',jsonb_build_array('18000000-0000-4000-8000-000000000002'),'validFrom',null,'validTo',null));
select is((select count(*) from official_weather_advice where document_id=current_setting('test.hazards.doc')::uuid), 1::bigint,
  'a relayed advice is stored once per post');
reset role;

set local role anon;
select is((select count(*) from official_weather_advice where document_id=current_setting('test.hazards.doc')::uuid), 1::bigint,
  'the authority''s advice is public');
select throws_ok($$insert into official_weather_advice(document_id,advice,wilaya_ids) values (gen_random_uuid(),'forged advice','{}')$$,
  '42501', null, 'nobody writes advice directly');
reset role;

select * from finish();
rollback;
