-- the admin push test proves arrival on the device itself, through the same signed receipt as alerts
create table public.push_test_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now(),
  received_at timestamptz
);
alter table public.push_test_receipts enable row level security;
revoke all on public.push_test_receipts from public, anon, authenticated, service_role;
grant select on public.push_test_receipts to authenticated;
grant select, insert, update (received_at) on public.push_test_receipts to service_role;
create policy "admins read their own push tests" on public.push_test_receipts for select to authenticated
  using (user_id = (select auth.uid()));
