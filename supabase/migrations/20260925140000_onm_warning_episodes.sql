-- ONM renews a live warning before it expires with a later onset; overlapping windows are one episode
create or replace view public.onm_warning_history
with (security_invoker = true)
as
with windows as (
  select
    id,
    wilaya_id,
    coalesce(wilaya_id::text, area_desc) as area,
    event,
    severity,
    coalesce(onset, sent) as starts_at,
    coalesce(expires, onset, sent) as ends_at,
    sent
  from public.onm_vigilance
),
marked as (
  select *,
    case when starts_at > coalesce(max(ends_at) over (
      partition by area, event, severity order by starts_at, sent
      rows between unbounded preceding and 1 preceding), '-infinity') then 1 else 0 end as opens
  from windows
),
episodes as (
  select *, sum(opens) over (partition by area, event, severity order by starts_at, sent) as episode
  from marked
)
select distinct on (area, event, severity, episode)
  id,
  wilaya_id,
  event,
  severity,
  starts_at,
  max(ends_at) over (partition by area, event, severity, episode) as expires
from episodes
order by area, event, severity, episode, starts_at, sent;
