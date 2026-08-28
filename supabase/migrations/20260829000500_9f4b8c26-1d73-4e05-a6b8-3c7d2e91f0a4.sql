-- /status credited EFFIS for numbers the local FWI pipeline produced, and FCI
-- for detections it never writes. Report each feed for what it actually does.
INSERT INTO public.data_sources (name, label, status, note)
VALUES (
  'local_fwi',
  'Fire Weather Index (computed from Open-Meteo)',
  'ok',
  'Canadian FWI computed locally per commune.'
)
ON CONFLICT (name) DO NOTHING;

UPDATE public.data_sources
SET status = 'unavailable',
    note = 'Not connected. Danger ratings come from the locally computed FWI.'
WHERE name = 'effis';

UPDATE public.data_sources
SET label = 'EUMETSAT MTG FCI (feed health only)',
    note = 'Granule availability is monitored; pixel decoding is not yet implemented, so this feed contributes no detections.'
WHERE name = 'fci';
