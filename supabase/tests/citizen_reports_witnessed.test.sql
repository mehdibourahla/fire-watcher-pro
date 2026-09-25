begin;
set local search_path = public, extensions;
select plan(24);

insert into auth.users (id, email) values
  ('3c000000-0000-4000-8000-000000000001', 'reporter@example.invalid'),
  ('3c000000-0000-4000-8000-000000000002', 'witness@example.invalid'),
  ('3c000000-0000-4000-8000-000000000003', 'far@example.invalid'),
  ('3c000000-0000-4000-8000-000000000004', 'gone-a@example.invalid'),
  ('3c000000-0000-4000-8000-000000000005', 'gone-b@example.invalid'),
  ('3c000000-0000-4000-8000-000000000006', 'gone-c@example.invalid'),
  ('3c000000-0000-4000-8000-000000000007', 'gone-d@example.invalid'),
  ('3c000000-0000-4000-8000-000000000008', 'gone-e@example.invalid'),
  ('3c000000-0000-4000-8000-000000000009', 'moderator@example.invalid');
insert into user_roles (user_id, role) values ('3c000000-0000-4000-8000-000000000009', 'report_moderator');
insert into admin_units (id, level, code, name_ar, name_fr, name_en, lat, lon) values
  ('3c200000-0000-4000-8000-000000000001', 'commune', 'citizen-near', 'N', 'N', 'N', 36.70, 4.05),
  ('3c200000-0000-4000-8000-000000000002', 'commune', 'citizen-far', 'F', 'F', 'F', 35.00, 0.50);
select set_config('request.jwt.claim.sub', '3c000000-0000-4000-8000-000000000009', true);
create temp table attention_baseline as
  select count as n from admin_attention_counts() where item = 'citizen_reports';

set local role authenticated;
select set_config('request.jwt.claim.sub', '3c000000-0000-4000-8000-000000000001', true);
insert into citizen_reports (id, user_id, lat, lon, kind, status, commune_id) values
  ('3c100000-0000-4000-8000-000000000001', '3c000000-0000-4000-8000-000000000001', 36.70, 4.05, 'sighting', 'pending',
   '3c200000-0000-4000-8000-000000000002');
insert into citizen_reports (id, user_id, lat, lon, kind, status, note, publish_state, summary) values
  ('3c100000-0000-4000-8000-000000000002', '3c000000-0000-4000-8000-000000000001', 36.70, 4.05, 'flooding', 'pending',
   'water up to the door', 'published', 'forged summary');
insert into citizen_reports (id, user_id, lat, lon, kind, status) values
  ('3c100000-0000-4000-8000-000000000003', '3c000000-0000-4000-8000-000000000001', 36.70, 4.05, 'person_trapped', 'pending');
reset role;

select is((select publish_state || '/' || hazard from citizen_reports where id = '3c100000-0000-4000-8000-000000000001'),
  'published/fire', 'a tile report without text publishes at once as its category');
select is((select commune_id from citizen_reports where id = '3c100000-0000-4000-8000-000000000001'),
  '3c200000-0000-4000-8000-000000000001'::uuid, 'the public place comes from the pin, not from what the client claims');
select is((select publish_state from citizen_reports where id = '3c100000-0000-4000-8000-000000000002'),
  'classifying', 'a report with text waits for the classifier even if the client claims it is published');
select is((select summary from citizen_reports where id = '3c100000-0000-4000-8000-000000000002'),
  null, 'a client cannot write the public summary');
select is((select publish_state from citizen_reports where id = '3c100000-0000-4000-8000-000000000003'),
  'private', 'person trapped is recorded privately');
select set_config('request.jwt.claim.sub', '3c000000-0000-4000-8000-000000000009', true);
select is((select count from admin_attention_counts() where item = 'citizen_reports'), (select n + 2 from attention_baseline),
  'moderators are asked about waiting and private reports, not ones already published');

set local role anon;
select is((select count(*) from hazard_reports where id::text like '3c1%'), 1::bigint,
  'the public sees the published tile only, never the unclassified text or person trapped');
select throws_ok($$select witness_report('3c100000-0000-4000-8000-000000000001', 'seen', 36.70, 4.05)$$,
  '42501', null, 'a visitor cannot witness');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '3c000000-0000-4000-8000-000000000001', true);
select throws_ok($$select witness_report('3c100000-0000-4000-8000-000000000001', 'seen', 36.70, 4.05)$$,
  '22023', 'own_report', 'nobody witnesses their own report');

