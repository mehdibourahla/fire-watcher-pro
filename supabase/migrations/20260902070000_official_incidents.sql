alter table public.source_contracts drop constraint source_contracts_family_check;
alter table public.source_contracts add constraint source_contracts_family_check check (
  family in (
    'fire_detection',
    'detection_processing',
    'official_warnings',
    'official_text',
    'fire_danger',
    'broadcast_delivery',
    'reference_enrichment'
  )
);

create table public.text_sources (
  id uuid primary key default gen_random_uuid(),
  key text not null unique references public.source_contracts(key),
  label text not null,
  kind text not null check (kind in ('telegram_public', 'rss')),
  url text not null,
  authority_tier text not null check (
    authority_tier in ('national', 'wilaya', 'forestry', 'media')
  ),
  language text not null default 'ar',
  wilaya_id uuid references public.admin_units(id),
  template text check (template in ('dgpc_bulletin')),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.source_documents (
  id uuid primary key default gen_random_uuid(),
  text_source_id uuid not null references public.text_sources(id),
  external_id text not null,
  url text not null,
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  content_hash text not null,
  body text not null,
  raw jsonb,
  unique (text_source_id, external_id)
);

create index source_documents_source_published_idx
  on public.source_documents (text_source_id, published_at desc);

create function public.reject_source_document_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'source_document_is_immutable';
end;
$$;

create trigger reject_source_document_mutation
before update or delete on public.source_documents
for each row execute function public.reject_source_document_mutation();

create table public.official_incidents (
  id uuid primary key default gen_random_uuid(),
  wilaya_id uuid not null references public.admin_units(id),
  commune_id uuid references public.admin_units(id),
  kind text not null check (
    kind in ('vegetation', 'agricultural', 'urban', 'unknown')
  ),
  status text not null check (
    status in ('ongoing', 'contained', 'extinguished', 'monitoring', 'unknown')
  ),
  precision text not null check (precision in ('commune', 'wilaya', 'place')),
  authority_tier text not null check (
    authority_tier in ('national', 'wilaya', 'forestry', 'media')
  ),
  place_text text,
  first_reported_at timestamptz not null,
  last_reported_at timestamptz not null,
  as_of timestamptz not null,
  mention_count integer not null default 1 check (mention_count > 0),
  latest_mention_id uuid,
  evidence text not null,
  updated_at timestamptz not null default now()
);

create index official_incidents_match_idx
  on public.official_incidents (coalesce(commune_id, wilaya_id), kind, last_reported_at desc);

create table public.incident_mentions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.source_documents(id),
  text_source_id uuid not null references public.text_sources(id),
  wilaya_id uuid not null references public.admin_units(id),
  commune_id uuid references public.admin_units(id),
  place_text text,
  kind text not null check (
    kind in ('vegetation', 'agricultural', 'urban', 'unknown')
  ),
  status text not null check (
    status in ('ongoing', 'contained', 'extinguished', 'monitoring', 'unknown')
  ),
  fire_count integer not null default 1 check (fire_count > 0),
  as_of timestamptz not null,
  precision text not null check (precision in ('commune', 'wilaya', 'place')),
  evidence text not null,
  extractor text not null check (extractor in ('template', 'llm')),
  incident_id uuid references public.official_incidents(id),
  created_at timestamptz not null default now()
);

create index incident_mentions_document_idx on public.incident_mentions (document_id);
create index incident_mentions_commune_as_of_idx
  on public.incident_mentions (commune_id, as_of desc) where commune_id is not null;

alter table public.official_incidents
  add constraint official_incidents_latest_mention_fkey
  foreign key (latest_mention_id) references public.incident_mentions(id);

create function public.reject_incident_mention_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    or old.incident_id is not null
    or new.incident_id is null
    or to_jsonb(new) - 'incident_id' <> to_jsonb(old) - 'incident_id'
  then
    raise exception using errcode = '55000', message = 'incident_mention_is_append_only';
  end if;
  return new;
end;
$$;

create trigger reject_incident_mention_mutation
before update or delete on public.incident_mentions
for each row execute function public.reject_incident_mention_mutation();

create table public.admin_unit_aliases (
  admin_unit_id uuid not null references public.admin_units(id) on delete cascade,
  alias_ar text not null,
  source text not null,
  primary key (admin_unit_id, alias_ar)
);

