create table private.cold_tables (
  table_name text primary key,
  day_column text not null,
  hot_days integer not null check (hot_days >= 90)
);
insert into private.cold_tables values
  ('weather_snapshots', 'scheduled_at', 90),
  ('risk_forecasts', 'created_at', 90),
  ('broadcast_audit', 'at', 90),
  ('airport_observations', 'observed_at', 90),
  ('source_runs', 'started_at', 90),
  -- jobs leave after the runs, snapshots and investigations that point at them
  ('source_jobs', 'created_at', 92);
revoke all on private.cold_tables from public, anon, authenticated, service_role;

create table public.cold_exports (
  table_name text not null references private.cold_tables (table_name),
  day date not null,
  rows bigint not null check (rows >= 0),
  key_digest text,
  sha256 text,
  bytes bigint,
  path text,
  exported_at timestamptz not null default now(),
  primary key (table_name, day),
  check (
    (rows = 0 and key_digest is null and sha256 is null and bytes is null and path is null)
    or (rows > 0 and key_digest ~ '^[0-9a-f]{32}$' and sha256 ~ '^[0-9a-f]{64}$' and bytes > 0
      and path = format('cold/%s/%s.parquet', table_name, to_char(day, 'YYYY/MM/DD')))
  )
);
alter table public.cold_exports enable row level security;
revoke all on public.cold_exports from public, anon, authenticated;
grant select on public.cold_exports to authenticated;
create policy operator_read_cold_exports on public.cold_exports for select to authenticated
  using (public.has_any_role(auth.uid(), array['operator', 'admin']::public.app_role[]));

insert into storage.buckets (id, name, public, file_size_limit)
values ('cold-archive', 'cold-archive', false, 52428800);

create index weather_snapshots_scheduled_idx on public.weather_snapshots (scheduled_at);
create index risk_forecasts_created_idx on public.risk_forecasts (created_at);
create index source_runs_started_idx on public.source_runs (started_at);
create index source_jobs_created_idx on public.source_jobs (created_at);

