create view public.hazard_history with (security_invoker = true) as
select c.id, 'fire'::text as hazard, c.first_detected_at as at, c.wilaya_id,
  c.short_id, coalesce(c.est_area_ha, 0)::double precision as area_ha, c.state,
  null::text as event, null::text as severity, null::text as summary
from public.fire_clusters as c
where c.state in ('active', 'unconfirmed', 'contained_guess', 'extinguished')
union all
select w.id, 'weather', w.starts_at, w.wilaya_id,
  null, 0, null, w.event, w.severity, null
from public.onm_warning_history as w
union all
select p.id, 'road', p.published_at,
  case when a.level = 'wilaya' then a.id else a.parent_id end,
  null, 0, null, null, null, p.summary
from public.civil_publications as p
left join public.admin_units as a on a.id = p.area_id
where p.hazard = 'road' and p.state = 'published';
grant select on public.hazard_history to anon, authenticated;

-- mirrors the page's rules: UTC year filter, Algiers local day (UTC+1) buckets, weekly up to 120 days
create function public.hazard_history_summary(
  _hazard text default null,
  _wilaya uuid default null,
  _year integer default null,
  _official_kinds text[] default '{}',
  _now timestamptz default now()
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with everything as (
    select * from public.hazard_history
  ), records as (
    select h.*
    from everything as h
    where (_hazard is null or h.hazard = _hazard)
      and (_wilaya is null or h.wilaya_id = _wilaya)
      and (_year is null or extract(year from h.at at time zone 'UTC') = _year)
  ), span as (
    select
      min(at) as first,
      greatest(max(at), _now) as last,
      _now - min(at) <= interval '120 days' as weekly
    from records
  ), keyed as (
    select r.*, date_trunc(case when s.weekly then 'week' else 'month' end,
      (r.at at time zone 'UTC') + interval '1 hour')::date as bucket
    from records as r cross join span as s
  ), series as (
    select g::date as start
    from span as s,
      generate_series(
        date_trunc(case when s.weekly then 'week' else 'month' end, (s.first at time zone 'UTC') + interval '1 hour'),
        date_trunc(case when s.weekly then 'week' else 'month' end, (s.last at time zone 'UTC') + interval '1 hour'),
        case when s.weekly then interval '7 days' else interval '1 month' end
      ) as g
    where s.first is not null
  ), bucket_rows as (
    select se.start,
      count(k.id) filter (where k.hazard = 'fire') as fire,
      count(k.id) filter (where k.hazard = 'weather') as weather,
      count(k.id) filter (where k.hazard = 'road') as road,
      coalesce(sum(k.area_ha), 0) as burned
    from series as se
    left join keyed as k on k.bucket = se.start
    group by se.start
  ), tallies as (
    select r.wilaya_id,
      count(*) filter (where r.hazard = 'fire') as fire,
      count(*) filter (where r.hazard = 'weather') as weather,
      count(*) filter (where r.hazard = 'road') as road,
      count(*) as total,
      sum(r.area_ha) as burned,
      max(r.at) as latest
    from records as r
    join public.admin_units as u on u.id = r.wilaya_id and u.level = 'wilaya'
    group by r.wilaya_id
  ), ranked as (
    select * from tallies
    order by case when _hazard = 'fire' then burned else total::double precision end desc, latest desc
    limit 10
  )
  select jsonb_build_object(
    'total', (select count(*) from records),
    'fires', (select count(*) from records where hazard = 'fire'),
    'burnedHa', (select coalesce(sum(area_ha), 0) from records),
    'granularity', coalesce((select case when weekly then 'week' else 'month' end from span where first is not null), 'week'),
    'buckets', coalesce((select jsonb_agg(jsonb_build_object(
        'start', to_char(start, 'YYYY-MM-DD'), 'fire', fire, 'weather', weather, 'road', road, 'burnedHa', burned)
        order by start) from bucket_rows), '[]'::jsonb),
    'ranking', coalesce((select jsonb_agg(jsonb_build_object(
        'wilayaId', wilaya_id, 'fire', fire, 'weather', weather, 'road', road, 'total', total, 'burnedHa', burned)
        order by case when _hazard = 'fire' then burned else total::double precision end desc, latest desc)
        from ranked), '[]'::jsonb),
    'unlocated', (select count(*) from records as r
      where not exists (select 1 from public.admin_units as u where u.id = r.wilaya_id and u.level = 'wilaya')),
    'events', coalesce((select jsonb_object_agg(event, n) from (
        select event, count(*) as n from records where hazard = 'weather' group by event) as e), '{}'::jsonb),
    'severities', coalesce((select jsonb_object_agg(severity, n) from (
        select severity, count(*) as n from records where hazard = 'weather' group by severity) as s), '{}'::jsonb),
    'coverage', coalesce((select jsonb_object_agg(hazard, first) from (
        select hazard, min(at) as first from everything group by hazard) as c), '{}'::jsonb),
    'years', coalesce((select jsonb_agg(y order by y desc) from (
        select distinct extract(year from at at time zone 'UTC')::integer as y from everything) as ys), '[]'::jsonb),
    'official', (select count(*) from public.official_incidents as o
      where o.kind = any (_official_kinds) and o.unlisted_at is null
        and (_wilaya is null or o.wilaya_id = _wilaya)
        and (_year is null or extract(year from o.first_reported_at at time zone 'UTC') = _year))
  )
$$;
grant execute on function public.hazard_history_summary(text, uuid, integer, text[], timestamptz) to anon, authenticated;
