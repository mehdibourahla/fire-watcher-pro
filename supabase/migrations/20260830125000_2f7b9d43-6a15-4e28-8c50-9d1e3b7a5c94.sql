-- A6: manual relay of attributed authority warnings + admin read/toggle surfaces.
create table public.authority_warnings (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  received_via text not null,
  body text not null,
  severity text not null check (severity in ('Extreme','Severe')),
  wilaya_id uuid references public.admin_units(id),
  commune_codes text[],
  created_by uuid,
  created_at timestamptz not null default now(),
  check (wilaya_id is not null or commune_codes is not null)
);

alter table public.broadcasts drop constraint broadcasts_kind_check;
alter table public.broadcasts
  add constraint broadcasts_kind_check check (kind in ('fire','onm','authority'));
alter table public.broadcasts
  add column authority_warning_id uuid references public.authority_warnings(id) on delete set null;
alter table public.broadcasts drop constraint broadcasts_check;
alter table public.broadcasts add constraint broadcasts_check check (
  (kind = 'fire' and cluster_id is not null)
  or (kind = 'onm' and onm_vigilance_id is not null)
  or (kind = 'authority' and authority_warning_id is not null)
);
create unique index idx_broadcasts_authority_once
  on public.broadcasts (authority_warning_id) where kind = 'authority';

-- relayed warnings are public information, but only the warning itself:
-- created_by (an admin uid) and received_via stay off the public surface
grant select (id, source, body, severity, created_at)
  on public.authority_warnings to anon, authenticated;
grant insert on public.authority_warnings to authenticated;
grant all on public.authority_warnings to service_role;
alter table public.authority_warnings enable row level security;
create policy "public read authority_warnings" on public.authority_warnings
  for select to anon, authenticated using (true);
create policy "admins insert authority warnings" on public.authority_warnings
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));

grant select on public.broadcast_audit to authenticated;
create policy "admins read broadcast audit" on public.broadcast_audit
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

grant select, update on public.broadcast_settings to authenticated;
create policy "admins read broadcast settings" on public.broadcast_settings
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admins toggle broadcast settings" on public.broadcast_settings
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
