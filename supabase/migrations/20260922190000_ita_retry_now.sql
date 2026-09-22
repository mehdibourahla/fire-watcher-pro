create or replace function public.retry_ita_report(_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  _row public.ita_reports; _actor uuid:=auth.uid();
  _contract public.source_contracts; _now timestamptz:=clock_timestamp();
  _job uuid:=gen_random_uuid();
begin
  if _actor is null or not public.has_role(_actor,'admin') then
    raise exception using errcode='42501',message='admin_role_required';
  end if;
  select * into strict _contract from public.source_contracts where key='ita_website' for share;
  if not _contract.enabled then raise exception using errcode='55000',message='ita_source_paused'; end if;
  perform 1 from public.source_job_leases where contract_key='ita_website' and lease_expires_at>clock_timestamp() for update;
  if found then raise exception using errcode='55000',message='ita_extraction_in_progress'; end if;
  select * into strict _row from public.ita_reports where id=_id for update;
  -- A worker may have acquired its lease while we waited for the report row.
  if exists(select 1 from public.source_job_leases where contract_key='ita_website' and lease_expires_at>clock_timestamp()) then
    raise exception using errcode='55000',message='ita_extraction_in_progress';
  end if;
  _now:=clock_timestamp();
  if _row.extraction is not null or _row.extraction_attempts=0 or _row.extraction_error is null then
    raise exception using errcode='55000',message='ita_report_not_retryable';
  end if;
  if _row.extraction_attempts>=5 and _row.extraction_requeued_at>_now-interval '1 day' then
    raise exception using errcode='55000',message='ita_retry_cooldown';
  end if;
  if _row.extraction_attempts<5 and _row.next_extraction_at<=_now then
    raise exception using errcode='55000',message='ita_retry_already_queued';
  end if;
  update public.ita_reports set
    extraction_attempts=case when extraction_attempts>=5 then 0 else extraction_attempts end,
    next_extraction_at=_now,extraction_requeued_at=_now
  where id=_id;
  insert into public.source_jobs(id,contract_key,contract_version,trigger_kind,idempotency_key,
    scheduled_for,data_from,data_through,execution_target,enqueued_by,available_at,
    max_attempts,retry_base_seconds,retry_until)
  values(_job,_contract.key,_contract.version,'manual','ita-retry:'||_job,
    _now,_now-make_interval(mins=>_contract.cadence_minutes),_now,_contract.execution_target,
    array['manual'],_now,_contract.max_attempts,_contract.retry_base_seconds,
    _now+make_interval(mins=>_contract.retry_window_minutes));
  perform public.record_admin_audit('sources','ita.retry','ita_reports',_id::text,
    jsonb_build_object('attempts',_row.extraction_attempts,'next_extraction_at',_row.next_extraction_at),
    jsonb_build_object('attempts',case when _row.extraction_attempts>=5 then 0 else _row.extraction_attempts end,'job_id',_job,'next_extraction_at',_now));
end;
$$;
revoke all on function public.retry_ita_report(uuid) from public,anon;
grant execute on function public.retry_ita_report(uuid) to authenticated;
