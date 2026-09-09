alter table public.document_extractions add column requeued_at timestamptz;
grant select on public.document_extractions to authenticated;
create policy document_extractions_admin_read on public.document_extractions for select to authenticated
using(public.has_role(auth.uid(),'admin'));

create function public.retry_text_document(_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare _actor uuid:=auth.uid(); _key text; _row public.document_extractions;
begin
  if _actor is null or not public.has_role(_actor,'admin') then
    raise exception using errcode='42501',message='admin_role_required';
  end if;
  select s.key into strict _key from public.source_documents d join public.text_sources s on s.id=d.text_source_id where d.id=_id;
  perform pg_advisory_xact_lock(hashtextextended(_key,531));
  perform 1 from public.source_job_leases where contract_key=_key and lease_expires_at>clock_timestamp() for update;
  if found then raise exception using errcode='55000',message='text_extraction_in_progress'; end if;
  select * into _row from public.document_extractions where document_id=_id for update;
  if not found or _row.attempts<4 then raise exception using errcode='55000',message='text_document_not_exhausted'; end if;
  if _row.requeued_at>clock_timestamp()-interval '1 day' then raise exception using errcode='55000',message='text_retry_cooldown'; end if;
  update public.document_extractions set attempts=0,updated_at=clock_timestamp(),requeued_at=clock_timestamp() where document_id=_id;
  perform public.record_admin_audit('sources','text.retry','source_documents',_id::text,jsonb_build_object('attempts',_row.attempts),'{"attempts":0}');
end;
$$;
revoke all on function public.retry_text_document(uuid) from public,anon;
grant execute on function public.retry_text_document(uuid) to authenticated;
-- Rollback: remove recovery UI, revoke authenticated SELECT, drop policy/function; retain requeued_at as audit evidence.
