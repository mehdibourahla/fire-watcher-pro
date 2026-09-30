begin;
set local search_path = public, extensions;
select plan(40);

insert into auth.users (id, email) values
  ('9f5a0000-0000-4000-8000-000000000001', 'author@example.invalid'),
  ('9f5a0000-0000-4000-8000-000000000002', 'flagger@example.invalid'),
  ('9f5a0000-0000-4000-8000-000000000003', 'other@example.invalid'),
  ('9f5a0000-0000-4000-8000-000000000004', 'blocker@example.invalid'),
  ('9f5a0000-0000-4000-8000-000000000005', 'held@example.invalid'),
  ('9f5a0000-0000-4000-8000-000000000009', 'moderator@example.invalid');
insert into user_roles (user_id, role) values ('9f5a0000-0000-4000-8000-000000000009', 'report_moderator');
insert into admin_units (id, level, code, name_ar, name_fr, name_en, lat, lon) values
  ('9f5a2000-0000-4000-8000-000000000001', 'commune', 'flag-near', 'N', 'N', 'N', 36.70, 4.05);

set local role authenticated;
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000001', true);
insert into citizen_reports (id, user_id, lat, lon, kind, status) values
  ('9f5a1000-0000-4000-8000-000000000001', '9f5a0000-0000-4000-8000-000000000001', 36.70, 4.05, 'sighting', 'pending'),
  ('9f5a1000-0000-4000-8000-000000000002', '9f5a0000-0000-4000-8000-000000000001', 36.70, 4.05, 'flooding', 'pending');
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000003', true);
insert into citizen_reports (id, user_id, lat, lon, kind, status, note) values
  ('9f5a1000-0000-4000-8000-000000000003', '9f5a0000-0000-4000-8000-000000000003', 36.70, 4.05, 'flooding', 'pending',
   'still being checked');
insert into citizen_reports (id, user_id, lat, lon, kind, status) values
  ('9f5a1000-0000-4000-8000-000000000004', '9f5a0000-0000-4000-8000-000000000003', 36.70, 4.05, 'road_blocked', 'pending');
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000005', true);
insert into citizen_reports (id, user_id, lat, lon, kind, status, note) values
  ('9f5a1000-0000-4000-8000-000000000005', '9f5a0000-0000-4000-8000-000000000005', 36.70, 4.05, 'flooding', 'pending',
   'held by the checker');
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000009', true);
select moderate_citizen_report('9f5a1000-0000-4000-8000-000000000005', 'approved', null, null);
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000004', true);
insert into citizen_reports (id, user_id, lat, lon, kind, status, user_flagged_at) values
  ('9f5a1000-0000-4000-8000-000000000006', '9f5a0000-0000-4000-8000-000000000004', 36.70, 4.05, 'road_blocked', 'pending',
   now());
reset role;
select is((select user_flagged_at from citizen_reports where id = '9f5a1000-0000-4000-8000-000000000006'), null,
  'a reporter cannot send their own report to the moderators as user-flagged');
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000009', true);
create temp table attention_baseline as
  select count as n from admin_attention_counts() where item = 'citizen_reports';
grant select on attention_baseline to authenticated;

select ok(
  not has_table_privilege('anon', 'public.citizen_report_flags', 'select')
  and not has_table_privilege('authenticated', 'public.citizen_report_flags', 'select')
  and not has_table_privilege('authenticated', 'public.citizen_report_flags', 'insert')
  and not has_table_privilege('anon', 'public.reporter_blocks', 'select')
  and not has_table_privilege('authenticated', 'public.reporter_blocks', 'select')
  and not has_table_privilege('authenticated', 'public.reporter_blocks', 'insert')
  and not has_table_privilege('anon', 'public.user_report_blocks', 'select')
  and not has_table_privilege('authenticated', 'public.user_report_blocks', 'select')
  and not has_table_privilege('authenticated', 'public.user_report_blocks', 'insert'),
  'flags and blocks are reachable only through their functions');
