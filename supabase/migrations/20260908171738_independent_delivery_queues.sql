create table public.delivery_channel_settings (
  channel text primary key check (channel in ('fcm', 'telegram')),
  paused boolean not null default false
);
insert into public.delivery_channel_settings(channel) values ('fcm'), ('telegram');

create table public.broadcast_delivery_queue (
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  channel text not null references public.delivery_channel_settings(channel),
  state text not null default 'pending' check (state in ('pending','leased','delivered','expired')),
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  primary key(broadcast_id, channel),
  check ((state = 'leased') = (lease_token is not null and lease_until is not null))
);
create index delivery_queue_due on public.broadcast_delivery_queue(channel, next_attempt_at, created_at)
  where state in ('pending','leased');

create function public.enqueue_broadcast_delivery() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
  insert into public.broadcast_delivery_queue(broadcast_id, channel, created_at, expires_at, state)
  values
    (new.id, 'fcm', new.created_at, new.created_at + interval '24 hours', case when new.fcm_delivered_at is null then 'pending' else 'delivered' end),
    (new.id, 'telegram', new.created_at, new.created_at + interval '24 hours', case when new.telegram_delivered_at is null then 'pending' else 'delivered' end)
  on conflict do nothing;
  end if;
  if new.fcm_delivered_at is not null and (tg_op='INSERT' or old.fcm_delivered_at is distinct from new.fcm_delivered_at) then
    update public.broadcast_delivery_queue set state='delivered', lease_token=null, lease_until=null, last_error=null
      where broadcast_id=new.id and channel='fcm';
  end if;
  if new.telegram_delivered_at is not null and (tg_op='INSERT' or old.telegram_delivered_at is distinct from new.telegram_delivered_at) then
    update public.broadcast_delivery_queue set state='delivered', lease_token=null, lease_until=null, last_error=null
      where broadcast_id=new.id and channel='telegram';
  end if;
  return new;
end;
$$;
create trigger enqueue_delivery after insert or update of fcm_delivered_at, telegram_delivered_at
  on public.broadcasts for each row execute function public.enqueue_broadcast_delivery();

insert into public.broadcast_delivery_queue(broadcast_id, channel, created_at, expires_at)
select b.id, c.channel, b.created_at, b.created_at + interval '24 hours'
from public.broadcasts b cross join public.delivery_channel_settings c
where b.created_at > now() - interval '24 hours'
  and ((c.channel='fcm' and b.fcm_delivered_at is null) or (c.channel='telegram' and b.telegram_delivered_at is null));

create function public.claim_broadcast_delivery(_channel text, _limit integer default 20)
returns table(job jsonb) language plpgsql security definer set search_path = '' as $$
begin
  if _limit < 1 or _limit > 100 then raise exception 'invalid_delivery_limit'; end if;
  if not exists(select 1 from public.delivery_channel_settings where channel=_channel and not paused)
    or not exists(select 1 from public.broadcast_settings where id=true and enabled) then return; end if;
  update public.broadcast_delivery_queue set state='expired', lease_token=null, lease_until=null,
    last_error=coalesce(last_error, 'delivery_expired')
  where channel=_channel and state in ('pending','leased') and (expires_at<=now() or attempts>=8)
    and (lease_until is null or lease_until<=now());
  return query
  with due as (
    select q.broadcast_id, q.channel from public.broadcast_delivery_queue q
    where q.channel=_channel and q.expires_at>now() and q.attempts<8
      and ((q.state='pending' and q.next_attempt_at<=now()) or (q.state='leased' and q.lease_until<=now()))
    order by q.created_at, q.broadcast_id for update skip locked limit _limit
  ), claimed as (
    update public.broadcast_delivery_queue q set state='leased', attempts=q.attempts+1,
      lease_token=gen_random_uuid(), lease_until=now()+interval '90 seconds'
    from due where q.broadcast_id=due.broadcast_id and q.channel=due.channel returning q.*
  )
  select to_jsonb(b)||jsonb_build_object('lease_token', c.lease_token)
  from claimed c join public.broadcasts b on b.id=c.broadcast_id;
end;
$$;

