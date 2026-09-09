alter table public.document_extractions drop constraint document_extractions_attempts_check;
alter table public.document_extractions alter column attempts set default 0;
alter table public.document_extractions add constraint document_extractions_attempts_check check(attempts>=0);

create function public.queue_text_document()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.document_extractions(document_id,attempts) values(new.id,0);
  return new;
end;
$$;
revoke all on function public.queue_text_document() from public,anon,authenticated;
create trigger queue_text_document after insert on public.source_documents
for each row execute function public.queue_text_document();

insert into public.document_extractions(document_id,attempts,last_error)
select d.id,0,'historical document without completed interpretation'
from public.source_documents d where not exists(select 1 from public.incident_mentions m where m.document_id=d.id)
on conflict(document_id) do nothing;
update public.source_contracts set lease_seconds=greatest(lease_seconds,600)
where key in(select key from public.text_sources);

create function public.write_text_source(_key text,_operation text,_payload jsonb,_job uuid default null,_attempt integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  _source uuid; _inserted boolean; _item jsonb; _result jsonb:='[]'; _doc public.source_documents;
  _mention public.incident_mentions; _existing public.incident_mentions;
  _incident public.official_incidents; _id uuid; _n integer; _total integer:=0; _asof timestamptz;
begin
  select id into strict _source from public.text_sources where key=_key and enabled;
  perform pg_advisory_xact_lock(hashtextextended(_key,531));
  if _job is not null then
    perform 1 from public.source_job_leases where contract_key=_key and job_id=_job and attempt=_attempt
      and lease_expires_at>clock_timestamp() for update;
    if not found then raise exception using errcode='55000',message='text_source_lease_lost'; end if;
  elsif _attempt is not null or exists(select 1 from public.source_job_leases where contract_key=_key and lease_expires_at>clock_timestamp()) then
    raise exception using errcode='55000',message='text_source_lease_required';
  end if;
  if _operation='documents' then
    for _item in select value from jsonb_array_elements(_payload) loop
      _doc:=jsonb_populate_record(null::public.source_documents,_item);
      if _doc.text_source_id is distinct from _source then raise exception 'text_source_mismatch'; end if;
      insert into public.source_documents(text_source_id,external_id,url,published_at,content_hash,body)
      values(_source,_doc.external_id,_doc.url,_doc.published_at,_doc.content_hash,_doc.body)
      on conflict(text_source_id,external_id) do nothing returning * into _doc;
      if found then _result:=_result||jsonb_build_array(to_jsonb(_doc)); end if;
    end loop;
  elsif _operation='mentions' then
    for _item in select value from jsonb_array_elements(_payload) loop
      _mention:=jsonb_populate_record(null::public.incident_mentions,_item);
      perform 1 from public.source_documents where id=_mention.document_id and text_source_id=_source for update;
      if not found or _mention.text_source_id is distinct from _source then raise exception 'text_source_mismatch'; end if;
      select * into _existing from public.incident_mentions where document_id=_mention.document_id
        and commune_id is not distinct from _mention.commune_id and wilaya_id=_mention.wilaya_id and kind=_mention.kind order by created_at,id limit 1;
      _inserted:=not found;
      if _inserted then
        insert into public.incident_mentions(document_id,text_source_id,wilaya_id,commune_id,place_text,kind,status,fire_count,as_of,precision,evidence,extractor)
        values(_mention.document_id,_source,_mention.wilaya_id,_mention.commune_id,_mention.place_text,_mention.kind,_mention.status,_mention.fire_count,_mention.as_of,_mention.precision,_mention.evidence,_mention.extractor)
        returning * into _existing;
      end if;
      _result:=_result||jsonb_build_array(to_jsonb(_existing)||jsonb_build_object('inserted',_inserted));
    end loop;
  elsif _operation='apply_mention' then
    select * into strict _mention from public.incident_mentions where id=(_payload->>'mentionId')::uuid and text_source_id=_source for update;
    if _mention.incident_id is not null then return jsonb_build_object('id',_mention.incident_id,'applied',false); end if;
    if _payload ? 'incidentId' then
      _id:=(_payload->>'incidentId')::uuid;
      select * into strict _incident from public.official_incidents where id=_id for update;
      if coalesce(_incident.commune_id,_incident.wilaya_id)<>coalesce(_mention.commune_id,_mention.wilaya_id) or _incident.kind<>_mention.kind then
        raise exception 'incident_area_mismatch';
      end if;
      if _mention.as_of<_incident.as_of then
        perform public.bump_official_incident(_id,jsonb_build_object(
          'first_reported_at',least(_incident.first_reported_at,_mention.as_of),
          'last_reported_at',greatest(_incident.last_reported_at,_mention.as_of)));
      else
        perform public.bump_official_incident(_id,_payload->'update');
      end if;
      update public.official_incidents set unlisted_at=null where id=_id and _mention.as_of>=unlisted_at;
    else
      _incident:=jsonb_populate_record(null::public.official_incidents,_payload->'insert');
      if _incident.latest_mention_id is distinct from _mention.id then raise exception 'incident_mention_mismatch'; end if;
      insert into public.official_incidents(wilaya_id,commune_id,kind,status,precision,authority_tier,place_text,first_reported_at,last_reported_at,as_of,latest_mention_id,evidence)
      values(_incident.wilaya_id,_incident.commune_id,_incident.kind,_incident.status,_incident.precision,_incident.authority_tier,_incident.place_text,_incident.first_reported_at,_incident.last_reported_at,_incident.as_of,_mention.id,_incident.evidence)
      returning id into _id;
    end if;
    update public.incident_mentions set incident_id=_id where id=_mention.id;
    return jsonb_build_object('id',_id,'applied',true);
  elsif _operation='failure' then
    perform 1 from public.source_documents where id=(_payload->>'documentId')::uuid and text_source_id=_source;
    if not found then raise exception 'text_source_mismatch'; end if;
    insert into public.document_extractions(document_id,attempts,last_error)
    values((_payload->>'documentId')::uuid,1,left(_payload->>'message',500))
    on conflict(document_id) do update set attempts=document_extractions.attempts+1,last_error=excluded.last_error,updated_at=clock_timestamp();
  elsif _operation='complete' then
    delete from public.document_extractions e using public.source_documents d
    where e.document_id=d.id and d.id=(_payload->>'documentId')::uuid and d.text_source_id=_source;
  elsif _operation='confirm' then
    for _item in select value from jsonb_array_elements(_payload) loop
      select * into strict _mention from public.incident_mentions where id=(_item->>'mentionId')::uuid and text_source_id=_source;
      if _mention.commune_id is null or _mention.commune_id is distinct from (_item->>'communeId')::uuid then raise exception 'confirmation_area_mismatch'; end if;
      _asof:=(_item->>'asOf')::timestamptz;
      update public.fire_clusters set confirmed_at=_asof,confirmed_mention_id=_mention.id
      where commune_id=_mention.commune_id and confirmed_at is null and state<>'false_positive'
        and first_detected_at<=_asof+interval '24 hours' and last_detected_at>=_asof-interval '24 hours';
      get diagnostics _n=row_count; _total:=_total+_n;
    end loop;
    return to_jsonb(_total);
  elsif _operation='unlist' then
    update public.official_incidents set unlisted_at=(_payload->>'asOf')::timestamptz
    where id in(select value::uuid from jsonb_array_elements_text(_payload->'ids'))
      and last_reported_at<(_payload->>'asOf')::timestamptz and unlisted_at is null;
  else raise exception 'unknown_text_source_operation';
  end if;
  return _result;
end;
$$;
revoke all on function public.write_text_source(text,text,jsonb,uuid,integer) from public,anon,authenticated;
grant execute on function public.write_text_source(text,text,jsonb,uuid,integer) to service_role;

alter table public.ita_reports add column extraction_requeued_at timestamptz;
create function public.retry_ita_report(_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare _row public.ita_reports; _actor uuid:=auth.uid();
begin
  if _actor is null or not public.has_role(_actor,'admin') then raise exception using errcode='42501',message='admin_role_required'; end if;
  perform 1 from public.source_job_leases where contract_key='ita_website' and lease_expires_at>clock_timestamp() for update;
  if found then raise exception using errcode='55000',message='ita_extraction_in_progress'; end if;
  select * into strict _row from public.ita_reports where id=_id for update;
  if _row.extraction is not null or _row.extraction_attempts<5 then raise exception using errcode='55000',message='ita_report_not_exhausted'; end if;
  if _row.extraction_requeued_at>clock_timestamp()-interval '1 day' then raise exception using errcode='55000',message='ita_retry_cooldown'; end if;
  update public.ita_reports set extraction_attempts=0,next_extraction_at=clock_timestamp(),extraction_requeued_at=clock_timestamp() where id=_id;
  perform public.record_admin_audit('sources','ita.retry','ita_reports',_id::text,jsonb_build_object('attempts',_row.extraction_attempts),'{"attempts":0}');
end;
$$;
revoke all on function public.retry_ita_report(uuid) from public,anon;
grant execute on function public.retry_ita_report(uuid) to authenticated;

-- Rollback: remove new callers first, then functions/trigger; keep pending markers and retry timestamps as recovery evidence.
