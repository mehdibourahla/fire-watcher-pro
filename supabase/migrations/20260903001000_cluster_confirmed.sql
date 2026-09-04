-- only an authority confirms a fire; the satellite side only detects it
alter table public.fire_clusters
  add column confirmed_at timestamptz,
  add column confirmed_mention_id uuid references public.incident_mentions(id);

create index fire_clusters_confirmed_idx
  on public.fire_clusters (confirmed_at desc)
  where confirmed_at is not null;
