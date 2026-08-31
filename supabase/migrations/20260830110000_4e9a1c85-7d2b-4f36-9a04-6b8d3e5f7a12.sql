-- A4: owner-seeded mapping from wilaya to its public Telegram channel.
create table public.telegram_channels (
  wilaya_id uuid primary key references public.admin_units(id) on delete cascade,
  chat_id text not null,
  created_at timestamptz not null default now()
);

grant all on public.telegram_channels to service_role;
alter table public.telegram_channels enable row level security;
