create table if not exists public.internal_cron_token (
  id boolean primary key default true check (id),
  token text not null,
  created_at timestamptz not null default now()
);
revoke all on public.internal_cron_token from public, anon, authenticated;
grant all on public.internal_cron_token to service_role;
alter table public.internal_cron_token enable row level security;

create or replace function private.sync_cron_token()
returns void language plpgsql security definer set search_path = public as $$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'nadhir_cron_token';
  insert into public.internal_cron_token (id, token) values (true, s)
  on conflict (id) do update set token = excluded.token;
end $$;
revoke all on function private.sync_cron_token() from public, anon, authenticated;

select private.sync_cron_token();