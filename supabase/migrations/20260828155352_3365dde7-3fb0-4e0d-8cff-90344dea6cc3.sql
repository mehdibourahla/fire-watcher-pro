WITH nearest_settlement AS (
  SELECT DISTINCT ON (fc.id)
    fc.id AS cluster_id,
    s.id AS settlement_id,
    2 * 6371 * asin(sqrt(
      power(sin(radians(s.lat - fc.lat) / 2), 2) +
      cos(radians(fc.lat)) * cos(radians(s.lat)) *
      power(sin(radians(s.lon - fc.lon) / 2), 2)
    )) AS distance_km
  FROM public.fire_clusters fc
  CROSS JOIN public.settlements s
  ORDER BY fc.id, distance_km
),
nearest_commune AS (
  SELECT DISTINCT ON (fc.id)
    fc.id AS cluster_id,
    au.id AS commune_id,
    au.parent_id AS wilaya_id,
    2 * 6371 * asin(sqrt(
      power(sin(radians(au.lat - fc.lat) / 2), 2) +
      cos(radians(fc.lat)) * cos(radians(au.lat)) *
      power(sin(radians(au.lon - fc.lon) / 2), 2)
    )) AS distance_km
  FROM public.fire_clusters fc
  CROSS JOIN public.admin_units au
  WHERE au.level = 'commune'
  ORDER BY fc.id, distance_km
)
UPDATE public.fire_clusters fc
SET
  nearest_settlement_id = CASE WHEN ns.distance_km <= 25 THEN ns.settlement_id ELSE NULL END,
  nearest_settlement_km = CASE WHEN ns.distance_km <= 25 THEN round(ns.distance_km::numeric, 1)::double precision ELSE NULL END,
  commune_id = CASE WHEN nc.distance_km <= 50 THEN nc.commune_id ELSE NULL END,
  wilaya_id = CASE WHEN nc.distance_km <= 50 THEN nc.wilaya_id ELSE NULL END,
  updated_at = now()
FROM nearest_settlement ns, nearest_commune nc
WHERE fc.id = ns.cluster_id
  AND fc.id = nc.cluster_id;