alter table public.fire_clusters
  add column suspected_persistent_source boolean not null default false;

create index fire_clusters_suspected_idx
  on public.fire_clusters (suspected_persistent_source)
  where suspected_persistent_source;
