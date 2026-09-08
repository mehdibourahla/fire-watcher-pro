create table public.source_run_retired_keys (
  idempotency_key text primary key,
  retired_at timestamptz not null default now()
);
create table public.source_run_archive_daily (
  day date not null,
  contract_key text not null references public.source_contracts(key),
  outcome text not null,
  runs bigint not null check(runs>0),
  records_seen bigint not null check(records_seen>=0),
  primary key(day,contract_key,outcome)
);
create table public.incident_archive_daily (
  day date not null,
  contract_key text not null,
  reason_code text not null,
  incidents bigint not null check(incidents>0),
  primary key(day,contract_key,reason_code)
);
alter table public.source_run_retired_keys enable row level security;
alter table public.source_run_archive_daily enable row level security;
alter table public.incident_archive_daily enable row level security;
revoke all on public.source_run_retired_keys,public.source_run_archive_daily,public.incident_archive_daily from public,anon,authenticated,service_role;
grant select on public.source_run_retired_keys to service_role;
grant select on public.source_run_archive_daily,public.incident_archive_daily to authenticated,service_role;
create policy operator_read_archived_runs on public.source_run_archive_daily for select to authenticated
using(public.has_any_role(auth.uid(),array['operator','admin']::public.app_role[]));
create policy operator_read_archived_incidents on public.incident_archive_daily for select to authenticated
using(public.has_any_role(auth.uid(),array['operator','admin']::public.app_role[]));

create function public.guard_retired_source_run_key() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Serialize retirement with inserts so an in-flight duplicate cannot reuse a deleted key.
  perform pg_advisory_xact_lock(1800908);
  if new.idempotency_key is not null and exists(select 1 from public.source_run_retired_keys where idempotency_key=new.idempotency_key) then
    raise check_violation using message='retired_source_run_key';
  end if;
  return new;
end;
$$;
create trigger guard_retired_run before insert on public.source_runs for each row execute function public.guard_retired_source_run_key();
revoke all on function public.guard_retired_source_run_key() from public,anon,authenticated,service_role;

create index source_runs_retention on public.source_runs(finished_at,id) where outcome<>'running';
create index incident_retention on public.operational_incidents(resolved_at,id) where resolved_at is not null;

create function public.prune_reliability_history() returns jsonb
language plpgsql security definer set search_path='' as $$
declare removed_runs integer; removed_incidents integer;
begin
  if not pg_try_advisory_xact_lock(1800908) then return jsonb_build_object('busy',true); end if;
  with candidates as (
    select r.id from public.source_runs r
    where r.finished_at<now()-interval '180 days' and r.outcome<>'running'
      and not exists(select 1 from public.source_gaps g where g.resolved_by_run_id=r.id)
    order by r.finished_at,r.id limit 5000 for update of r skip locked
  ), deleted as (
    delete from public.source_runs r using candidates c where r.id=c.id returning r.*
  ), keys as (
    insert into public.source_run_retired_keys(idempotency_key)
      select idempotency_key from deleted where idempotency_key is not null on conflict do nothing
  ), daily as (
    insert into public.source_run_archive_daily(day,contract_key,outcome,runs,records_seen)
      select (started_at at time zone 'UTC')::date,contract_key,outcome,count(*),sum(records_seen)
      from deleted group by 1,2,3
    on conflict(day,contract_key,outcome) do update set
      runs=public.source_run_archive_daily.runs+excluded.runs,
      records_seen=public.source_run_archive_daily.records_seen+excluded.records_seen
  ) select count(*) into removed_runs from deleted;

  with candidates as (
    select id from public.operational_incidents
    where resolved_at<now()-interval '180 days'
    order by resolved_at,id limit 5000 for update skip locked
  ), deleted as (
    delete from public.operational_incidents i using candidates c where i.id=c.id returning i.*
  ), daily as (
    insert into public.incident_archive_daily(day,contract_key,reason_code,incidents)
      select (first_seen_at at time zone 'UTC')::date,contract_key,reason_code,count(*)
      from deleted group by 1,2,3
    on conflict(day,contract_key,reason_code) do update set incidents=public.incident_archive_daily.incidents+excluded.incidents
  ) select count(*) into removed_incidents from deleted;
  if removed_runs+removed_incidents>0 then
    perform public.record_admin_audit('sources','history.prune','source_runs',null,null,
      jsonb_build_object('runs',removed_runs,'incidents',removed_incidents,'retention_days',180),null,'reliability_retention');
  end if;
  return jsonb_build_object('runs',removed_runs,'incidents',removed_incidents);
end;
$$;
revoke all on function public.prune_reliability_history() from public,anon,authenticated,service_role;
grant execute on function public.prune_reliability_history() to service_role;
select cron.schedule('reliability-history-retention','41 * * * *',$$select public.prune_reliability_history()$$);
