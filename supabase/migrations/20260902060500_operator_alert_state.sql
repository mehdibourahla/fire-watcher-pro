create table public.operator_alert_state (
  key text primary key,
  fingerprint text not null,
  updated_at timestamptz not null default now()
);

alter table public.operator_alert_state enable row level security;

revoke all on public.operator_alert_state from public, anon, authenticated;
grant select, insert, update on public.operator_alert_state to service_role;
