-- Irreversible after publication: roll back access by revoking RPC execution/public SELECT; retain evidence and audit tables.
create table public.civil_publications (
  id uuid primary key default gen_random_uuid(),
  ita_report_id uuid not null references public.ita_reports(id),
  incident_index integer not null check (incident_index between 0 and 19),
  hazard text not null check (hazard in ('fire','weather','flood','road','other')),
  summary text not null check (length(btrim(summary)) between 1 and 2000),
  area_id uuid not null references public.admin_units(id),
  source_name text not null check (source_name='Info Trafic Algérie'),
  source_url text not null,
  source_published_at timestamptz not null,
  expires_at timestamptz not null check (isfinite(expires_at) and expires_at<=source_published_at+interval '72 hours'),
  state text not null default 'published' check (state in ('published','withdrawn')),
  revision integer not null default 1 check (revision>0),
  cap_references jsonb not null default '[]'::jsonb check (jsonb_typeof(cap_references)='array'),
  published_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (ita_report_id,incident_index)
);
create index civil_publications_current_idx on public.civil_publications(expires_at,updated_at desc) where state='published';
create index civil_publications_history_idx on public.civil_publications(updated_at desc,id);
create index civil_publications_area_idx on public.civil_publications(area_id);

create table public.civil_publication_revisions (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.civil_publications(id),
  revision integer not null check (revision>0),
  actor_id uuid not null,
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  action text not null check (action in ('publish','update','withdraw')),
  prior_payload jsonb,
  new_payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (publication_id,revision)
);
alter table public.civil_publications enable row level security;
alter table public.civil_publication_revisions enable row level security;
revoke all on public.civil_publications, public.civil_publication_revisions from public,anon,authenticated,service_role;
grant select on public.civil_publications to anon,authenticated,service_role;
grant select on public.civil_publication_revisions to authenticated;
create policy civil_publications_public_read on public.civil_publications for select to anon,authenticated using (true);
create policy civil_publication_revisions_operator_read on public.civil_publication_revisions for select to authenticated
  using (public.has_role((select auth.uid()),'admin') or public.has_role((select auth.uid()),'operator'));

create function public.protect_civil_publication_history()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_table_name='civil_publication_revisions' or tg_op='DELETE' then
    raise exception using errcode='55000',message='civil_publication_history_is_immutable';
  end if;
  if row(new.id,new.ita_report_id,new.incident_index,new.source_name,new.source_url,new.source_published_at,new.published_at)
    is distinct from row(old.id,old.ita_report_id,old.incident_index,old.source_name,old.source_url,old.source_published_at,old.published_at) then
    raise exception using errcode='55000',message='civil_publication_source_is_immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_civil_publication_history() from public,anon,authenticated,service_role;
create trigger protect_civil_publication_source before update or delete on public.civil_publications
  for each row execute function public.protect_civil_publication_history();
create trigger protect_civil_publication_audit before update or delete on public.civil_publication_revisions
  for each row execute function public.protect_civil_publication_history();

create function public.publish_ita_publication(
  _report_id uuid,_incident_index integer,_hazard text,_summary text,_area_id uuid,_expires_at timestamptz,_reason text
) returns public.civil_publications language plpgsql security definer set search_path='' as $$
declare
  _actor uuid:=auth.uid();
  _source public.ita_reports;
  _row public.civil_publications;
  _incident jsonb;
  _now timestamptz:=clock_timestamp();
begin
  if _actor is null or not (public.has_role(_actor,'admin') or public.has_role(_actor,'operator')) then
    raise exception using errcode='42501',message='civil_publication_role_required';
  end if;
  if _reason is null or length(btrim(_reason)) not between 1 and 2000 then
    raise exception using errcode='22023',message='civil_publication_reason_required';
  end if;
  select * into _source from public.ita_reports where id=_report_id for share;
  if not found then raise exception using errcode='22023',message='civil_publication_source_not_found'; end if;
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
  insert into public.civil_publications(ita_report_id,incident_index,hazard,summary,area_id,source_name,source_url,source_published_at,expires_at,published_at,updated_at)
  values (_report_id,_incident_index,_hazard,btrim(_summary),_area_id,'Info Trafic Algérie',_source.source_url,_source.published_at,_expires_at,_now,_now)
  returning * into _row;
  insert into public.civil_publication_revisions(publication_id,revision,actor_id,reason,action,prior_payload,new_payload)
  values (_row.id,_row.revision,_actor,btrim(_reason),'publish',null,to_jsonb(_row));
  return _row;
