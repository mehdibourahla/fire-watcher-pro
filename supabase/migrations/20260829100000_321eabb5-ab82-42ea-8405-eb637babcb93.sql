-- Survival mode: open areas (map facts, never "safe" — see CONTEXT.md), hazard
-- report kinds, and the safe-columns public view the 20260829020000 migration
-- called for before any public report feed.

create table public.open_areas (
  id uuid primary key default gen_random_uuid(),
  -- OSM ids are only unique per primitive type (node/way/relation).
  osm_type text,
  osm_id bigint,
  unique (osm_type, osm_id),
  name text not null,
  name_ar text,
  area_type text not null check (area_type in ('stadium','pitch','schoolyard','parking','square','beach')),
  lat double precision not null,
  lon double precision not null,
  commune_id uuid references public.admin_units(id),
  source text not null default 'osm',
  created_at timestamptz not null default now()
);

alter table public.open_areas enable row level security;

create policy "open areas are public reference data"
  on public.open_areas for select using (true);

alter table public.citizen_reports
  add column kind text not null default 'sighting'
  check (kind in ('sighting','road_blocked','person_trapped'));

-- Hazard asymmetry (CONTEXT.md): danger reports may show unmoderated, but only
-- through safe columns — no reporter id, note, photo path or moderation fields.
create view public.hazard_reports
  with (security_invoker = false) as
  select id, kind, sighting, lat, lon, observed_at, created_at, status
  from public.citizen_reports
  where status in ('pending', 'approved');

grant select on public.hazard_reports to anon, authenticated;
