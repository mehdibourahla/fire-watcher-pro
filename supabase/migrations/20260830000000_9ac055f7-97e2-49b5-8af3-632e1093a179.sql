-- Cells are stored as grid centres so the 1.5 km screen radius is well defined.
create table public.persistent_sources (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null,
  lon double precision not null,
  site_id text not null,
  site_name text,
  static_share double precision not null check (static_share >= 0 and static_share <= 1),
  active_days integer not null check (active_days >= 0),
  detection_count integer not null check (detection_count >= 0),
  observation_days integer not null check (observation_days > 0),
  first_seen date not null,
  last_seen date not null,
  frp_p50 double precision,
  frp_p90 double precision,
  jul_aug_share double precision,
  created_at timestamptz not null default now(),
  unique (lat, lon)
);

create index persistent_sources_site_idx on public.persistent_sources (site_id);

alter table public.persistent_sources enable row level security;

create policy "persistent sources are public reference data"
  on public.persistent_sources for select using (true);

grant select on public.persistent_sources to anon, authenticated;
grant all on public.persistent_sources to service_role;