select ok(
  not has_function_privilege('anon', 'public.flag_citizen_report(uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.block_reporter(uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.block_report_author(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.citizen_report_flag_summary(uuid)', 'execute'),
  'visitors cannot call any flag or block function');

set local role anon;
select throws_ok($$select flag_citizen_report('9f5a1000-0000-4000-8000-000000000001', 'false')$$,
  '42501', null, 'a visitor cannot flag');
select throws_ok($$select block_report_author('9f5a1000-0000-4000-8000-000000000001')$$,
  '42501', null, 'a visitor cannot hide an author');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000002', true);
select lives_ok($$select flag_citizen_report('9f5a1000-0000-4000-8000-000000000001', 'false')$$,
  'a signed-in user flags a published report');
select lives_ok($$select flag_citizen_report('9f5a1000-0000-4000-8000-000000000001', 'offensive')$$,
  'flagging the same report again is accepted');
select throws_ok($$select flag_citizen_report('9f5a1000-0000-4000-8000-000000000001', 'spam')$$,
  '22023', 'invalid_flag_reason', 'an unknown reason is refused');
select throws_ok($$select flag_citizen_report('9f5a1000-0000-4000-8000-000000000003', 'false')$$,
  'P0002', 'report_not_open', 'a report the public cannot see cannot be flagged');
select throws_ok($$select citizen_report_flag_summary('9f5a1000-0000-4000-8000-000000000001')$$,
  '42501', 'report_moderator_role_required', 'a member cannot read flags');
select throws_ok($$select block_reporter('9f5a1000-0000-4000-8000-000000000001', 'spam')$$,
  '42501', 'report_moderator_role_required', 'a member cannot block a reporter');
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000001', true);
select throws_ok($$select flag_citizen_report('9f5a1000-0000-4000-8000-000000000001', 'false')$$,
  '22023', 'own_report', 'nobody flags their own report');
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000003', true);
select flag_citizen_report('9f5a1000-0000-4000-8000-000000000001', 'false');
reset role;

select isnt((select user_flagged_at from citizen_reports where id = '9f5a1000-0000-4000-8000-000000000001'), null,
  'a flag sends the report to the moderators');
select is((select flagged_at from citizen_reports where id = '9f5a1000-0000-4000-8000-000000000001'), null,
  'a user flag never touches the witness flag that silences alerts');
select is((select count(*) from citizen_report_flags
           where report_id = '9f5a1000-0000-4000-8000-000000000001'
             and user_id = '9f5a0000-0000-4000-8000-000000000002'), 1::bigint,
  'one flag per person per report, however often they send it');
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000009', true);
select is((select count from admin_attention_counts() where item = 'citizen_reports'), (select n + 1 from attention_baseline),
  'a flagged published report joins the moderators'' queue');
set local role authenticated;
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000003', true);
select lives_ok($$select flag_citizen_report('9f5a1000-0000-4000-8000-000000000005', 'offensive')$$,
  'an approved report the checker held is public, so it can be flagged');
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000009', true);
select is((select count from admin_attention_counts() where item = 'citizen_reports'), (select n + 2 from attention_baseline),
  'a flag brings an approved report back to the moderators');
select moderate_citizen_report('9f5a1000-0000-4000-8000-000000000005', 'approved', null, null);
select is((select count from admin_attention_counts() where item = 'citizen_reports'), (select n + 1 from attention_baseline),
  'a moderator decision clears the user flag');
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000004', true);
select lives_ok($$select flag_citizen_report('9f5a1000-0000-4000-8000-000000000005', 'false')$$,
  'the report can be flagged again after the decision');
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000009', true);
select is((select count from admin_attention_counts() where item = 'citizen_reports'), (select n + 2 from attention_baseline),
  'a new flag after a decision queues the report again');
reset role;
set local role anon;
select is((select count(*) from hazard_reports where id = '9f5a1000-0000-4000-8000-000000000001'), 1::bigint,
  'a flag never hides a hazard: one person cannot take a danger report off the map');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000009', true);
select is((select array_agg(reason || ':' || flags order by reason)
           from citizen_report_flag_summary('9f5a1000-0000-4000-8000-000000000001')),
  array['false:1', 'offensive:1'], 'moderators see how many people flagged it and why');

