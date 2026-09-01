begin;

lock table public.zones, public.citizen_reports in share row exclusive mode;

do $migration$
begin
  if exists (
    select 1
    from public.zones
    group by user_id
    having count(*) > 10
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existing zone rows exceed the limit of 10 per user';
  end if;

  if exists (
    select 1
    from public.citizen_reports
    where created_at > now() - interval '24 hours'
    group by user_id
    having count(*) > 3
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existing citizen reports exceed the limit of 3 per 24 hours';
  end if;
end
$migration$;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'zones_name_valid'
      and conrelid = 'public.zones'::regclass
  ) then
    alter table public.zones
      add constraint zones_name_valid
      check (char_length(btrim(name)) between 1 and 80);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'zones_lat_valid'
      and conrelid = 'public.zones'::regclass
  ) then
    alter table public.zones
      add constraint zones_lat_valid check (lat between -90 and 90);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'zones_lon_valid'
      and conrelid = 'public.zones'::regclass
  ) then
    alter table public.zones
      add constraint zones_lon_valid check (lon between -180 and 180);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'zones_radius_km_valid'
      and conrelid = 'public.zones'::regclass
  ) then
    alter table public.zones
      add constraint zones_radius_km_valid check (radius_km between 2 and 60);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'zones_min_danger_level_valid'
      and conrelid = 'public.zones'::regclass
  ) then
    alter table public.zones
      add constraint zones_min_danger_level_valid
      check (min_danger_level between 1 and 5);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'citizen_reports_lat_valid'
      and conrelid = 'public.citizen_reports'::regclass
  ) then
    alter table public.citizen_reports
      add constraint citizen_reports_lat_valid check (lat between -90 and 90);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'citizen_reports_lon_valid'
      and conrelid = 'public.citizen_reports'::regclass
  ) then
    alter table public.citizen_reports
      add constraint citizen_reports_lon_valid check (lon between -180 and 180);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'citizen_reports_sighting_valid'
      and conrelid = 'public.citizen_reports'::regclass
  ) then
    alter table public.citizen_reports
      add constraint citizen_reports_sighting_valid
      check (sighting in ('smoke', 'flames', 'smell', 'other'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'citizen_reports_size_hint_valid'
      and conrelid = 'public.citizen_reports'::regclass
  ) then
    alter table public.citizen_reports
      add constraint citizen_reports_size_hint_valid
      check (size_hint in ('small', 'medium', 'large'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'citizen_reports_status_valid'
      and conrelid = 'public.citizen_reports'::regclass
  ) then
    alter table public.citizen_reports
      add constraint citizen_reports_status_valid
      check (status in ('pending', 'approved', 'rejected'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'citizen_reports_observed_at_valid'
      and conrelid = 'public.citizen_reports'::regclass
  ) then
    alter table public.citizen_reports
      add constraint citizen_reports_observed_at_valid
      check (status = 'rejected' or observed_at <= now() + interval '5 minutes');
  end if;
end
$migration$;

create or replace function public.limit_zones()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  existing_zones integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('nadhir:zone-limit'),
    pg_catalog.hashtext(new.user_id::text)
  );

  select count(*) into existing_zones
  from public.zones
  where user_id = new.user_id;

  if existing_zones >= 10 then
    raise exception using
      errcode = '23514',
      message = 'Zone limit reached (10 total)';
  end if;

  return new;
end;
$function$;

revoke all on function public.limit_zones() from public, anon, authenticated;

do $migration$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'zones_limit'
      and tgrelid = 'public.zones'::regclass
      and not tgisinternal
  ) then
    create trigger zones_limit
      before insert on public.zones
      for each row execute function public.limit_zones();
  end if;
end
$migration$;

create or replace function public.limit_citizen_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  recent_reports integer;
begin
  new.created_at := now();

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('nadhir:citizen-report-limit'),
    pg_catalog.hashtext(new.user_id::text)
  );

  select count(*) into recent_reports
  from public.citizen_reports
  where user_id = new.user_id
    and created_at > now() - interval '24 hours';

  if recent_reports >= 3 then
    raise exception using
      errcode = '23514',
      message = 'Daily report limit reached (3 per 24 hours)';
  end if;

  return new;
end;
$function$;

revoke all on function public.limit_citizen_reports()
  from public, anon, authenticated;

create or replace function public.preserve_citizen_report_created_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.created_at := old.created_at;
  return new;
end;
$function$;

revoke all on function public.preserve_citizen_report_created_at()
  from public, anon, authenticated;

do $migration$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'citizen_reports_created_at_immutable'
      and tgrelid = 'public.citizen_reports'::regclass
      and not tgisinternal
  ) then
    create trigger citizen_reports_created_at_immutable
      before update on public.citizen_reports
      for each row execute function public.preserve_citizen_report_created_at();
  end if;
end
$migration$;

commit;
