-- ONM repeats the same wilaya outline in every CAP; the map needs it once, not on each 60 s refresh.
create view public.onm_wilaya_outlines with (security_invoker = true) as
select distinct on (wilaya_id) wilaya_id, polygon
from public.onm_vigilance
where wilaya_id is not null and polygon is not null
order by wilaya_id, cap_detail_fetched_at desc nulls last, sent desc;

grant select on public.onm_wilaya_outlines to anon, authenticated;

create index onm_vigilance_outline_idx on public.onm_vigilance
  (wilaya_id, cap_detail_fetched_at desc nulls last, sent desc)
  where wilaya_id is not null and polygon is not null;
