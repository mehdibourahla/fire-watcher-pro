insert into public.source_contracts (
  key, version, label, family, criticality, freshness_basis,
  cadence_minutes, warning_after_minutes, stale_after_minutes, max_fallback_age_minutes,
  expected_coverage, parser_version, dependency_keys, licence, attribution, owner,
  enabled, schedule_enabled, schedule_offset_minutes, execution_target,
  lease_seconds, max_attempts, retry_base_seconds, retry_window_minutes,
  overlap_minutes, replay_capability, replay_window_minutes
)
select
  's3_slstr', 1, 'Copernicus Sentinel-3 SLSTR FRP', 'fire_detection', 'supporting',
  'upstream_published_at',
  -- two passes a day per satellite: a quiet half-day is normal, a silent day is not
  60, 720, 1800, null,
  '{"kind":"upstream_slot"}'::jsonb, 's3-wfs-v1', '{}', 'Copernicus data licence',
  'Copernicus Sentinel-3 SLSTR via EUMETSAT', 'Nadhir maintainers',
  true, true, 5, 'cloudflare',
  lease_seconds, max_attempts, retry_base_seconds, retry_window_minutes,
  overlap_minutes, replay_capability, replay_window_minutes
from public.source_contracts
where key = 'fci';