select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000002', true);
select flag_citizen_report('9f5a1000-0000-4000-8000-000000000001', 'offensive') from generate_series(1, 8);
select throws_ok($$select flag_citizen_report('9f5a1000-0000-4000-8000-000000000001', 'offensive')$$,
  '54000', 'flag_rate_limited', 'flagging is rate limited to 10 an hour');

select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000001', true);
select throws_ok($$select block_report_author('9f5a1000-0000-4000-8000-000000000001')$$,
  '22023', 'own_report', 'nobody hides their own reports');
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000004', true);
select throws_ok($$select block_report_author('9f5a1000-0000-4000-8000-0000000000ff')$$,
  'P0002', 'report_not_found', 'hiding an unknown report is refused');
select lives_ok($$select block_report_author('9f5a1000-0000-4000-8000-000000000002')$$,
  'a signed-in user hides an author through one of their reports');
select lives_ok($$select block_report_author('9f5a1000-0000-4000-8000-000000000002')$$,
  'hiding the same author again is accepted');
select is((select count(*) from hazard_reports where id in ('9f5a1000-0000-4000-8000-000000000001',
           '9f5a1000-0000-4000-8000-000000000002', '9f5a1000-0000-4000-8000-000000000004')), 1::bigint,
  'the blocker no longer sees any report from that author, only other people''s');
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000002', true);
select is((select count(*) from hazard_reports
           where id in ('9f5a1000-0000-4000-8000-000000000001', '9f5a1000-0000-4000-8000-000000000002')), 2::bigint,
  'another user still sees that author''s reports');
reset role;
set local role anon;
select is((select count(*) from hazard_reports
           where id in ('9f5a1000-0000-4000-8000-000000000001', '9f5a1000-0000-4000-8000-000000000002')), 2::bigint,
  'visitors still see that author''s reports');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000009', true);
select throws_ok($$select block_reporter('9f5a1000-0000-4000-8000-0000000000ff', 'spam')$$,
  'P0002', 'report_not_found', 'blocking through an unknown report is refused');
select lives_ok($$select block_reporter('9f5a1000-0000-4000-8000-000000000001', 'repeated false fires')$$,
  'a moderator blocks the reporter behind a report');
reset role;

select is((select status || '/' || coalesce(user_flagged_at::text, 'cleared') from citizen_reports
           where id = '9f5a1000-0000-4000-8000-000000000001'), 'rejected/cleared',
  'blocking rejects the offending report and closes its user flag');
select is((select blocked_by::text || '/' || reason from reporter_blocks
           where user_id = '9f5a0000-0000-4000-8000-000000000001'),
  '9f5a0000-0000-4000-8000-000000000009/repeated false fires', 'the block records who decided it and why');
select is((select string_agg(after ->> 'rejected_reports', ',') from admin_audit
           where action = 'reporter.block' and target_id = '9f5a0000-0000-4000-8000-000000000001'), '2',
  'the block is audited once, with how many reports it rejected');
set local role anon;
select is((select count(*) from hazard_reports where id = '9f5a1000-0000-4000-8000-000000000001'), 0::bigint,
  'the offending report leaves the map');
select is((select count(*) from hazard_reports where id = '9f5a1000-0000-4000-8000-000000000002'), 0::bigint,
  'every other live report by the blocked reporter leaves the map too');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000001', true);
select throws_ok($$insert into citizen_reports (user_id, lat, lon, kind, status)
  values ('9f5a0000-0000-4000-8000-000000000001', 36.70, 4.05, 'flooding', 'pending')$$,
  '42501', 'reporting_blocked', 'a blocked reporter cannot send another report');
select set_config('request.jwt.claim.sub', '9f5a0000-0000-4000-8000-000000000003', true);
select lives_ok($$insert into citizen_reports (user_id, lat, lon, kind, status)
  values ('9f5a0000-0000-4000-8000-000000000003', 36.70, 4.05, 'flooding', 'pending')$$,
  'other reporters are unaffected');
reset role;

select * from finish();
rollback;
