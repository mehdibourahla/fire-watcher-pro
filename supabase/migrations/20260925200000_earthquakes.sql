alter table public.source_contracts drop constraint source_contracts_family_check;
alter table public.source_contracts add constraint source_contracts_family_check check (
  family in ('fire_detection','detection_processing','official_warnings','official_text','civil_information',
    'fire_danger','broadcast_delivery','reference_enrichment','hazard_observation')
);

insert into public.source_contracts (
  key, version, label, family, criticality, freshness_basis,
  cadence_minutes, warning_after_minutes, stale_after_minutes, max_fallback_age_minutes,
  expected_coverage, parser_version, dependency_keys, licence, attribution, owner,
  enabled, schedule_enabled, schedule_offset_minutes, execution_target,
  lease_seconds, max_attempts, retry_base_seconds, retry_window_minutes,
  overlap_minutes, replay_capability, replay_window_minutes
)
select
  'emsc', 1, 'EMSC earthquakes (Euro-Med)', 'hazard_observation', 'critical',
  -- weeks pass without an Algerian earthquake, so freshness is the poll, not the newest event
  'last_success_at',
  2, 10, 30, null,
  '{"kind":"poll"}'::jsonb, 'emsc-fdsn-v1', '{}', 'EMSC, free with attribution',
  'EMSC-CSEM (seismicportal.eu), with CRAAG and other networks', 'Nadhir maintainers',
  true, true, 1, 'cloudflare',
  lease_seconds, max_attempts, retry_base_seconds, retry_window_minutes,
  overlap_minutes, 'none', null
from public.source_contracts
where key = 'onm';

-- an instrumental measurement from a seismological network; revisions overwrite, nothing is "confirmed"
create table public.earthquakes (
  id text primary key,
  occurred_at timestamptz not null,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  depth_km double precision,
  magnitude numeric(3,1) not null,
  magnitude_type text,
  region text,
  network text,
  commune_id uuid references public.admin_units(id),
  offshore boolean not null default false,
  updated_at timestamptz not null,
  fetched_at timestamptz not null default now()
);
create index earthquakes_recent_idx on public.earthquakes (occurred_at desc);
alter table public.earthquakes enable row level security;
revoke all on public.earthquakes from public, anon, authenticated;
grant select on public.earthquakes to anon, authenticated;
create policy "public read earthquakes" on public.earthquakes for select using (true);

alter table public.alerts drop constraint alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check
  check (kind in ('fire','risk','weather','official','road','citizen','earthquake'));

alter table public.zones add column notify_earthquake boolean not null default true;
