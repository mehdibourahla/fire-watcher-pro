-- ONM vigilance warnings relayed verbatim: Nadhir never edits an authority's
-- warning, so the row mirrors the CAP summary fields as published.
create table onm_vigilance (
  id uuid primary key default gen_random_uuid(),
  cap_id text not null unique,
  title text not null,
  event text not null,
  severity text not null,
  urgency text not null,
  certainty text not null,
  onset timestamptz,
  expires timestamptz,
  sent timestamptz not null,
  area_desc text not null,
  cap_url text,
  wilaya_id uuid references admin_units(id),
  created_at timestamptz not null default now()
);

alter table onm_vigilance enable row level security;
create policy "onm vigilance is public reference data"
  on onm_vigilance for select using (true);

create index idx_onm_wilaya_expires on onm_vigilance (wilaya_id, expires desc);

insert into data_sources (name, label, status, note)
  values ('onm', 'ONM vigilance (Météo Algérie)', 'degraded', 'Never fetched yet.');
