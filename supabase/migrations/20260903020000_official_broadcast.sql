alter table public.broadcasts
  add column official_incident_id uuid references public.official_incidents(id) on delete set null;

alter table public.broadcasts drop constraint broadcasts_kind_check;
alter table public.broadcasts
  add constraint broadcasts_kind_check
  check (kind in ('fire', 'onm', 'authority', 'official'));

alter table public.broadcasts drop constraint broadcasts_check;
alter table public.broadcasts
  add constraint broadcasts_check check (
    (kind = 'fire' and cluster_id is not null)
    or (kind = 'onm' and onm_vigilance_id is not null)
    or (kind = 'authority' and authority_warning_id is not null)
    or (kind = 'official' and official_incident_id is not null)
  );

create unique index idx_broadcasts_official_once
  on public.broadcasts (official_incident_id) where kind = 'official';