end;
$$;

create function public.revise_civil_publication(_id uuid,_expected_revision integer,_action text,_patch jsonb,_reason text)
returns public.civil_publications language plpgsql security definer set search_path='' as $$
declare
  _actor uuid:=auth.uid();
  _before public.civil_publications;
  _row public.civil_publications;
  _now timestamptz:=clock_timestamp();
begin
  if _actor is null or not (public.has_role(_actor,'admin') or public.has_role(_actor,'operator')) then
    raise exception using errcode='42501',message='civil_publication_role_required';
  end if;
  if _reason is null or length(btrim(_reason)) not between 1 and 2000 then
    raise exception using errcode='22023',message='civil_publication_reason_required';
  end if;
  if _action is null or _action not in ('update','withdraw') or jsonb_typeof(_patch) is distinct from 'object' then
    raise exception using errcode='22023',message='civil_publication_invalid_patch';
  end if;
  if exists (select 1 from jsonb_each(_patch) e where e.key not in ('hazard','summary','area_id','expires_at') or jsonb_typeof(e.value)<>'string')
     or (_action='withdraw' and _patch<>'{}'::jsonb) or (_action='update' and _patch='{}'::jsonb) then
    raise exception using errcode='22023',message='civil_publication_invalid_patch';
  end if;
  select * into _before from public.civil_publications where id=_id for update;
  if not found then raise exception using errcode='P0002',message='civil_publication_not_found'; end if;
  if _expected_revision is null or _expected_revision<>_before.revision then
    raise exception using errcode='40001',message='civil_publication_revision_conflict';
  end if;
  if _before.state='withdrawn' then raise exception using errcode='55000',message='civil_publication_withdrawn'; end if;
  _row:=_before;
  if _action='withdraw' then
    _row.state:='withdrawn';
  else
    if _patch ? 'hazard' then _row.hazard:=_patch->>'hazard'; end if;
    if _patch ? 'summary' then _row.summary:=btrim(_patch->>'summary'); end if;
    if _patch ? 'area_id' then _row.area_id:=(_patch->>'area_id')::uuid; end if;
    if _patch ? 'expires_at' then _row.expires_at:=(_patch->>'expires_at')::timestamptz; end if;
    if not isfinite(_row.expires_at) or _row.expires_at<=_now
       or _row.expires_at>least(_now+interval '72 hours',_row.source_published_at+interval '72 hours') then
      raise exception using errcode='22023',message='civil_publication_invalid_validity';
    end if;
  end if;
  update public.civil_publications set hazard=_row.hazard,summary=_row.summary,area_id=_row.area_id,
    expires_at=_row.expires_at,state=_row.state,revision=revision+1,updated_at=clock_timestamp(),
    cap_references=cap_references || jsonb_build_array(jsonb_build_object('revision',_before.revision,'sent',_before.updated_at))
  where id=_id returning * into _row;
  insert into public.civil_publication_revisions(publication_id,revision,actor_id,reason,action,prior_payload,new_payload)
  values (_row.id,_row.revision,_actor,btrim(_reason),_action,to_jsonb(_before),to_jsonb(_row));
  return _row;
end;
$$;
revoke all on function public.publish_ita_publication(uuid,integer,text,text,uuid,timestamptz,text) from public,anon,authenticated,service_role;
revoke all on function public.revise_civil_publication(uuid,integer,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.publish_ita_publication(uuid,integer,text,text,uuid,timestamptz,text) to authenticated;
grant execute on function public.revise_civil_publication(uuid,integer,text,jsonb,text) to authenticated;
