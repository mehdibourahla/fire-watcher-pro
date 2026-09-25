-- FCM topic sends report no subscriber count, so the server records which users opted a device in
create table public.user_push_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_hash)
);
alter table public.user_push_devices enable row level security;
revoke all on public.user_push_devices from public, anon, authenticated;
grant select, insert, update, delete on public.user_push_devices to service_role;

alter table public.alerts drop constraint alerts_push_state_check;
alter table public.alerts add constraint alerts_push_state_check
  check (push_state in ('pending','sent','failed','skipped','no_device'));
