-- ONM repeats one outline per wilaya on every warning; keyed by content so a redrawn outline keeps old warnings exact
create table public.onm_areas (
  id text primary key check (id ~ '^[0-9a-f]{32}$'),
  polygon jsonb not null,
  check (id = md5(polygon::text))
);
alter table public.onm_areas enable row level security;
revoke all on public.onm_areas from public, anon, authenticated;
grant select on public.onm_areas to anon, authenticated;
revoke insert, update, delete, truncate on public.onm_areas from service_role;
create policy "onm areas are public reference data" on public.onm_areas for select using (true);

insert into public.onm_areas (id, polygon)
select distinct md5(polygon::text), polygon from public.onm_vigilance where polygon is not null;

alter table public.onm_vigilance add column area_id text references public.onm_areas (id);
update public.onm_vigilance set area_id = md5(polygon::text) where polygon is not null;

drop view public.onm_wilaya_outlines;
drop index if exists public.onm_vigilance_outline_idx;
alter table public.onm_vigilance drop column polygon;

create index onm_vigilance_outline_idx on public.onm_vigilance
  (wilaya_id, cap_detail_fetched_at desc nulls last, sent desc)
  where wilaya_id is not null and area_id is not null;

create view public.onm_wilaya_outlines with (security_invoker = true) as
select distinct on (v.wilaya_id) v.wilaya_id, a.polygon
from public.onm_vigilance v
join public.onm_areas a on a.id = v.area_id
where v.wilaya_id is not null
order by v.wilaya_id, v.cap_detail_fetched_at desc nulls last, v.sent desc;
grant select on public.onm_wilaya_outlines to anon, authenticated;

create function public.store_onm_detail(
  _id uuid, _headline_fr text default null, _instruction_fr text default null, _polygon jsonb default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare _area text := case when _polygon is null then null else md5(_polygon::text) end;
begin
  if _area is not null then
    insert into public.onm_areas (id, polygon) values (_area, _polygon) on conflict (id) do nothing;
  end if;
  update public.onm_vigilance
  set headline_fr = _headline_fr,
      instruction_fr = _instruction_fr,
      area_id = _area,
      cap_detail_fetched_at = now()
  where id = _id;
  if not found then raise exception 'onm_warning_not_found' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.store_onm_detail(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.store_onm_detail(uuid, text, text, jsonb) to service_role;
