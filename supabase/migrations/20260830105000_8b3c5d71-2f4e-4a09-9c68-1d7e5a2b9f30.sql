-- A2/A4 delivery stamps: a row is delivered per channel once every send went out.
alter table public.broadcasts
  add column fcm_topics integer,
  add column fcm_delivered_at timestamptz,
  add column telegram_channels integer,
  add column telegram_delivered_at timestamptz;

create index idx_broadcasts_fcm_pending on public.broadcasts (created_at)
  where fcm_delivered_at is null;
create index idx_broadcasts_telegram_pending on public.broadcasts (created_at)
  where telegram_delivered_at is null;

insert into public.data_sources (name, label, status, note)
  values ('broadcast', 'Broadcast delivery', 'degraded', 'Never delivered yet.');
