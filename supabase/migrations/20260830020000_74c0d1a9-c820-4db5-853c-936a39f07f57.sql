-- The screen suppresses a large share of detections; the public status page reads
-- data_sources, so it needs a row there or the stage is invisible to readers.
INSERT INTO public.data_sources (name, label, status, note)
VALUES (
  'screen',
  'Persistent industrial heat sources (NASA FIRMS labels)',
  'ok',
  'Registry not yet seeded.'
)
ON CONFLICT (name) DO NOTHING;
