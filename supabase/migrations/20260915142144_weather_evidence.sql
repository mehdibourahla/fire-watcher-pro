create table public.weather_snapshots (
  id uuid primary key default gen_random_uuid(),
  commune_id uuid not null references public.admin_units(id),
  scheduled_at timestamptz not null,
  fetched_at timestamptz not null,
  job_id uuid references public.source_jobs(id) on delete set null,
  evidence jsonb not null check (coalesce((
    jsonb_typeof(evidence) = 'object'
    and evidence->>'source' = 'open-meteo'
    and evidence->>'model' = 'best_match'
    and jsonb_typeof(evidence->'hours') = 'array'
    and jsonb_array_length(evidence->'hours') = 48
  ), false)),
  unique(commune_id, scheduled_at)
);
alter table public.weather_snapshots enable row level security;
revoke all on public.weather_snapshots from public, anon, authenticated, service_role;
grant select, insert on public.weather_snapshots to service_role;

create function public.current_weather_snapshot(_commune_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select evidence from public.weather_snapshots
  where commune_id = _commune_id
  order by scheduled_at desc limit 1
$$;
revoke all on function public.current_weather_snapshot(uuid) from public;
grant execute on function public.current_weather_snapshot(uuid) to anon, authenticated, service_role;

create function public.save_weather_snapshots(_job uuid, _attempt integer, _snapshots jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare _scheduled timestamptz; _count integer;
begin
  select j.scheduled_for into _scheduled
  from public.source_job_leases l join public.source_jobs j on j.id=l.job_id
  where l.contract_key='openmeteo_weather' and l.job_id=_job and l.attempt=_attempt
    and l.lease_expires_at>clock_timestamp()
  for update of l;
  if not found then raise exception 'weather_source_lease_lost'; end if;
  if jsonb_typeof(_snapshots) is distinct from 'array' or jsonb_array_length(_snapshots)>25 then
    raise exception 'invalid_weather_batch';
  end if;
  if exists (
    select 1 from jsonb_array_elements(_snapshots) s
    left join public.admin_units u on u.id=(s->>'commune_id')::uuid
    where u.id is null or u.level<>'commune'
      or (s->'evidence'->>'scheduledAt')::timestamptz is distinct from _scheduled
      or not coalesce(abs((s->'evidence'->'requested'->>'lat')::float8-u.lat)<=0.000001,false)
      or not coalesce(abs((s->'evidence'->'requested'->>'lon')::float8-u.lon)<=0.000001,false)
      or s->'evidence'->>'fetchedAt' is null
      or (s->'evidence'->>'fetchedAt')::timestamptz>clock_timestamp()+interval '5 minutes'
  ) then raise exception 'weather_identity_mismatch'; end if;
  insert into public.weather_snapshots(commune_id,scheduled_at,fetched_at,job_id,evidence)
  select (s->>'commune_id')::uuid,_scheduled,(s->'evidence'->>'fetchedAt')::timestamptz,_job,s->'evidence'
    from jsonb_array_elements(_snapshots) s
    on conflict(commune_id,scheduled_at) do nothing;
  get diagnostics _count = row_count;
  return _count;
end;
$$;
revoke all on function public.save_weather_snapshots(uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.save_weather_snapshots(uuid,integer,jsonb) to service_role;

insert into public.source_contracts (
  key,version,label,family,criticality,freshness_basis,cadence_minutes,
  warning_after_minutes,stale_after_minutes,max_fallback_age_minutes,
  expected_coverage,parser_version,dependency_keys,licence,attribution,owner,
  enabled,schedule_enabled,execution_target,lease_seconds,max_attempts,
  retry_base_seconds,retry_window_minutes,overlap_minutes,replay_capability,replay_window_minutes
) values (
  'openmeteo_weather',1,'Open-Meteo hourly weather forecasts','civil_information','supporting','last_success_at',360,
  480,720,2880,'{"unit":"communes","horizon_hours":48}'::jsonb,'weather-v1',array[]::text[],
  'CC-BY 4.0','Open-Meteo','nadhir',true,true,'cloudflare',900,3,60,45,0,'none',null
);
insert into public.source_checkpoints(contract_key) values ('openmeteo_weather');
