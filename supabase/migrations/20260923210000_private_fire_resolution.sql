-- who closed a fire, and their note, stay with operators; a column added later needs its own grant
revoke select on public.fire_clusters from anon, authenticated;
grant select (
  id, short_id, state, first_detected_at, last_detected_at, lat, lon, hull,
  detection_count, sources, max_frp_mw, confidence, est_area_ha, wind_speed_kmh,
  wind_dir_deg, spread_bearing_deg, commune_id, wilaya_id, nearest_settlement_id,
  nearest_settlement_km, created_at, updated_at, resolved_at, resolution_reason,
  suspected_persistent_source, confirmed_at, confirmed_mention_id, wind_gust_kmh,
  vpd_kpa, soil_moisture_m3m3, fci_growth
) on public.fire_clusters to anon, authenticated;
