-- FCI repeats every 10 minutes, so its per-slot pixel count is the only series
-- dense enough to show whether a fire is growing within its own lifetime
alter table public.fire_clusters add column fci_growth jsonb;
