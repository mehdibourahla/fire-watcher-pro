create or replace function private.in_algeria_north(_lat double precision, _lon double precision)
returns boolean language sql immutable as $$
  select polygon('((-2.05,35.1),(-1.3,35.7),(-0.6,35.85),(0.1,36.0),(0.9,36.55),(1.9,36.6),(2.9,36.8),(3.9,36.9),(4.8,36.9),(5.5,37.1),(6.3,37.1),(7.2,37.05),(8.0,36.95),(8.6,36.85),(8.35,36.5),(8.25,35.8),(8.3,34.9),(7.9,34.4),(7.5,34.0),(7.5,33.2),(-1.5,33.2),(-2.0,34.0),(-1.7,34.7))') @> point(_lon, _lat)
$$;

delete from public.detections d where not private.in_algeria_north(d.lat, d.lon);
delete from public.fire_clusters c where not private.in_algeria_north(c.lat, c.lon);
delete from public.fire_clusters c
  where not exists (select 1 from public.detections d where d.cluster_id = c.id);