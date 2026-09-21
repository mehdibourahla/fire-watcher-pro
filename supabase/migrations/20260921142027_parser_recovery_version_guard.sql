drop function public.prepare_source_recovery(text,uuid,integer);
create function public.prepare_source_recovery(_key text,_job uuid,_attempt integer,_parser_version text default null) returns integer
language plpgsql security definer set search_path='' as $$
declare _version text; _runtime_version text; _count integer:=0; _source uuid;
begin
  perform 1 from public.source_job_leases where contract_key=_key and job_id=_job and attempt=_attempt
    and lease_expires_at>clock_timestamp() for update;
  if not found then raise exception 'source_recovery_lease_lost'; end if;
  select parser_version into strict _version from public.source_contracts where key=_key and enabled;
  if _version is null then raise exception 'source_recovery_version_missing'; end if;
  -- Pre-upgrade workers omit their version. They must not spend the new parser's recovery budget.
  _runtime_version:=coalesce(_parser_version,case _key
    when 'ita_website' then 'ita-extract-v2'
    when 'dgpc_telegram' then 'dgpc-extract-v2'
    else _version end);
  if _runtime_version is distinct from _version then raise exception 'source_recovery_version_mismatch'; end if;
  if _key='ita_website' then
    with replay as (insert into public.source_recovery_events(contract_key,subject_id,previous_attempts,previous_error,from_version,to_version)
      select _key,id,extraction_attempts,extraction_error,recovery_version,_version from public.ita_reports
      where extraction is null and extraction_attempts>=5 and recovery_version<>_version
      on conflict do nothing returning subject_id)
    update public.ita_reports set extraction_attempts=0,next_extraction_at=clock_timestamp()
      where id in(select subject_id from replay);
    get diagnostics _count=row_count;
    update public.ita_reports set recovery_version=_version
      where extraction is null and recovery_version<>_version;
  else
    select id into strict _source from public.text_sources where key=_key and enabled;
    with replay as (insert into public.source_recovery_events(contract_key,subject_id,previous_attempts,previous_error,from_version,to_version)
      select _key,e.document_id,e.attempts,e.last_error,e.recovery_version,_version
      from public.document_extractions e join public.source_documents d on d.id=e.document_id
      where d.text_source_id=_source and e.attempts>=4 and e.recovery_version<>_version
      on conflict do nothing returning subject_id)
    update public.document_extractions set attempts=0,next_attempt_at=clock_timestamp()
      where document_id in(select subject_id from replay);
    get diagnostics _count=row_count;
    update public.document_extractions e set recovery_version=_version
      from public.source_documents d where d.id=e.document_id and d.text_source_id=_source and e.recovery_version<>_version;
  end if;
  return _count;
end;
$$;
revoke all on function public.prepare_source_recovery(text,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.prepare_source_recovery(text,uuid,integer,text) to service_role;

update public.source_contracts set parser_version='ita-extract-v3' where key='ita_website';
update public.source_contracts set parser_version='dgpc-extract-v3' where key='dgpc_telegram';
