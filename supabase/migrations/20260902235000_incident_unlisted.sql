-- DGPC opens fires and almost never closes them per commune (66 of 67 mentions "ongoing"),
-- so absence from a later full bulletin is Nadhir's own observation, not the authority's status
alter table public.official_incidents add column unlisted_at timestamptz;

create index official_incidents_listed_idx
  on public.official_incidents (last_reported_at desc)
  where unlisted_at is null;
