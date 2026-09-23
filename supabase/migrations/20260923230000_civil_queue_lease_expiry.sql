create function public.civil_lease(_hazard text) returns interval
language sql immutable set search_path='' as $$
  select case _hazard when 'road' then interval '2 hours' when 'fire' then interval '3 hours' else interval '6 hours' end
$$;
revoke all on function public.civil_lease(text) from public,anon,authenticated;

create or replace function public.claim_civil_investigations(_job uuid,_attempt integer,_limit integer default 2)
returns setof public.civil_investigations language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_ita_source_lease(_job,_attempt);
  insert into public.civil_investigations(report_id,incident_index)
    select r.id,i.n::integer-1 from public.ita_reports r,
      lateral jsonb_array_elements(case when jsonb_typeof(r.extraction->'incidents')='array' then r.extraction->'incidents' else '[]'::jsonb end) with ordinality i(value,n)
    where r.extraction->>'disposition'='incident_report' and i.n<=20
      and r.published_at>clock_timestamp()-interval '72 hours' and r.published_at<=clock_timestamp()+interval '5 minutes'
      and not exists(select 1 from public.ita_reports newer where newer.source_page=r.source_page and newer.source_post_id=r.source_post_id and (newer.fetched_at,newer.id)>(r.fetched_at,r.id))
      and not exists(select 1 from public.civil_publications p where p.ita_report_id=r.id and p.incident_index=i.n-1)
    on conflict(report_id,incident_index) do nothing;
  update public.civil_investigations w set state='superseded',updated_at=clock_timestamp()
    where w.state in ('pending','processing','hold','failed','review') and exists(
      select 1 from public.civil_publications p where p.ita_report_id=w.report_id and p.incident_index=w.incident_index);
  update public.civil_investigations w set state='superseded',updated_at=clock_timestamp()
    from public.ita_reports r where w.report_id=r.id and w.state in ('pending','processing','hold','failed','review')
    and exists(select 1 from public.ita_reports newer where newer.source_page=r.source_page and newer.source_post_id=r.source_post_id and (newer.fetched_at,newer.id)>(r.fetched_at,r.id));
  update public.civil_investigations w set state='expired',updated_at=clock_timestamp()
    from public.ita_reports r where w.report_id=r.id and r.published_at<=clock_timestamp()-interval '72 hours'
    and w.state in ('pending','processing','hold','failed','review');
  -- past its lease nothing is publishable; an unknown kind falls to the longest lease
  update public.civil_investigations w set state='expired',updated_at=clock_timestamp()
    from public.ita_reports r where w.report_id=r.id and w.state in ('pending','hold','failed','review')
    and r.published_at+public.civil_lease(coalesce(
      (select d.decision->>'hazard' from public.civil_decisions d where d.investigation_id=w.id order by d.attempt desc limit 1),
      case r.extraction->'incidents'->w.incident_index->>'kind'
        when 'collision' then 'road' when 'roadworks' then 'road' when 'congestion' then 'road' when 'road_hazard' then 'road'
        when 'fire' then 'fire' when 'flooding' then 'flood' when 'weather' then 'weather' else 'other' end))<=clock_timestamp();
  return query update public.civil_investigations w set state='processing',attempts=w.attempts+1,
    next_attempt_at=clock_timestamp()+interval '5 minutes',job_id=_job,job_attempt=_attempt,error=null,updated_at=clock_timestamp()
    where w.id in(select x.id from public.civil_investigations x where x.state in ('pending','processing','hold','failed')
      and x.next_attempt_at<=clock_timestamp() order by x.next_attempt_at,x.id
      limit greatest(0,least(_limit,2)) for update skip locked) returning w.*;
end;
$$;
