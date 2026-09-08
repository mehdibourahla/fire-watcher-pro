create table public.broadcast_delivery_receipts (
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  channel text not null check (channel in ('fcm', 'telegram')),
  destination text not null check (length(destination) > 0),
  delivered_at timestamptz not null default now(),
  primary key (broadcast_id, channel, destination)
);

alter table public.broadcast_delivery_receipts enable row level security;
revoke all on public.broadcast_delivery_receipts from public, anon, authenticated, service_role;
grant select, insert on public.broadcast_delivery_receipts to service_role;