create function private.cold_candidates(_table text, _day date)
returns table (id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  _from timestamptz := _day::timestamp at time zone 'UTC';
  _to timestamptz := (_day + 1)::timestamp at time zone 'UTC';
begin
  case _table
  when 'weather_snapshots' then
    return query select t.id from public.weather_snapshots t
      where t.scheduled_at >= _from and t.scheduled_at < _to;
  when 'risk_forecasts' then
    return query select t.id from public.risk_forecasts t
      where t.created_at >= _from and t.created_at < _to
        and not exists (select 1 from public.risk_publication_checkpoint c where c.snapshot_id = t.snapshot_id);
  when 'broadcast_audit' then
    return query select t.id from public.broadcast_audit t
      where t.at >= _from and t.at < _to;
  when 'airport_observations' then
    return query select t.id from public.airport_observations t
      where t.observed_at >= _from and t.observed_at < _to;
  when 'source_runs' then
    return query select t.id from public.source_runs t
      where t.started_at >= _from and t.started_at < _to and t.outcome <> 'running'
        and not exists (select 1 from public.source_gaps g where g.resolved_by_run_id = t.id);
  when 'source_jobs' then
    return query select t.id from public.source_jobs t
      where t.created_at >= _from and t.created_at < _to and t.state in ('succeeded', 'failed')
        and not exists (select 1 from public.source_runs r where r.job_id = t.id)
        and not exists (select 1 from public.weather_snapshots w where w.job_id = t.id)
        and not exists (select 1 from public.civil_investigations c where c.job_id = t.id);
  else
    raise exception 'cold_table_unknown' using errcode = '22023';
  end case;
end;
$$;
revoke all on function private.cold_candidates(text, date) from public, anon, authenticated, service_role;

create function private.cold_archived(_table text, _at timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cold_exports e
    where e.table_name = _table and e.day = (_at at time zone 'UTC')::date
  )
$$;
revoke all on function private.cold_archived(text, timestamptz) from public, anon, authenticated, service_role;

create or replace function public.broadcast_audit_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and private.cold_archived('broadcast_audit', old.at) then
    return old;
  end if;
  raise exception 'broadcast_audit is append-only';
end;
$$;

create or replace function public.reject_published_risk_forecast_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.snapshot_id is not null
    and not (tg_op = 'DELETE' and private.cold_archived('risk_forecasts', old.created_at)) then
    raise exception using
      errcode = '55000',
      message = 'published_risk_forecast_is_immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create function public.cold_pending_days(_table text) returns setof date
language plpgsql stable security definer set search_path = '' as $$
declare
  _config private.cold_tables;
  _first date;
begin
  select * into _config from private.cold_tables where table_name = _table;
  if not found then raise exception 'cold_table_unknown' using errcode = '22023'; end if;
  execute format('select (min(%I) at time zone ''UTC'')::date from public.%I', _config.day_column, _table)
    into _first;
  return query
    select d::date from generate_series(
      _first, (now() at time zone 'UTC')::date - _config.hot_days - 1, interval '1 day') d
    where not exists (select 1 from public.cold_exports e where e.table_name = _table and e.day = d::date)
    order by 1;
end;
$$;
revoke all on function public.cold_pending_days(text) from public, anon, authenticated;
grant execute on function public.cold_pending_days(text) to service_role;

-- the manifest row is written first: the append-only triggers let a row go only once its day is archived
create function public.cold_archive_commit(
  _table text, _day date, _rows bigint,
  _key_digest text default null, _sha256 text default null, _bytes bigint default null, _path text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  _hot integer := (select hot_days from private.cold_tables where table_name = _table);
  _deleted bigint;
  _digest text;
begin
  if _hot is null then raise exception 'cold_table_unknown' using errcode = '22023'; end if;
  if _day >= (now() at time zone 'UTC')::date - _hot then
    raise exception 'cold_day_still_hot' using errcode = '22023';
  end if;
  if _table = 'source_runs' then perform pg_advisory_xact_lock(1800908); end if;

  insert into public.cold_exports (table_name, day, rows, key_digest, sha256, bytes, path)
  values (_table, _day, _rows, _key_digest, _sha256, _bytes, _path);

  if _table = 'source_runs' then
    insert into public.source_run_retired_keys (idempotency_key)
    select r.idempotency_key from public.source_runs r
    join private.cold_candidates(_table, _day) c on c.id = r.id
    where r.idempotency_key is not null
    on conflict do nothing;
  end if;

  execute format(
    'with gone as (delete from public.%I t using private.cold_candidates($1, $2) c where t.id = c.id returning t.id)
     select count(*), md5(string_agg(id::text, '','' order by id::text collate "C")) from gone', _table)
    into _deleted, _digest using _table, _day;

  if _deleted <> _rows or (_rows > 0 and _digest is distinct from _key_digest) then
    raise exception 'cold_export_mismatch' using
      detail = format('%s %s: file holds %s rows, database held %s', _table, _day, _rows, _deleted);
  end if;
  return _deleted;
end;
$$;
revoke all on function public.cold_archive_commit(text, date, bigint, text, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.cold_archive_commit(text, date, bigint, text, text, bigint, text) to service_role;

-- the export reads through its own login: it can select, never write
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cold_reader') then
    create role cold_reader login;
  end if;
end;
$$;
alter role cold_reader set default_transaction_read_only = on;
grant usage on schema public, private to cold_reader;
grant select on public.weather_snapshots, public.risk_forecasts, public.broadcast_audit,
  public.airport_observations, public.source_runs, public.source_jobs to cold_reader;
grant execute on function private.cold_candidates(text, date) to cold_reader;
create policy cold_reader_export on public.weather_snapshots for select to cold_reader using (true);
create policy cold_reader_export on public.risk_forecasts for select to cold_reader using (true);
create policy cold_reader_export on public.broadcast_audit for select to cold_reader using (true);
create policy cold_reader_export on public.airport_observations for select to cold_reader using (true);
create policy cold_reader_export on public.source_runs for select to cold_reader using (true);
create policy cold_reader_export on public.source_jobs for select to cold_reader using (true);

select cron.unschedule('reliability-history-retention');
drop function public.prune_reliability_history();
drop table public.source_run_archive_daily, public.incident_archive_daily;
drop index public.source_runs_retention, public.incident_retention;
