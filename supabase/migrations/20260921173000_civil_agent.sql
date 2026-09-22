create table public.civil_investigations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.ita_reports(id),
  incident_index integer not null check (incident_index between 0 and 19),
  state text not null default 'pending' check (state in ('pending','processing','hold','publish','discard','review','failed','superseded','expired')),
  attempts integer not null default 0 check (attempts>=0),
  failures integer not null default 0 check (failures between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  job_id uuid references public.source_jobs(id),
  job_attempt integer,
  error text,
  updated_at timestamptz not null default now(),
  unique(report_id,incident_index)
);
create index civil_investigations_due on public.civil_investigations(next_attempt_at) where state in ('pending','processing','hold','failed');
create table public.civil_decisions (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.civil_investigations(id),
  attempt integer not null,
  decision jsonb not null check (jsonb_typeof(decision)='object'),
  trace jsonb not null check (jsonb_typeof(trace)='array'),
  model text not null check (length(model) between 1 and 200),
  version text not null check (version='civil-agent-v1'),
  source_extraction jsonb not null,
  publication_id uuid references public.civil_publications(id),
  created_at timestamptz not null default clock_timestamp(),
  unique(investigation_id,attempt)
);
create index civil_decisions_publication on public.civil_decisions(publication_id) where publication_id is not null;
alter table public.civil_investigations enable row level security;
alter table public.civil_decisions enable row level security;
revoke all on public.civil_investigations, public.civil_decisions from public,anon,authenticated,service_role;
grant select on public.civil_investigations, public.civil_decisions to authenticated,service_role;
create policy civil_investigations_operator on public.civil_investigations for select to authenticated using(public.has_role((select auth.uid()),'admin') or public.has_role((select auth.uid()),'operator'));
create policy civil_decisions_operator on public.civil_decisions for select to authenticated using(public.has_role((select auth.uid()),'admin') or public.has_role((select auth.uid()),'operator'));
create function public.protect_civil_decision() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='55000',message='civil_decision_is_immutable'; end;
$$;
revoke all on function public.protect_civil_decision() from public,anon,authenticated,service_role;
create trigger civil_decision_immutable before update or delete on public.civil_decisions for each row execute function public.protect_civil_decision();

alter table public.civil_publication_revisions alter column actor_id drop not null;
alter table public.civil_publication_revisions add column actor_kind text not null default 'human' check (actor_kind in ('human','agent'));
alter table public.civil_publication_revisions add constraint civil_revision_actor check ((actor_kind='human' and actor_id is not null) or (actor_kind='agent' and actor_id is null));

create function public.claim_civil_investigations(_job uuid,_attempt integer,_limit integer default 2)
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
  return query update public.civil_investigations w set state='processing',attempts=w.attempts+1,
    next_attempt_at=clock_timestamp()+interval '5 minutes',job_id=_job,job_attempt=_attempt,error=null,updated_at=clock_timestamp()
    where w.id in(select x.id from public.civil_investigations x where x.state in ('pending','processing','hold','failed')
      and x.next_attempt_at<=clock_timestamp() order by x.next_attempt_at,x.id
      limit greatest(0,least(_limit,2)) for update skip locked) returning w.*;
