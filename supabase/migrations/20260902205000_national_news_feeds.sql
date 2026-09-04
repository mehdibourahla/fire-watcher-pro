insert into public.source_contracts (
  key, version, label, family, criticality, freshness_basis,
  cadence_minutes, warning_after_minutes, stale_after_minutes, max_fallback_age_minutes,
  expected_coverage, parser_version, dependency_keys, licence, attribution, owner,
  enabled, schedule_enabled, schedule_offset_minutes, execution_target,
  lease_seconds, max_attempts, retry_base_seconds, retry_window_minutes,
  overlap_minutes, replay_capability, replay_window_minutes
)
select
  f.key, 1, f.label, 'official_text', 'optional', 'last_success_at',
  30, 180, 1440, null,
  '{"kind":"successful_poll"}'::jsonb, 'rss-v1', '{}',
  'Public RSS feed, attributed, headline and excerpt only', f.label, 'Nadhir maintainers',
  true, true, f.offset_min, 'cloudflare',
  120, 3, 60, 30,
  0, 'none', null
from (values
  ('rss_tsa',        'TSA (Tout sur l''Algérie)', 1),
  ('rss_algerie360', 'Algérie360',                4),
  ('rss_echorouk',   'Echorouk Online',           7),
  ('rss_elkhabar',   'El Khabar',                10),
  ('rss_ennahar',    'Ennahar Online',           13),
  ('rss_elbilad',    'El Bilad',                 16),
  ('rss_awras',      'Awras',                    19),
  ('rss_lematin',    'Le Matin d''Algérie',      22)
) as f(key, label, offset_min);

insert into public.source_checkpoints (contract_key)
select key from public.source_contracts where key like 'rss\_%'
on conflict (contract_key) do nothing;

insert into public.text_sources (key, label, kind, url, authority_tier, language)
values
  ('rss_tsa',        'TSA (Tout sur l''Algérie)', 'rss', 'https://www.tsa-algerie.com/feed',     'media', 'fr'),
  ('rss_algerie360', 'Algérie360',                'rss', 'https://www.algerie360.com/feed',      'media', 'fr'),
  ('rss_echorouk',   'Echorouk Online',           'rss', 'https://www.echoroukonline.com/feed',  'media', 'ar'),
  ('rss_elkhabar',   'El Khabar',                 'rss', 'https://www.elkhabar.com/feed',        'media', 'ar'),
  ('rss_ennahar',    'Ennahar Online',            'rss', 'https://www.ennaharonline.com/feed',   'media', 'ar'),
  ('rss_elbilad',    'El Bilad',                  'rss', 'https://www.elbilad.net/feed',         'media', 'ar'),
  ('rss_awras',      'Awras',                     'rss', 'https://www.awras.com/feed',           'media', 'ar'),
  ('rss_lematin',    'Le Matin d''Algérie',       'rss', 'https://lematindalgerie.com/feed',     'media', 'fr');
