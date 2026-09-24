alter table public.zones
  add column notify_weather boolean not null default true,
  add column notify_official boolean not null default true,
  add column notify_road boolean not null default true;

alter table public.alerts
  drop constraint alerts_kind_check,
  add constraint alerts_kind_check check (kind in ('fire','risk','weather','official','road')),
  add column source_table text,
  add column source_id uuid,
  add constraint alerts_source_pair check ((source_table is null) = (source_id is null));

create function public.text_array_distinct(_values text[])
returns boolean language sql immutable set search_path='' as $$
  select count(*) = count(distinct v) from unnest(_values) v
$$;

-- existing endpoints keep the kinds they chose: new kinds are opt-in for external consumers
alter table public.webhook_endpoints
  drop constraint webhook_endpoints_kinds_allowed,
  drop constraint webhook_endpoints_kinds_unique,
  add constraint webhook_endpoints_kinds_allowed check (
    array_position(kinds, null) is null
    and kinds <@ array['fire','risk','weather','official','road']::text[]
  ),
  add constraint webhook_endpoints_kinds_unique check (public.text_array_distinct(kinds));
