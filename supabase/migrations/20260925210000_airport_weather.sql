insert into public.source_contracts (
  key, version, label, family, criticality, freshness_basis,
  cadence_minutes, warning_after_minutes, stale_after_minutes, max_fallback_age_minutes,
  expected_coverage, parser_version, dependency_keys, licence, attribution, owner,
  enabled, schedule_enabled, schedule_offset_minutes, execution_target,
  lease_seconds, max_attempts, retry_base_seconds, retry_window_minutes,
  overlap_minutes, replay_capability, replay_window_minutes
)
select
  'metar', 1, 'Airport weather reports (METAR)', 'hazard_observation', 'supporting',
  'last_success_at',
  30, 90, 180, null,
  '{"kind":"poll"}'::jsonb, 'metar-json-v1', '{}', 'US Government work, public domain',
  'NOAA Aviation Weather Center (aviationweather.gov)', 'Nadhir maintainers',
  true, true, 7, 'cloudflare',
  lease_seconds, max_attempts, retry_base_seconds, retry_window_minutes,
  overlap_minutes, 'none', null
from public.source_contracts
where key = 'emsc';

-- the latest report of each Algerian airport: measured conditions, not a forecast
create table public.airport_weather (
  station text primary key check (station ~ '^DA[A-Z]{2}$'),
  name text,
  lat double precision not null,
  lon double precision not null,
  observed_at timestamptz not null,
  temp_c numeric(4,1),
  wind_kt integer,
  gust_kt integer,
  visibility_m integer,
  weather text,
  raw text not null,
  fetched_at timestamptz not null default now()
);
alter table public.airport_weather enable row level security;
revoke all on public.airport_weather from public, anon, authenticated;
grant select on public.airport_weather to anon, authenticated;
create policy "public read airport weather" on public.airport_weather for select using (true);
