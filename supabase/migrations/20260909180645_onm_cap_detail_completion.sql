alter table public.onm_vigilance add column cap_detail_fetched_at timestamptz;
create index onm_vigilance_pending_detail_idx on public.onm_vigilance(sent desc)
where cap_detail_fetched_at is null and cap_url is not null;
-- Historical rows remain pending until fetched; a headline is not proof of a capture time.
