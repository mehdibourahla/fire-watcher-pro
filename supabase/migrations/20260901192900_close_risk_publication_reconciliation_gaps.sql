begin;

create function public.purge_inactive_risk_staging()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.risk_forecast_staging as staged
  where not exists (
    select 1
    from public.risk_forecast_snapshot_runs as run
    where run.snapshot_id = staged.snapshot_id
      and run.status = 'active'
  );
  return null;
end;
$$;

create trigger purge_inactive_risk_staging_on_run_change
after insert or update on public.risk_forecast_snapshot_runs
for each statement
execute function public.purge_inactive_risk_staging();

create function public.preserve_committed_risk_source_checkpoint()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _publication record;
begin
  if new.contract_key <> 'local_fwi' then
    return new;
  end if;

  select
    checkpoint.scheduled_for,
    checkpoint.base_date,
    checkpoint.published_at,
    publication.row_count
  into _publication
  from public.risk_publication_checkpoint as checkpoint
  join public.risk_publications as publication
    on publication.snapshot_id = checkpoint.snapshot_id
  where checkpoint.key = 'local_fwi'
    and checkpoint.coverage_status = 'complete'
    and (
      new.last_scheduled_for is null
      or new.last_scheduled_for <= checkpoint.scheduled_for
    );

  if found then
    new.last_scheduled_for := _publication.scheduled_for;
    new.last_success_at := _publication.published_at;
    new.data_through := _publication.base_date::timestamptz;
    new.validated_at := _publication.published_at;
    new.published_at := _publication.published_at;
    new.consecutive_failures := 0;
    new.records_accepted := _publication.row_count;
    new.records_expected := _publication.row_count;
    new.coverage_status := 'complete';
    new.fallback_contract_key := null;
    new.last_public_reason_code := null;
  end if;

  return new;
end;
$$;

create trigger preserve_committed_risk_source_checkpoint
before insert or update on public.source_checkpoints
for each row
execute function public.preserve_committed_risk_source_checkpoint();

revoke all on function public.purge_inactive_risk_staging()
  from public, anon, authenticated, service_role;
revoke all on function public.preserve_committed_risk_source_checkpoint()
  from public, anon, authenticated, service_role;

commit;

-- Rollback drops both triggers and their trigger functions.
