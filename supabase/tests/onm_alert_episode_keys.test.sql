begin;
set local search_path = public, extensions;
select plan(10);

create function pg_temp.warn(_cap text, _event text, _severity text, _onset interval, _expires interval, _sent interval)
returns void language sql as $$
  insert into public.onm_vigilance(cap_id,title,event,severity,urgency,certainty,onset,expires,sent,area_desc)
  values (_cap, _event, _event, _severity, 'Expected', 'Likely', now() + _onset, now() + _expires, now() + _sent, 'EPTEST')
$$;
create function pg_temp.key(_cap text) returns text language sql as $$
  select episode_id || ':' || episode_peak from public.onm_vigilance where cap_id = _cap
$$;

select pg_temp.warn('ep-first', 'Rain', 'Moderate', '0 hours', '6 hours', '-2 hours');
select pg_temp.warn('ep-renewal', 'Rain', 'Moderate', '3 hours', '9 hours', '-1 hour');
select pg_temp.warn('ep-raised', 'Rain', 'Severe', '4 hours', '10 hours', '0 hours');
select pg_temp.warn('ep-lowered', 'Rain', 'Moderate', '5 hours', '11 hours', '1 hour');
select pg_temp.warn('ep-early-onset', 'Rain', 'Moderate', '-1 hour', '2 hours', '2 hours');
select pg_temp.warn('ep-later', 'Rain', 'Moderate', '30 hours', '36 hours', '3 hours');
select pg_temp.warn('ep-wind', 'Wind', 'Moderate', '0 hours', '6 hours', '0 hours');

select is(pg_temp.key('ep-renewal'), pg_temp.key('ep-first'),
  'a renewal with a later onset keeps the key, so it stays silent');
select isnt(pg_temp.key('ep-raised'), pg_temp.key('ep-first'), 'a raised severity alerts again');
select is(pg_temp.key('ep-lowered'), pg_temp.key('ep-raised'), 'a lowered severity does not alert again');
select is(pg_temp.key('ep-early-onset'), pg_temp.key('ep-first'),
  'a warning sent later with an earlier onset keeps its episode and an already used key');
select isnt(pg_temp.key('ep-later'), pg_temp.key('ep-first'), 'a warning after a gap opens a new episode');
select isnt(pg_temp.key('ep-wind'), pg_temp.key('ep-first'), 'another event is another episode');

select pg_temp.warn('heat-' || d, 'Heat', 'Severe', make_interval(days => d), make_interval(days => d, hours => 30),
  make_interval(days => d)) from generate_series(0, 11) d;
select is((select count(distinct episode_id || ':' || episode_peak) from public.onm_vigilance where cap_id like 'heat-%'),
  1::bigint, 'a heatwave renewed daily for twelve days stays one episode');

insert into public.onm_vigilance(cap_id,title,event,severity,urgency,certainty,onset,expires,sent,area_desc) values
  ('batch-1','Dust','Dust','Moderate','Expected','Likely',now(),now()+interval '6 hours',now()-interval '1 hour','EPTEST'),
  ('batch-2','Dust','Dust','Moderate','Expected','Likely',now()+interval '3 hours',now()+interval '9 hours',now(),'EPTEST')
  on conflict (cap_id) do update set title = excluded.title;
select is(pg_temp.key('batch-2'), pg_temp.key('batch-1'),
  'a renewal arriving in the same feed batch as its predecessor joins its episode');

select is((select episode_peak from public.onm_vigilance where cap_id = 'ep-first'), 2::smallint,
  'the first warning of an episode carries its own severity');

insert into public.onm_vigilance(cap_id,title,event,severity,urgency,certainty,onset,expires,sent,area_desc)
  values ('ep-first','Rain again','Rain','Extreme','Expected','Likely',now(),now()+interval '6 hours',now(),'EPTEST')
  on conflict (cap_id) do update set title = excluded.title;
select is(pg_temp.key('ep-first'), (select episode_id || ':2' from public.onm_vigilance where cap_id = 'ep-first'),
  'refreshing a stored warning from the feed never moves its episode');

select * from finish();
rollback;
