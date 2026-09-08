create table public.ita_reports (
  id uuid primary key default gen_random_uuid(),
  source_post_id text not null,
  source_page text not null,
  source_url text not null,
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  body text not null,
  raw jsonb not null,
  extraction jsonb,
  extraction_error text,
  extraction_attempts integer not null default 0 check (extraction_attempts between 0 and 5),
  extracted_at timestamptz,
  next_extraction_at timestamptz not null default now(),
  unique(source_page, source_post_id, content_hash)
);
create index ita_reports_fetched_idx on public.ita_reports(fetched_at desc);
create index ita_reports_pending_idx on public.ita_reports(next_extraction_at, fetched_at)
  where extraction is null and extraction_attempts < 5;
alter table public.ita_reports enable row level security;
revoke all on public.ita_reports from public, anon, authenticated, service_role;
grant select on public.ita_reports to authenticated;
grant select, insert, update on public.ita_reports to service_role;
create policy ita_reports_operator_read on public.ita_reports for select to authenticated
  using (public.has_role((select auth.uid()), 'admin') or public.has_role((select auth.uid()), 'operator'));

create function public.protect_ita_source()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if row(new.id,new.source_post_id,new.source_page,new.source_url,new.published_at,new.fetched_at,new.content_hash,new.body,new.raw)
    is distinct from row(old.id,old.source_post_id,old.source_page,old.source_url,old.published_at,old.fetched_at,old.content_hash,old.body,old.raw) then
    raise exception using errcode='55000', message='ita_source_is_immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_ita_source() from public, anon, authenticated;
create trigger protect_ita_source before update on public.ita_reports
  for each row execute function public.protect_ita_source();

create table public.ita_feed_state (
  singleton boolean primary key default true check(singleton),
  etag text,
  checked_at timestamptz
);
insert into public.ita_feed_state(singleton) values(true);
alter table public.ita_feed_state enable row level security;
revoke all on public.ita_feed_state from public, anon, authenticated, service_role;
grant select, update on public.ita_feed_state to service_role;

create function public.assert_ita_source_lease(_job uuid, _attempt integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.source_job_leases
    where contract_key='ita_website' and job_id=_job and attempt=_attempt
      and lease_expires_at > clock_timestamp() for update;
  if not found then
    raise exception using errcode='55000', message='ita_source_lease_lost';
  end if;
end;
$$;
revoke all on function public.assert_ita_source_lease(uuid,integer) from public, anon, authenticated;
grant execute on function public.assert_ita_source_lease(uuid,integer) to service_role;

create function public.save_ita_feed(_job uuid, _attempt integer, _posts jsonb, _etag text, _not_modified boolean)
returns integer language plpgsql security invoker set search_path = '' as $$
declare _inserted integer := 0;
begin
  perform public.assert_ita_source_lease(_job,_attempt);
  if not _not_modified then
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
revoke all on function public.save_ita_feed(uuid,integer,jsonb,text,boolean) from public, anon, authenticated;
grant execute on function public.save_ita_feed(uuid,integer,jsonb,text,boolean) to service_role;

create function public.claim_ita_extractions(_job uuid, _attempt integer, _limit integer default 5)
returns setof public.ita_reports language plpgsql security invoker set search_path = '' as $$
begin
  perform public.assert_ita_source_lease(_job,_attempt);
  return query
    update public.ita_reports as r set
      extraction_attempts=r.extraction_attempts+1,
      next_extraction_at=clock_timestamp()+make_interval(secs=>300 * power(2,r.extraction_attempts)::integer)
    where r.id in (
      select p.id from public.ita_reports p
      where p.extraction is null and p.extraction_attempts<5 and p.next_extraction_at<=clock_timestamp()
      order by p.fetched_at,p.id limit greatest(0,least(_limit,5)) for update skip locked
    ) returning r.*;
end;
$$;
revoke all on function public.claim_ita_extractions(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.claim_ita_extractions(uuid,integer,integer) to service_role;

create function public.finish_ita_extraction(_job uuid, _attempt integer, _id uuid, _extraction jsonb, _error text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.assert_ita_source_lease(_job,_attempt);
  if (_extraction is null) = (_error is null) then
    raise exception using errcode='22023',message='ita_extraction_result_required';
  end if;
  update public.ita_reports set extraction=_extraction,extraction_error=left(_error,500),
    extracted_at=case when _extraction is not null then clock_timestamp() else null end
    where id=_id and extraction is null and extraction_attempts>0;
  if not found then
    raise exception using errcode='55000',message='ita_extraction_not_pending';
  end if;
end;
$$;
revoke all on function public.finish_ita_extraction(uuid,integer,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.finish_ita_extraction(uuid,integer,uuid,jsonb,text) to service_role;

alter table public.source_contracts drop constraint source_contracts_family_check;
alter table public.source_contracts add constraint source_contracts_family_check check (
  family in ('fire_detection','detection_processing','official_warnings','official_text','civil_information','fire_danger','broadcast_delivery','reference_enrichment')
);
insert into public.source_contracts(key,version,label,family,criticality,freshness_basis,cadence_minutes,
  warning_after_minutes,stale_after_minutes,parser_version,licence,attribution,owner,execution_target,lease_seconds,
  retry_base_seconds,retry_window_minutes)
values('ita_website',1,'Info Trafic Algérie — website','civil_information','supporting','last_success_at',5,
  15,30,'ita-llm-v1','Public website; publisher rights retained','Info Trafic Algérie — ITA','Nadhir maintainers','cloudflare',300,300,30);
insert into public.source_checkpoints(contract_key) values('ita_website');

-- Rollback: pause ita_website and roll back its worker first; retain evidence tables until exported.
-- Remove contract after dependent jobs/runs/checkpoints, then functions and tables; evidence removal is destructive.