-- spellings observed in DGPC bulletins during the 2026-09-01 recall study
insert into public.admin_unit_aliases (admin_unit_id, alias_ar, source)
select u.id, v.alias, 'dgpc'
from (values
  ('Bekkouche Lakhdar', 'بكوش لخضر'),
  ('Bordj Tahar', 'برج الطاهر'),
  ('Taskriout', 'تاسكريوت'),
  ('Heliopolis', 'هليوبوليس'),
  ('Ouldja Boulballout', 'الولجة بولبلوط'),
  ('Hammam Beni Salah', 'حمام بن صالح'),
  ('Boudria Ben Yadjis', 'بوذريعة بني ياجيس'),
  ('Tamridjet', 'تامريجت')
) as v(name_fr, alias)
join public.admin_units u on u.name_fr = v.name_fr and u.level = 'commune';

-- a mention "hits" when a satellite cluster touched the same commune within a day
create view public.official_incident_recall_daily
with (security_invoker = true)
as
with resolved as (
  select
    m.id,
    m.commune_id,
    (m.as_of at time zone 'Africa/Algiers')::date as day,
    exists (
      select 1 from public.fire_clusters c
      where c.commune_id = m.commune_id
        and c.first_detected_at <= m.as_of + interval '24 hours'
        and c.last_detected_at >= m.as_of - interval '24 hours'
    ) as hit
  from public.incident_mentions m
  where m.commune_id is not null
)
select
  day,
  count(*)::integer as mentions,
  count(distinct commune_id)::integer as communes,
  count(distinct commune_id) filter (where hit)::integer as with_cluster
from resolved
group by day
order by day desc;

alter table public.text_sources enable row level security;
alter table public.source_documents enable row level security;
alter table public.incident_mentions enable row level security;
alter table public.official_incidents enable row level security;
alter table public.admin_unit_aliases enable row level security;

revoke all on public.text_sources, public.source_documents, public.incident_mentions,
  public.official_incidents, public.admin_unit_aliases from public, anon, authenticated;
grant select on public.text_sources, public.source_documents, public.incident_mentions,
  public.official_incidents, public.official_incident_recall_daily to anon, authenticated;
grant select on public.text_sources, public.admin_unit_aliases, public.official_incident_recall_daily to service_role;
grant select, insert on public.source_documents, public.incident_mentions to service_role;
grant update (incident_id) on public.incident_mentions to service_role;
grant select, insert, update on public.official_incidents to service_role;

create policy "text sources are public" on public.text_sources for select to anon, authenticated using (true);
create policy "documents are public" on public.source_documents for select to anon, authenticated using (true);
create policy "mentions are public" on public.incident_mentions for select to anon, authenticated using (true);
create policy "official incidents are public" on public.official_incidents for select to anon, authenticated using (true);

revoke all on function public.reject_source_document_mutation() from public, anon, authenticated, service_role;
revoke all on function public.reject_incident_mention_mutation() from public, anon, authenticated, service_role;

insert into public.source_contracts (
  key, version, label, family, criticality, freshness_basis,
  cadence_minutes, warning_after_minutes, stale_after_minutes, max_fallback_age_minutes,
  expected_coverage, parser_version, dependency_keys, licence, attribution, owner,
  enabled, schedule_enabled, schedule_offset_minutes, execution_target,
  lease_seconds, max_attempts, retry_base_seconds, retry_window_minutes,
  overlap_minutes, replay_capability, replay_window_minutes
)
values (
  'dgpc_telegram', 1, 'Protection Civile (DGPC) Telegram', 'official_text', 'supporting',
  'last_success_at', 15, 360, 1440, null,
  '{"kind":"successful_poll"}'::jsonb, 'dgpc-telegram-v1', '{}',
  'Public official channel, attributed', 'الحماية المدنية الجزائرية', 'Nadhir maintainers',
  true, true, 3, 'cloudflare',
  120, 3, 60, 30,
  0, 'none', null
);

insert into public.text_sources (key, label, kind, url, authority_tier, language, template)
values ('dgpc_telegram', 'Protection Civile (DGPC) Telegram', 'telegram_public',
        'https://t.me/s/DGPCDZ', 'national', 'ar', 'dgpc_bulletin');
