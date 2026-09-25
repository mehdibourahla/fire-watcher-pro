-- Protection Civile also reports floods, cut roads, collapses and storm damage; those kinds never confirm a fire
alter table public.official_incidents
  drop constraint official_incidents_kind_check,
  add constraint official_incidents_kind_check check (kind in (
    'vegetation', 'agricultural', 'urban', 'unknown', 'flood', 'road', 'structure', 'storm', 'other')),
  drop constraint official_incidents_status_check,
  add constraint official_incidents_status_check check (status in (
    'ongoing', 'contained', 'extinguished', 'monitoring', 'unknown', 'cleared'));

alter table public.incident_mentions
  drop constraint incident_mentions_kind_check,
  add constraint incident_mentions_kind_check check (kind in (
    'vegetation', 'agricultural', 'urban', 'unknown', 'flood', 'road', 'structure', 'storm', 'other')),
  drop constraint incident_mentions_status_check,
  add constraint incident_mentions_status_check check (status in (
    'ongoing', 'contained', 'extinguished', 'monitoring', 'unknown', 'cleared'));

create or replace view public.official_incident_recall_daily
with (security_invoker = true)
as
with resolved as (
  select
    m.id,
    m.commune_id,
    (m.as_of at time zone 'Africa/Algiers')::date as day,
    exists (
      select 1 from public.fire_clusters c
      where c.commune_id = m.commune_id
        and c.first_detected_at <= m.as_of + interval '24 hours'
        and c.last_detected_at >= m.as_of - interval '24 hours'
    ) as hit
  from public.incident_mentions m
  where m.commune_id is not null
    and m.kind in ('vegetation', 'agricultural', 'urban', 'unknown')
)
select
  day,
  count(*)::integer as mentions,
  count(distinct commune_id)::integer as communes,
  count(distinct commune_id) filter (where hit)::integer as with_cluster
from resolved
group by day
order by day desc;

-- the authority's own advice attached to an ONM bulletin it relays, kept verbatim
create table public.official_weather_advice (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.source_documents(id),
  advice text not null check (char_length(advice) between 8 and 1000),
  wilaya_ids uuid[] not null check (cardinality(wilaya_ids) > 0),
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now()
);
alter table public.official_weather_advice enable row level security;
revoke all on public.official_weather_advice from public, anon, authenticated;
grant select on public.official_weather_advice to anon, authenticated;
create policy "public read official weather advice" on public.official_weather_advice
  for select using (true);
create index official_weather_advice_validity_idx on public.official_weather_advice (valid_to);

-- non-fire mentions keep their place apart, never confirm a fire and are never unlisted by a fire bulletin
create or replace function public.write_text_source(_key text,_operation text,_payload jsonb,_job uuid default null,_attempt integer default null)
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
        and commune_id is not distinct from _mention.commune_id and wilaya_id=_mention.wilaya_id and kind=_mention.kind
        and (kind in ('vegetation','agricultural','urban','unknown') or place_text is not distinct from _mention.place_text) order by created_at,id limit 1;
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
      if _mention.kind not in ('vegetation','agricultural','urban','unknown') then raise exception 'confirmation_kind_mismatch'; end if;
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
      and last_reported_at<(_payload->>'asOf')::timestamptz and unlisted_at is null and kind in ('vegetation','agricultural','urban','unknown');
  elsif _operation='advice' then
    perform 1 from public.source_documents where id=(_payload->>'documentId')::uuid and text_source_id=_source;
    if not found then raise exception 'text_source_mismatch'; end if;
    insert into public.official_weather_advice(document_id,advice,wilaya_ids,valid_from,valid_to)
    values((_payload->>'documentId')::uuid,_payload->>'advice',
      array(select value::uuid from jsonb_array_elements_text(_payload->'wilayaIds')),
      (_payload->>'validFrom')::timestamptz,(_payload->>'validTo')::timestamptz)
    on conflict(document_id) do nothing;
  else raise exception 'unknown_text_source_operation';
  end if;
  return _result;
end;
$$;