create function public.renew_broadcast_delivery(_broadcast_id uuid, _channel text, _lease_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.broadcast_delivery_queue q set lease_until=now()+interval '90 seconds'
  where q.broadcast_id=_broadcast_id and q.channel=_channel and q.lease_token=_lease_token
    and q.state='leased' and q.lease_until>now() and q.expires_at>now()
    and exists(select 1 from public.delivery_channel_settings c where c.channel=_channel and not c.paused)
    and exists(select 1 from public.broadcast_settings where id=true and enabled);
  return found;
end;
$$;

create function public.finish_broadcast_delivery(_broadcast_id uuid, _channel text, _lease_token uuid, _count integer, _error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if _count < 0 then raise exception 'invalid_delivery_count'; end if;
  update public.broadcast_delivery_queue q set
    state=case when _count is not null then 'delivered' when q.expires_at<=now() or (q.attempts>=8 and _error is distinct from 'budget_exhausted') then 'expired' else 'pending' end,
    attempts=case when _count is null and _error='budget_exhausted' then greatest(0,q.attempts-1) else q.attempts end,
    next_attempt_at=case when _error='budget_exhausted' then now() else now()+make_interval(secs=>least(900, 30*power(2, least(q.attempts-1, 5)))::integer) end,
    lease_token=null, lease_until=null, last_error=case when _count is null then left(_error,1000) else null end
  where q.broadcast_id=_broadcast_id and q.channel=_channel and q.lease_token=_lease_token
    and q.state='leased' and q.lease_until>now();
  if not found then return false; end if;
  if _count is not null then
    if _channel='fcm' then
      update public.broadcasts set fcm_delivered_at=now(), fcm_topics=_count where id=_broadcast_id;
    else
      update public.broadcasts set telegram_delivered_at=now(), telegram_channels=_count where id=_broadcast_id;
    end if;
  end if;
  return true;
end;
$$;

create table public.operational_incidents (
  id uuid primary key default gen_random_uuid(),
  contract_key text not null,
  reason_code text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz
);
create unique index operational_incident_open on public.operational_incidents(contract_key,reason_code) where resolved_at is null;

alter table public.delivery_channel_settings enable row level security;
alter table public.broadcast_delivery_queue enable row level security;
alter table public.operational_incidents enable row level security;
revoke all on public.delivery_channel_settings, public.broadcast_delivery_queue, public.operational_incidents from public, anon, authenticated, service_role;
grant select on public.delivery_channel_settings, public.broadcast_delivery_queue, public.operational_incidents to authenticated, service_role;
create policy operator_read_channels on public.delivery_channel_settings for select to authenticated
  using (public.has_any_role(auth.uid(), array['operator','admin']::public.app_role[]));
create policy operator_read_delivery_queue on public.broadcast_delivery_queue for select to authenticated
  using (public.has_any_role(auth.uid(), array['operator','admin']::public.app_role[]));
create policy operator_read_operational_incidents on public.operational_incidents for select to authenticated
  using (public.has_any_role(auth.uid(), array['operator','admin']::public.app_role[]));

create function public.set_delivery_channel_paused(_channel text, _paused boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare previous boolean;
begin
  if not public.has_any_role(auth.uid(),array['operator','admin']::public.app_role[]) then
    raise insufficient_privilege using message='operator_role_required'; end if;
  select paused into strict previous from public.delivery_channel_settings where channel=_channel for update;
  if previous=_paused then return; end if;
  update public.delivery_channel_settings set paused=_paused where channel=_channel;
  perform public.record_admin_audit('broadcasts',case when _paused then 'channel.pause' else 'channel.resume' end,'delivery_channel_settings',_channel,
    jsonb_build_object('paused',previous),jsonb_build_object('paused',_paused));
end;
$$;

create function public.acknowledge_operational_incident(_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_any_role(auth.uid(),array['operator','admin']::public.app_role[]) then
    raise insufficient_privilege using message='operator_role_required'; end if;
  update public.operational_incidents set acknowledged_at=now(),acknowledged_by=auth.uid()
    where id=_id and acknowledged_at is null and resolved_at is null;
  if found then perform public.record_admin_audit('sources','incident.acknowledge','operational_incidents',_id::text); end if;
end;
$$;

revoke all on function public.enqueue_broadcast_delivery() from public, anon, authenticated, service_role;
revoke all on function public.claim_broadcast_delivery(text,integer), public.renew_broadcast_delivery(uuid,text,uuid), public.finish_broadcast_delivery(uuid,text,uuid,integer,text) from public, anon, authenticated, service_role;
grant execute on function public.claim_broadcast_delivery(text,integer), public.renew_broadcast_delivery(uuid,text,uuid), public.finish_broadcast_delivery(uuid,text,uuid,integer,text) to service_role;
revoke all on function public.set_delivery_channel_paused(text,boolean), public.acknowledge_operational_incident(uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_delivery_channel_paused(text,boolean), public.acknowledge_operational_incident(uuid) to authenticated;
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
group by q.channel;

create view public.delivery_queue_health with (security_invoker=true) as
select c.channel,c.paused,
  count(q.broadcast_id) filter(where q.state in ('pending','leased')) as pending_count,
  count(q.broadcast_id) filter(where q.state='expired') as expired_count,
  min(q.created_at) filter(where q.state in ('pending','leased')) as oldest_pending_at
from public.delivery_channel_settings c left join public.broadcast_delivery_queue q using(channel)
group by c.channel,c.paused;
revoke all on public.delivery_queue_health from public,anon,authenticated,service_role;
grant select on public.delivery_queue_health to authenticated,service_role;

create function public.refresh_operational_incidents() returns void
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(8120917);
  insert into public.operational_incidents(contract_key,reason_code)
    select distinct contract_key,issue_code from public.source_watchdog
  on conflict(contract_key,reason_code) where resolved_at is null
    do update set last_seen_at=now();
  update public.operational_incidents i set resolved_at=now()
    where resolved_at is null and not exists(
      select 1 from public.source_watchdog w where w.contract_key=i.contract_key and w.issue_code=i.reason_code);
end;
$$;
revoke all on function public.refresh_operational_incidents() from public,anon,authenticated,service_role;
grant execute on function public.refresh_operational_incidents() to service_role;

grant select(id,contract_key,data_from,data_through,state,replay_count,detected_at) on public.source_gaps to authenticated;
create policy operator_read_source_gaps on public.source_gaps for select to authenticated
  using(public.has_any_role(auth.uid(),array['operator','admin']::public.app_role[]));