select set_config('request.jwt.claim.sub', '3c000000-0000-4000-8000-000000000003', true);
select throws_ok($$select witness_report('3c100000-0000-4000-8000-000000000001', 'seen', 36.80, 4.05)$$,
  '22023', 'too_far', 'a witness must be within 5 km');

select set_config('request.jwt.claim.sub', '3c000000-0000-4000-8000-000000000002', true);
select is(witness_report('3c100000-0000-4000-8000-000000000001', 'seen', 36.71, 4.05), 1,
  'a nearby person confirms the report');
select throws_ok($$select witness_report('3c100000-0000-4000-8000-000000000002', 'seen', 36.70, 4.05)$$,
  'P0002', 'report_not_open', 'an unpublished report cannot be witnessed');
select is((my_contribution() ->> 'points')::integer, 0, 'a lone confirmation mints no points');
select throws_ok($$select witness_report('3c100000-0000-4000-8000-000000000001', 'seen', null, null)$$,
  '22023', 'too_far', 'a vote without a location is refused, never waved through');
reset role;

select set_config('request.jwt.claim.sub', '3c000000-0000-4000-8000-000000000003', true);
select witness_report('3c100000-0000-4000-8000-000000000001', 'seen', 36.70, 4.06);
select set_config('request.jwt.claim.sub', '3c000000-0000-4000-8000-000000000002', true);
select is((my_contribution() ->> 'points')::integer, 3, 'a confirmation earns 3 points once a second witness agrees');
reset role;

select ok((select expires_at > now() + interval '6 hours' from citizen_reports
           where id = '3c100000-0000-4000-8000-000000000001') is false
        and (select expires_at >= now() + interval '3 hours' - interval '1 minute' from citizen_reports
           where id = '3c100000-0000-4000-8000-000000000001'),
  'a confirmation keeps the report alive at least three more hours');
select is((select witnesses from hazard_reports where id = '3c100000-0000-4000-8000-000000000001'), 2,
  'the public sees how many people confirmed it');

set local role authenticated;
select set_config('request.jwt.claim.sub', '3c000000-0000-4000-8000-000000000001', true);
delete from citizen_reports where id = '3c100000-0000-4000-8000-000000000003';
select throws_ok($$insert into citizen_reports (user_id, lat, lon, kind, status)
  values ('3c000000-0000-4000-8000-000000000001', 36.7, 4.05, 'flooding', 'pending')$$,
  '23514', null, 'deleting a report does not hand back a slot in the daily limit');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '3c000000-0000-4000-8000-000000000001', true);
select is(my_contribution() ->> 'corroborated', '1', 'the reporter''s report counts as corroborated');
select is((my_contribution() ->> 'points')::integer, 10, 'a corroborated report earns 10 points, sending alone earns none');

select set_config('request.jwt.claim.sub', '3c000000-0000-4000-8000-000000000004', true);
select witness_report('3c100000-0000-4000-8000-000000000001', 'gone', 36.70, 4.05);
select set_config('request.jwt.claim.sub', '3c000000-0000-4000-8000-000000000005', true);
select witness_report('3c100000-0000-4000-8000-000000000001', 'gone', 36.70, 4.05);
select set_config('request.jwt.claim.sub', '3c000000-0000-4000-8000-000000000006', true);
select witness_report('3c100000-0000-4000-8000-000000000001', 'gone', 36.70, 4.05);
select set_config('request.jwt.claim.sub', '3c000000-0000-4000-8000-000000000007', true);
select witness_report('3c100000-0000-4000-8000-000000000001', 'gone', 36.70, 4.05);
select set_config('request.jwt.claim.sub', '3c000000-0000-4000-8000-000000000008', true);
select witness_report('3c100000-0000-4000-8000-000000000001', 'gone', 36.70, 4.05);
reset role;

select isnt((select flagged_at from citizen_reports where id = '3c100000-0000-4000-8000-000000000001'), null,
  'many "gone" votes flag the report for moderation');
select set_config('request.jwt.claim.sub', '3c000000-0000-4000-8000-000000000009', true);
select is((select count from admin_attention_counts() where item = 'citizen_reports'), (select n + 2 from attention_baseline),
  'a flagged report comes back to the moderators (the private one was deleted above)');
select is((select count(*) from hazard_reports where id = '3c100000-0000-4000-8000-000000000001'), 1::bigint,
  '"gone" votes never hide a hazard: a false all-clear kills');

update citizen_reports set status = 'rejected' where id = '3c100000-0000-4000-8000-000000000001';
select is((select count(*) from hazard_reports where id = '3c100000-0000-4000-8000-000000000001'), 0::bigint,
  'a moderator rejection removes it');

select * from finish();
rollback;
