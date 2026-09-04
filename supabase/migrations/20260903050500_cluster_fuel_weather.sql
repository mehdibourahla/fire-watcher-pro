ALTER TABLE public.fire_clusters
  ADD COLUMN wind_gust_kmh double precision,
  ADD COLUMN vpd_kpa double precision,
  ADD COLUMN soil_moisture_m3m3 double precision;
