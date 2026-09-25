begin;
set local search_path = public, extensions;
select plan(4);

create temp table w as select id from admin_units where level = 'wilaya' order by code limit 1;
insert into onm_vigilance(cap_id,title,event,severity,urgency,certainty,onset,expires,sent,area_desc,wilaya_id)
select v.cap, 't', v.event, v.severity, 'Expected', 'Likely', '2026-09-01T12:00:00Z', '2026-09-01T20:00:00Z', v.sent, 'a', (select id from w)
from (values
  ('h1','Thunderstorm','Moderate','2026-09-01T06:00:00Z'::timestamptz),
  ('h2','Thunderstorm','Moderate','2026-09-01T06:40:00Z'::timestamptz),
  ('h3','Thunderstorm','Severe','2026-09-01T07:00:00Z'::timestamptz)
) as v(cap,event,severity,sent);

select is((select count(*) from onm_warning_history where wilaya_id = (select id from w) and starts_at = '2026-09-01T12:00:00Z'),
  2::bigint, 'a re-issued warning counts once; a new severity counts separately');
select is((select id from onm_warning_history where wilaya_id = (select id from w) and severity = 'Moderate' and starts_at = '2026-09-01T12:00:00Z'),
  (select id from onm_vigilance where cap_id = 'h1'), 'the first issue stands for its re-issues');

set local role anon;
select lives_ok($$select * from onm_warning_history limit 1$$, 'visitors can read the history');
select is((select count(*) from onm_warning_history where starts_at = '2026-09-01T12:00:00Z'), 2::bigint,
  'visitors see the same history as the base table allows');
reset role;

select * from finish();
rollback;
