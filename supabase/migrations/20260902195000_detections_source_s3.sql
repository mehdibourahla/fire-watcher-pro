alter table public.detections drop constraint detections_source_check;
alter table public.detections
  add constraint detections_source_check check (source in ('firms', 'fci', 's3'));
