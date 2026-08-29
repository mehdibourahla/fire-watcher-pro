-- EFFIS/GWIS daily danger classification per commune (GAPS §2.2): the external
-- authority the §1.1 danger-scale calibration needs to compare against.

create table public.effis_danger (
  id uuid primary key default gen_random_uuid(),
  commune_id uuid not null references public.admin_units(id),
  date date not null,
  danger_class text not null check (
    danger_class in ('very_low','low','moderate','high','very_high','extreme')
  ),
  created_at timestamptz not null default now(),
  unique (commune_id, date)
);

alter table public.effis_danger enable row level security;

create policy "effis danger is public reference data"
  on public.effis_danger for select using (true);
