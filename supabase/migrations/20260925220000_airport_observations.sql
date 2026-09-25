create table public.airport_observations (
  id uuid primary key default gen_random_uuid(),
  station text not null check (station ~ '^DA[A-Z]{2}$'),
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
  fetched_at timestamptz not null default now(),
  unique (station, observed_at)
);
create index airport_observations_observed_idx on public.airport_observations (observed_at);
alter table public.airport_observations enable row level security;
revoke all on public.airport_observations from public, anon, authenticated;
grant select on public.airport_observations to anon, authenticated;
revoke update, delete, truncate on public.airport_observations from service_role;
create policy "public read airport observations" on public.airport_observations for select using (true);

insert into public.airport_observations
  (station, name, lat, lon, observed_at, temp_c, wind_kt, gust_kt, visibility_m, weather, raw, fetched_at)
select station, name, lat, lon, observed_at, temp_c, wind_kt, gust_kt, visibility_m, weather, raw, fetched_at
from public.airport_weather;

drop table public.airport_weather;

create view public.airport_weather with (security_invoker = true) as
select distinct on (station)
  station, name, lat, lon, observed_at, temp_c, wind_kt, gust_kt, visibility_m, weather, raw, fetched_at
from public.airport_observations
order by station, observed_at desc;
revoke all on public.airport_weather from public, anon, authenticated;
grant select on public.airport_weather to anon, authenticated;
