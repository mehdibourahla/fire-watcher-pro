alter table public.document_extractions
  add column next_attempt_at timestamptz not null default now(),
  add column recovery_version text not null default 'legacy';
alter table public.ita_reports add column recovery_version text not null default 'legacy';

create table public.source_recovery_events (
  id uuid primary key default gen_random_uuid(),
  contract_key text not null references public.source_contracts(key),
  subject_id uuid not null,
  previous_attempts integer not null,
  previous_error text,
  from_version text not null,
  to_version text not null,
  created_at timestamptz not null default now(),
  unique(contract_key,subject_id,to_version)
);
alter table public.source_recovery_events enable row level security;
revoke all on public.source_recovery_events from public,anon,authenticated,service_role;
grant select on public.source_recovery_events to service_role;

create function public.delay_text_retry() returns trigger
language plpgsql set search_path='' as $$
begin
  if (tg_op='INSERT' and new.attempts>0) or (tg_op='UPDATE' and new.attempts>old.attempts) then
    new.next_attempt_at:=clock_timestamp()+make_interval(secs=>least(3600,60*power(2,least(new.attempts,6))::integer));
  elsif tg_op='UPDATE' and new.attempts<old.attempts then
    new.next_attempt_at:=clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function public.delay_text_retry() from public,anon,authenticated,service_role;
create trigger delay_text_retry before insert or update of attempts on public.document_extractions
for each row execute function public.delay_text_retry();
create index document_extractions_due_idx on public.document_extractions(next_attempt_at)
where attempts<4;

create function public.prepare_source_recovery(_key text,_job uuid,_attempt integer) returns integer
language plpgsql security definer set search_path='' as $$
declare _version text; _count integer:=0; _source uuid;
begin
  perform 1 from public.source_job_leases where contract_key=_key and job_id=_job and attempt=_attempt
    and lease_expires_at>clock_timestamp() for update;
  if not found then raise exception 'source_recovery_lease_lost'; end if;
  select parser_version into strict _version from public.source_contracts where key=_key and enabled;
  if _version is null then raise exception 'source_recovery_version_missing'; end if;
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
revoke all on function public.prepare_source_recovery(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.prepare_source_recovery(text,uuid,integer) to service_role;

update public.source_contracts set parser_version='ita-extract-v2' where key='ita_website';
update public.source_contracts set parser_version='dgpc-extract-v2' where key='dgpc_telegram';

create index source_captures_success_time_idx on public.source_captures(source_key,fetched_at desc)
where http_status in(200,304) and status in('captured','not_modified');

create function public.source_processing_health()
returns table(key text,collection_at timestamptz,pending bigint,quarantined bigint)
language sql stable security definer set search_path='' as $$
  select c.key,
    (select max(a.fetched_at) from public.source_captures a where a.source_key=c.key
      and a.http_status in(200,304) and a.status in('captured','not_modified')),
    case when c.key='ita_website' then (select count(*) from public.ita_reports where extraction is null and extraction_attempts<5)
      else (select count(*) from public.document_extractions e join public.source_documents d on d.id=e.document_id
        join public.text_sources s on s.id=d.text_source_id where s.key=c.key and e.attempts<4) end,
    case when c.key='ita_website' then (select count(*) from public.ita_reports where extraction is null and extraction_attempts>=5)
      else (select count(*) from public.document_extractions e join public.source_documents d on d.id=e.document_id
        join public.text_sources s on s.id=d.text_source_id where s.key=c.key and e.attempts>=4) end
  from public.source_contracts c where c.enabled
    and (c.key='ita_website' or exists(select 1 from public.text_sources s where s.key=c.key and s.enabled));
$$;
revoke all on function public.source_processing_health() from public;
grant execute on function public.source_processing_health() to anon,authenticated,service_role;

create or replace view public.source_watchdog
with (security_invoker = true)
as
with expected as (
  select
    contract.key as contract_key,
    contract.warning_after_minutes,
    to_timestamp((
      (
        (
          floor(extract(epoch from date_trunc('minute', now())) / 60)::bigint
          - contract.schedule_offset_minutes
        ) / contract.cadence_minutes
      ) * contract.cadence_minutes
      + contract.schedule_offset_minutes
    ) * 60) as expected_for
  from public.source_contracts as contract
  where contract.enabled and contract.schedule_enabled
), missing as (
  select
    expected.contract_key,
    'missing_job'::text as issue_code,
    null::uuid as job_id,
    expected.expected_for as scheduled_for,
    null::timestamptz as lease_expires_at
  from expected
  where not exists (
    select 1
    from public.source_jobs as job
    where job.contract_key = expected.contract_key
      and job.scheduled_for = expected.expected_for
  )
), delayed as (
  select
    job.contract_key,
    'queue_delayed'::text as issue_code,
    job.id as job_id,
    job.scheduled_for,
    lease.lease_expires_at
  from public.source_jobs as job
  join public.source_contracts as contract
    on contract.key = job.contract_key
  left join public.source_job_leases as lease
    on lease.job_id = job.id
  where job.state in ('queued', 'running', 'retry_wait')
    and now() > job.scheduled_for
      + make_interval(mins => contract.warning_after_minutes)
), expired as (
  select
    lease.contract_key,
    'lease_expired'::text as issue_code,
    lease.job_id,
    job.scheduled_for,
    lease.lease_expires_at
  from public.source_job_leases as lease
  join public.source_jobs as job on job.id = lease.job_id
  where lease.lease_expires_at <= now()
), run_delayed as (
  select
    health.key as contract_key,
    'run_delayed'::text as issue_code,
    null::uuid as job_id,
    expected.expected_for as scheduled_for,
    null::timestamptz as lease_expires_at
  from public.source_health as health
  join expected on expected.contract_key = health.key
  where health.state in ('delayed', 'stale', 'unavailable')
)
select *, now() as observed_at from missing
union all
select *, now() as observed_at from delayed
union all
select *, now() as observed_at from expired
union all
select *, now() as observed_at from run_delayed
union all
select 'broadcast_delivery.'||q.channel, 'delivery_backlog', null::uuid, min(q.created_at), min(q.lease_until), now()
from public.broadcast_delivery_queue q join public.delivery_channel_settings c using(channel)
where not c.paused and q.state in ('pending','leased') and q.created_at<now()-interval '15 minutes'
  and exists(select 1 from public.broadcast_settings where id=true and enabled)
group by q.channel
union all
select 'broadcast_delivery.'||q.channel, 'delivery_expired', null::uuid, min(q.created_at), null::timestamptz, now()
from public.broadcast_delivery_queue q where q.state='expired' and q.created_at>now()-interval '7 days'
group by q.channel
union all
select key, 'processing_quarantined', null::uuid, null::timestamptz, null::timestamptz, now()
from public.source_processing_health() where quarantined>0;