end;
$$;
revoke all on function public.claim_civil_investigations(uuid,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.claim_civil_investigations(uuid,integer,integer) to service_role;

create function public.finish_civil_investigation(_job uuid,_attempt integer,_id uuid,_investigation_attempt integer,_result jsonb,_error text)
returns void language plpgsql security definer set search_path='' as $$
declare
  w public.civil_investigations;
  r public.ita_reports;
  p public.civil_publications;
  d jsonb;
  expiry timestamptz;
  outcome text;
begin
  perform public.assert_ita_source_lease(_job,_attempt);
  select * into w from public.civil_investigations where id=_id for update;
  if not found or w.state<>'processing' or w.job_id is distinct from _job or w.job_attempt is distinct from _attempt or w.attempts is distinct from _investigation_attempt then
    raise exception using errcode='55000',message='civil_investigation_claim_lost';
  end if;
  if (_result is null)=(_error is null) then raise exception using errcode='22023',message='civil_result_required'; end if;
  if _error is not null then
    update public.civil_investigations set state='failed',failures=least(failures+1,5),
      error=left(_error,500),next_attempt_at=clock_timestamp()+make_interval(secs=>300*power(2,least(failures,4))::integer),updated_at=clock_timestamp() where id=_id;
    return;
  end if;
  select * into r from public.ita_reports where id=w.report_id;
  perform pg_advisory_xact_lock(hashtextextended(r.source_page || ':' || r.source_post_id,0));
  select * into r from public.ita_reports where id=w.report_id for update;
  if exists(select 1 from public.ita_reports newer where newer.source_page=r.source_page and newer.source_post_id=r.source_post_id and (newer.fetched_at,newer.id)>(r.fetched_at,r.id)) then
    update public.civil_investigations set state='superseded',updated_at=clock_timestamp() where id=_id;
    return;
  end if;
  d:=_result->'decision'; outcome:=d->>'outcome';
  if outcome is null or outcome not in ('publish','hold','discard','review') or length(btrim(coalesce(d->>'reason',''))) not between 1 and 2000
    or jsonb_typeof(_result->'trace') is distinct from 'array' or jsonb_array_length(_result->'trace')>8
    or length(coalesce(_result->>'model','')) not between 1 and 200 or _result->>'version' is distinct from 'civil-agent-v1' then
    raise exception using errcode='22023',message='civil_decision_invalid';
  end if;
  if d->>'area_id' is not null and not exists(select 1 from jsonb_array_elements(_result->'trace') t,
    lateral jsonb_array_elements(t->'results') a where t->>'action'='search_areas' and (a->>'id'=d->>'area_id' or a->>'parent_id'=d->>'area_id')) then
    raise exception using errcode='22023',message='civil_area_not_in_evidence';
  end if;
  if d->>'location_evidence' is not null and (length(d->>'location_evidence')=0 or strpos(regexp_replace(r.body,'\s+',' ','g'),d->>'location_evidence')=0) then
    raise exception using errcode='22023',message='civil_location_quote_invalid';
  end if;
  if d->>'duplicate_id' is not null and (outcome<>'discard' or not exists(select 1 from jsonb_array_elements(_result->'trace') t,
    lateral jsonb_array_elements(t->'results') x where t->>'action'='recent_publications' and x->>'id'=d->>'duplicate_id')
    or not exists(select 1 from public.civil_publications where id=(d->>'duplicate_id')::uuid)) then
    raise exception using errcode='22023',message='civil_duplicate_invalid';
  end if;
  select * into p from public.civil_publications where ita_report_id=w.report_id and incident_index=w.incident_index;
  if found then outcome:='superseded';
  elsif outcome='publish' then
    if exists(select 1 from public.civil_publications existing join public.ita_reports prior on prior.id=existing.ita_report_id
      where prior.source_page=r.source_page and prior.source_post_id=r.source_post_id and prior.id<>r.id) then
      raise exception using errcode='55000',message='civil_source_revision_requires_reconciliation';
    end if;
    expiry:=(d->>'expires_at')::timestamptz;
    if expiry is null or not isfinite(expiry) or expiry<=clock_timestamp() or expiry>r.published_at+interval '72 hours'
      or r.published_at>clock_timestamp()+interval '5 minutes' or d->>'area_id' is null or d->>'location_evidence' is null then
      raise exception using errcode='22023',message='civil_publication_invalid_validity';
    end if;
    insert into public.civil_publications(ita_report_id,incident_index,hazard,summary,area_id,source_name,source_url,source_published_at,expires_at)
      values(r.id,w.incident_index,d->>'hazard',d->>'summary',(d->>'area_id')::uuid,'Info Trafic Algérie',r.source_url,r.published_at,expiry)
      returning * into p;
    insert into public.civil_publication_revisions(publication_id,revision,actor_id,actor_kind,reason,action,new_payload)
      values(p.id,p.revision,null,'agent',d->>'reason','publish',to_jsonb(p));
  end if;
  insert into public.civil_decisions(investigation_id,attempt,decision,trace,model,version,source_extraction,publication_id)
    values(w.id,w.attempts,d,_result->'trace',_result->>'model',_result->>'version',r.extraction,p.id);
  update public.civil_investigations set state=outcome,failures=0,next_attempt_at=clock_timestamp()+interval '30 minutes',error=null,updated_at=clock_timestamp() where id=_id;
end;
$$;
revoke all on function public.finish_civil_investigation(uuid,integer,uuid,integer,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.finish_civil_investigation(uuid,integer,uuid,integer,jsonb,text) to service_role;

create or replace function public.publish_ita_publication(
  _report_id uuid,_incident_index integer,_hazard text,_summary text,_area_id uuid,_expires_at timestamptz,_reason text
) returns public.civil_publications language plpgsql security definer set search_path='' as $$
declare
  _actor uuid:=auth.uid();
  _source public.ita_reports;
  _row public.civil_publications;
  _prior public.civil_publications;
  _incident jsonb;
  _now timestamptz:=clock_timestamp();
begin
  if _actor is null or not (public.has_role(_actor,'admin') or public.has_role(_actor,'operator')) then
    raise exception using errcode='42501',message='civil_publication_role_required';
  end if;
  if _reason is null or length(btrim(_reason)) not between 1 and 2000 then
    raise exception using errcode='22023',message='civil_publication_reason_required';
  end if;
  select * into _source from public.ita_reports where id=_report_id;
  if not found then raise exception using errcode='22023',message='civil_publication_source_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(_source.source_page || ':' || _source.source_post_id,0));
  select * into _source from public.ita_reports where id=_report_id for share;
  if exists(select 1 from public.ita_reports newer where newer.source_page=_source.source_page and newer.source_post_id=_source.source_post_id
    and (newer.fetched_at,newer.id)>(_source.fetched_at,_source.id)) then
    raise exception using errcode='55000',message='civil_source_revision_requires_reconciliation';
  end if;

  if _source.extraction->>'disposition' is distinct from 'incident_report'
     or jsonb_typeof(_source.extraction->'incidents') is distinct from 'array'
     or _incident_index is null or _incident_index<0 or _incident_index>=jsonb_array_length(_source.extraction->'incidents') then
    raise exception using errcode='22023',message='civil_publication_incident_required';
  end if;
  _incident:=_source.extraction->'incidents'->_incident_index;
  if jsonb_typeof(_incident) is distinct from 'object'
     or coalesce(_incident->>'kind','') not in ('collision','roadworks','congestion','road_hazard','flooding','fire','weather','other')
     or nullif(btrim(_incident->>'summary_fr'),'') is null
     or nullif(btrim(_incident->>'evidence'),'') is null then
    raise exception using errcode='22023',message='civil_publication_incident_required';
  end if;
  if not isfinite(_source.published_at) or _source.published_at<_now-interval '72 hours'
     or _source.published_at>_now+interval '5 minutes'
     or _expires_at is null or not isfinite(_expires_at) or _expires_at<=_now
     or _expires_at>least(_now+interval '72 hours',_source.published_at+interval '72 hours') then
    raise exception using errcode='22023',message='civil_publication_invalid_validity';
  end if;
  for _prior in select p.* from public.civil_publications p join public.ita_reports r on r.id=p.ita_report_id
    where r.source_page=_source.source_page and r.source_post_id=_source.source_post_id and r.id<>_source.id and p.state='published' for update of p loop
    update public.civil_publications set state='withdrawn',revision=revision+1,updated_at=clock_timestamp(),
      cap_references=cap_references || jsonb_build_array(jsonb_build_object('revision',_prior.revision,'sent',_prior.updated_at))
      where id=_prior.id returning * into _row;
    insert into public.civil_publication_revisions(publication_id,revision,actor_id,reason,action,prior_payload,new_payload)
      values(_row.id,_row.revision,_actor,left('Source correction: ' || btrim(_reason),2000),'withdraw',to_jsonb(_prior),to_jsonb(_row));
  end loop;
  insert into public.civil_publications(ita_report_id,incident_index,hazard,summary,area_id,source_name,source_url,source_published_at,expires_at,published_at,updated_at)
  values (_report_id,_incident_index,_hazard,btrim(_summary),_area_id,'Info Trafic Algérie',_source.source_url,_source.published_at,_expires_at,_now,_now)
  returning * into _row;
  insert into public.civil_publication_revisions(publication_id,revision,actor_id,reason,action,prior_payload,new_payload)
  values (_row.id,_row.revision,_actor,btrim(_reason),'publish',null,to_jsonb(_row));
  return _row;
end;
$$;

create or replace function public.save_ita_feed(_job uuid, _attempt integer, _posts jsonb, _etag text, _not_modified boolean)
returns integer language plpgsql security invoker set search_path = '' as $$
declare _inserted integer := 0; _identity text;
begin
  perform public.assert_ita_source_lease(_job,_attempt);
  if not _not_modified then
    for _identity in select distinct p->>'source_page' || ':' || (p->>'source_post_id') from jsonb_array_elements(_posts) p order by 1 loop
      perform pg_advisory_xact_lock(hashtextextended(_identity,0));
    end loop;
    insert into public.ita_reports(source_post_id,source_page,source_url,published_at,content_hash,body,raw)
    select p.source_post_id,p.source_page,p.source_url,p.published_at,p.content_hash,p.body,p.raw
      from jsonb_to_recordset(_posts) as p(source_post_id text,source_page text,source_url text,published_at timestamptz,content_hash text,body text,raw jsonb)
      on conflict(source_page,source_post_id,content_hash) do nothing;
    get diagnostics _inserted = row_count;
    update public.ita_feed_state set etag=_etag,checked_at=clock_timestamp() where singleton;
  else
    update public.ita_feed_state set checked_at=clock_timestamp() where singleton;
  end if;
  return _inserted;
end;
$$;
