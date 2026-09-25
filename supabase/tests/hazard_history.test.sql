begin;
set local search_path = public, extensions;
select plan(11);

insert into public.admin_units (id, level, code, name_ar, name_fr, name_en, lat, lon, parent_id) values
  ('31000000-0000-4000-8000-000000000001', 'wilaya', 'H31', 'ت', 'Hist Tizi', 'Hist Tizi', 36.7, 4.0, null),
  ('31000000-0000-4000-8000-000000000002', 'wilaya', 'H32', 'ب', 'Hist Batna', 'Hist Batna', 35.5, 6.1, null),
  ('31000000-0000-4000-8000-000000000003', 'commune', 'H3101', 'أ', 'Hist Akbil', 'Hist Akbil', 36.5, 4.3, '31000000-0000-4000-8000-000000000001'),
  ('31000000-0000-4000-8000-000000000004', 'commune', 'H3999', 'م', 'Hist Orphan', 'Hist Orphan', 36.0, 3.0, null);

insert into public.fire_clusters (id, short_id, state, first_detected_at, last_detected_at, lat, lon, est_area_ha, wilaya_id) values
  ('31000000-0000-4000-8000-000000000011', 'DZH1', 'extinguished', '2031-09-02T10:00Z', '2031-09-02T12:00Z', 36.7, 4.0, 12, '31000000-0000-4000-8000-000000000001'),
  ('31000000-0000-4000-8000-000000000012', 'DZH2', 'false_positive', '2031-09-02T10:00Z', '2031-09-02T12:00Z', 36.7, 4.0, 99, '31000000-0000-4000-8000-000000000001'),
  ('31000000-0000-4000-8000-000000000013', 'DZH3', 'extinguished', '2031-09-10T09:00Z', '2031-09-10T12:00Z', 36.7, 4.0, 30, '31000000-0000-4000-8000-000000000001');

insert into public.onm_vigilance (cap_id, title, event, severity, urgency, certainty, sent, onset, expires, area_desc, wilaya_id) values
  ('hist-o1', 'Storm', 'Thunderstorm', 'Severe', 'Immediate', 'Observed', '2031-08-31T23:30Z', '2031-08-31T23:30Z', '2031-09-01T12:00Z', 'H32', '31000000-0000-4000-8000-000000000002');

insert into public.ita_reports (id, source_post_id, source_page, source_url, published_at, content_hash, body, raw) values
  ('31000000-0000-4000-8000-000000000021', 'hist-post', 'traficalg', 'https://example.invalid/hist', '2031-09-22T15:00Z', repeat('a', 64), 'body', '{}');
insert into public.civil_publications (ita_report_id, incident_index, hazard, summary, area_id, source_name, source_url, source_published_at, expires_at, published_at, state) values
  ('31000000-0000-4000-8000-000000000021', 0, 'road', 'Accident, RN12', '31000000-0000-4000-8000-000000000003', 'Info Trafic Algérie', 'https://example.invalid/hist', '2031-09-22T16:00Z', '2031-09-23T16:00Z', '2031-09-22T16:00Z', 'published'),
  ('31000000-0000-4000-8000-000000000021', 1, 'road', 'Unplaced closure', '31000000-0000-4000-8000-000000000004', 'Info Trafic Algérie', 'https://example.invalid/hist', '2031-09-23T16:00Z', '2031-09-24T16:00Z', '2031-09-23T16:00Z', 'published');

create temp table s as select public.hazard_history_summary(null, null, 2031, '{}', '2031-09-25T12:00Z') as all_hazards,
  public.hazard_history_summary('fire', null, 2031, '{}', '2031-09-25T12:00Z') as fires,
  public.hazard_history_summary(null, null, 2031, '{}', '2032-02-01T12:00Z') as later;

select is((select all_hazards ->> 'total' from s)::int, 5, 'screened-out fires are left out');
select is((select wilaya_id from public.hazard_history where id in (select id from public.civil_publications where summary = 'Accident, RN12')),
  '31000000-0000-4000-8000-000000000001'::uuid, 'a road record in a commune counts for its wilaya');
select is((select all_hazards ->> 'granularity' from s), 'week', 'a short archive is charted by week');
select is((select array_agg(b ->> 'start' order by b ->> 'start') from s, jsonb_array_elements(all_hazards -> 'buckets') b),
  array['2031-09-01', '2031-09-08', '2031-09-15', '2031-09-22'], 'weeks follow the Algiers calendar and keep empty weeks');
select is((select all_hazards -> 'buckets' -> 0 from s), '{"start": "2031-09-01", "fire": 1, "weather": 1, "road": 0, "burnedHa": 12}'::jsonb,
  'a warning at 23:30 UTC on Sunday belongs to Monday in Algiers');
select is((select (all_hazards -> 'buckets' -> 3 ->> 'road')::int from s), 2, 'both road records land in their week');
select is((select later ->> 'granularity' from s) || ' ' || (select later -> 'buckets' -> 0 ->> 'start' from s), 'month 2031-09-01',
  'a long archive is charted by month');
select is((select array_agg((r ->> 'total')::int) from s, jsonb_array_elements(all_hazards -> 'ranking') r), array[3, 1],
  'wilayas rank by number of records');
select is((select (all_hazards ->> 'unlocated')::int from s), 1, 'a record without a wilaya is counted as unlocated');
select is((select (fires -> 'ranking' -> 0 ->> 'burnedHa')::numeric from s), 42::numeric, 'fire alone ranks by burned area');

set local role anon;
select ok((select count(*) from public.hazard_history where extract(year from at) = 2031) = 5
  and public.hazard_history_summary() is not null, 'history and its summary are public');
reset role;

select * from finish();
rollback;
