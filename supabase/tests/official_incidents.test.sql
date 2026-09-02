begin;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'text_sources', 'text source registry exists');
select has_table('public', 'source_documents', 'immutable document store exists');
select has_table('public', 'incident_mentions', 'append-only mention ledger exists');
select has_table('public', 'official_incidents', 'merged official incidents exist');
select has_table('public', 'admin_unit_aliases', 'gazetteer alias table exists');
select has_view('public', 'official_incident_recall_daily', 'recall metric view exists');

select is(
  (select family from public.source_contracts where key = 'dgpc_telegram'),
  'official_text',
  'DGPC Telegram is registered as an official_text contract'
);
select is(
  (select authority_tier || '/' || kind || '/' || template from public.text_sources where key = 'dgpc_telegram'),
  'national/telegram_public/dgpc_bulletin',
  'the DGPC registry row carries tier, transport and template'
);
select is(
  (select count(*)::integer from public.source_health where key = 'dgpc_telegram'),
  1,
  'text sources appear on the public health surface'
);

-- fixture geography: the local stack has no seeded gazetteer
insert into public.admin_units (id, level, code, name_ar, name_fr, name_en, lat, lon)
values
  ('a0000000-0000-4000-8000-000000000001', 'wilaya', 'T21', 'سكيكدة', 'Skikda', 'Skikda', 36.87, 6.9),
  ('a0000000-0000-4000-8000-000000000002', 'commune', 'T2115', 'عزابة', 'Azzaba', 'Azzaba', 36.73, 7.1);
update public.admin_units set parent_id = 'a0000000-0000-4000-8000-000000000001'
where id = 'a0000000-0000-4000-8000-000000000002';

insert into public.source_documents (id, text_source_id, external_id, url, published_at, fetched_at, content_hash, body)
select 'd0000000-0000-4000-8000-000000000001', id, 'DGPCDZ/1', 'https://t.me/DGPCDZ/1',
       '2026-09-02T12:05:00Z', '2026-09-02T12:10:00Z', 'h1', 'حريق ببلدية عزابة'
from public.text_sources where key = 'dgpc_telegram';

select throws_ok(
  $$update public.source_documents set body = 'edited' where external_id = 'DGPCDZ/1'$$,
  '55000', 'source_document_is_immutable',
  'documents cannot be rewritten'
);
select throws_ok(
  $$delete from public.source_documents where external_id = 'DGPCDZ/1'$$,
  '55000', 'source_document_is_immutable',
  'documents cannot be deleted'
);
select throws_ok(
  $$insert into public.source_documents (text_source_id, external_id, url, published_at, fetched_at, content_hash, body)
    select text_source_id, external_id, url, published_at, fetched_at, content_hash, body
    from public.source_documents where external_id = 'DGPCDZ/1'$$,
  '23505', null,
  'a platform post id is stored once per source'
);

insert into public.incident_mentions (id, document_id, text_source_id, wilaya_id, commune_id, kind, status, fire_count, as_of, precision, evidence, extractor)
select 'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', id,
       'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
       'vegetation', 'ongoing', 1, '2026-09-02T12:00:00Z', 'commune', 'حريق ببلدية عزابة', 'template'
from public.text_sources where key = 'dgpc_telegram';

insert into public.official_incidents (id, wilaya_id, commune_id, kind, status, precision, authority_tier, first_reported_at, last_reported_at, as_of, mention_count, latest_mention_id, evidence)
values ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
        'vegetation', 'ongoing', 'commune', 'national', '2026-09-02T12:00:00Z', '2026-09-02T12:00:00Z', '2026-09-02T12:00:00Z',
        1, 'e0000000-0000-4000-8000-000000000001', 'حريق ببلدية عزابة');

update public.incident_mentions set incident_id = 'f0000000-0000-4000-8000-000000000001'
where id = 'e0000000-0000-4000-8000-000000000001';
select is(
  (select incident_id from public.incident_mentions where id = 'e0000000-0000-4000-8000-000000000001'),
  'f0000000-0000-4000-8000-000000000001'::uuid,
  'a mention can be attached to an incident once'
);
select throws_ok(
  $$update public.incident_mentions set status = 'extinguished' where id = 'e0000000-0000-4000-8000-000000000001'$$,
  '55000', 'incident_mention_is_append_only',
  'mention fields other than the attachment never change'
);
select throws_ok(
  $$update public.incident_mentions set incident_id = null where id = 'e0000000-0000-4000-8000-000000000001'$$,
  '55000', 'incident_mention_is_append_only',
  'an attachment is never undone'
);

select lives_ok(
  $$select public.bump_official_incident('f0000000-0000-4000-8000-000000000001', '{"status":"extinguished","last_reported_at":"2026-09-02T19:00:00Z"}'::jsonb)$$,
  'a merge bump applies the patch'
);
select is(
  (select status || '/' || mention_count from public.official_incidents where id = 'f0000000-0000-4000-8000-000000000001'),
  'extinguished/2',
  'the bump changes status and increments the mention count'
);
select throws_ok(
  $$select public.bump_official_incident('f0000000-0000-4000-8000-0000000000ff', '{}'::jsonb)$$,
  'P0002', 'official_incident_not_found',
  'bumping an unknown incident fails loudly'
);

select results_eq(
  $$select day::text, mentions, communes, with_cluster from public.official_incident_recall_daily$$,
  $$values ('2026-09-02', 1, 1, 0)$$,
  'recall counts resolved mentions and cluster hits per Algiers day'
);

create or replace function pg_temp.anon_reads() returns table (incidents integer, mentions integer, documents integer)
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  return query select
    (select count(*)::integer from public.official_incidents),
    (select count(*)::integer from public.incident_mentions),
    (select count(*)::integer from public.source_documents);
  perform set_config('role', 'postgres', true);
end $$;
select results_eq(
  'select * from pg_temp.anon_reads()',
  $$values (1, 1, 1)$$,
  'anon can read incidents, mentions and documents'
);

select * from finish();
rollback;
