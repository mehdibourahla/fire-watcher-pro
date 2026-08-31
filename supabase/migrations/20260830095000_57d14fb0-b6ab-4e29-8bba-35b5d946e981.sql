-- A1 broadcast publisher: public lifecycle rows, append-only audit, kill-switch.
create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('fire','onm')),
  phase text not null default 'initial' check (phase in ('initial','update','end','cancel')),
  cluster_id uuid references public.fire_clusters(id) on delete set null,
  onm_vigilance_id uuid references public.onm_vigilance(id) on delete set null,
  cap_alert_id uuid references public.cap_alerts(id) on delete set null,
  severity text not null check (severity in ('Extreme','Severe')),
  commune_codes text[] not null,
  created_at timestamptz not null default now(),
  check ((kind = 'fire' and cluster_id is not null)
      or (kind = 'onm' and onm_vigilance_id is not null))
);
create index idx_broadcasts_cluster on public.broadcasts (cluster_id, created_at desc);
create index idx_broadcasts_created on public.broadcasts (created_at desc);
create unique index idx_broadcasts_onm_once on public.broadcasts (onm_vigilance_id) where kind = 'onm';

create table public.broadcast_audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  action text not null check (action in ('published','suppressed')),
  reason text not null,
  kind text,
  cluster_id uuid,
  onm_vigilance_id uuid,
  phase text,
  severity text,
  commune_codes text[],
  payload jsonb
);
create index idx_broadcast_audit_at on public.broadcast_audit (at desc);

-- append-only is a stated property of the log, not a convention: block rewrites
-- even for service_role, which bypasses RLS
create function public.broadcast_audit_immutable() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'broadcast_audit is append-only';
end $$;
create trigger broadcast_audit_no_rewrite
  before update or delete on public.broadcast_audit
  for each row execute function public.broadcast_audit_immutable();

create table public.broadcast_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.broadcast_settings (id, enabled) values (true, true);

alter table public.cap_alerts add column cap_references text;

grant select on public.broadcasts to anon, authenticated;
grant all on public.broadcasts, public.broadcast_audit, public.broadcast_settings to service_role;

alter table public.broadcasts enable row level security;
alter table public.broadcast_audit enable row level security;
alter table public.broadcast_settings enable row level security;

-- audit and settings stay service-role only until A6 adds the admin surface
create policy "public read broadcasts" on public.broadcasts
  for select to anon, authenticated using (true);
