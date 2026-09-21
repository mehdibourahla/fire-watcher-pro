alter table public.civil_decisions drop constraint civil_decisions_version_check;
alter table public.civil_decisions add constraint civil_decisions_version_check check(version in ('civil-agent-v1','civil-agent-v2'));

create function public.search_civil_official_evidence(_query text default null,_area uuid default null)
returns table(id uuid,mention_id uuid,evidence text,status text,as_of timestamptz,kind text,place_text text,
  wilaya_id uuid,commune_id uuid,source_url text,source_published_at timestamptz)
language sql stable security invoker set search_path='' as $$
  select i.id,m.id,m.evidence,i.status,i.as_of,i.kind,i.place_text,i.wilaya_id,i.commune_id,d.url,d.published_at
    from public.official_incidents i join public.incident_mentions m on m.id=i.latest_mention_id
    join public.source_documents d on d.id=m.document_id join public.text_sources s on s.id=m.text_source_id
    where s.key='dgpc_telegram' and m.incident_id=i.id and d.text_source_id=s.id and i.unlisted_at is null
      and i.last_reported_at>now()-interval '72 hours' and i.as_of<=now()+interval '5 minutes'
      and (_area is null or i.wilaya_id=_area or i.commune_id=_area)
      and (nullif(btrim(_query),'') is null or strpos(lower(coalesce(i.place_text,'') || ' ' || m.evidence),lower(left(btrim(_query),100)))>0)
    order by i.last_reported_at desc,i.id limit 10;
$$;
revoke all on function public.search_civil_official_evidence(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.search_civil_official_evidence(text,uuid) to service_role;

create or replace function public.finish_civil_investigation(_job uuid,_attempt integer,_id uuid,_investigation_attempt integer,_result jsonb,_error text)
returns void language plpgsql security definer set search_path='' as $$
declare
  w public.civil_investigations;
  r public.ita_reports;
  p public.civil_publications;
  d jsonb;
  expiry timestamptz;
  outcome text;
  match jsonb;
  observed jsonb;
  official public.official_incidents;
  mention public.incident_mentions;
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
    or length(coalesce(_result->>'model','')) not between 1 and 200 or coalesce(_result->>'version','') not in ('civil-agent-v1','civil-agent-v2') then
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
  match:=nullif(d->'official_match','null'::jsonb);
  if match is not null then
    if jsonb_typeof(match) is distinct from 'object' or coalesce(match->>'relationship','') not in ('duplicate','context','conflict')
      or length(btrim(coalesce(match->>'reason',''))) not between 1 and 2000
      or length(coalesce(match->>'source_quote','')) not between 1 and 2000
      or length(coalesce(match->>'official_quote','')) not between 1 and 2000
      or (match->>'relationship'='duplicate' and outcome<>'discard') then
      raise exception using errcode='22023',message='civil_official_match_invalid';
    end if;
    select x into observed from jsonb_array_elements(_result->'trace') t,
      lateral jsonb_array_elements(t->'results') x where t->>'action'='official_reports'
      and x->>'id'=match->>'incident_id' and x->>'mention_id'=match->>'mention_id' limit 1;
    if observed is null then raise exception using errcode='22023',message='civil_official_not_observed'; end if;
    select * into official from public.official_incidents where id=(match->>'incident_id')::uuid for share;
    if not found or official.unlisted_at is not null or official.latest_mention_id is distinct from (match->>'mention_id')::uuid
      or official.as_of is distinct from (observed->>'as_of')::timestamptz
      or official.status is distinct from observed->>'status'
      or official.kind is distinct from observed->>'kind'
      or official.place_text is distinct from observed->>'place_text'
      or official.wilaya_id is distinct from (observed->>'wilaya_id')::uuid
      or official.commune_id is distinct from (observed->>'commune_id')::uuid
      or official.last_reported_at<=clock_timestamp()-interval '72 hours' then
      raise exception using errcode='55000',message='civil_official_evidence_changed';
    end if;
    select m.* into mention from public.incident_mentions m join public.text_sources s on s.id=m.text_source_id
      where m.id=official.latest_mention_id and m.incident_id=official.id and s.key='dgpc_telegram' for share of m;
    if not found or mention.evidence is distinct from observed->>'evidence'
      or strpos(regexp_replace(mention.evidence,'\s+',' ','g'),match->>'official_quote')=0
      or strpos(regexp_replace(r.body,'\s+',' ','g'),match->>'source_quote')=0 then
      raise exception using errcode='22023',message='civil_official_quote_invalid';
    end if;
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
