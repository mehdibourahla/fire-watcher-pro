-- ONM renews a warning under a new id with a later onset; like broadcasts, a zone re-alerts only when severity rises
create function public.onm_alert_keys(_ids uuid[])
returns table(warning_id uuid, alert_key text)
language sql stable security definer set search_path = '' as $$
  with windows as (
    select id,
      coalesce(wilaya_id::text, area_desc) as area,
      event,
      case severity when 'Extreme' then 4 when 'Severe' then 3 when 'Moderate' then 2 when 'Minor' then 1 else 0 end
        as rank,
      coalesce(onset, sent) as starts_at,
      coalesce(expires, onset, sent) as ends_at,
      sent
    from public.onm_vigilance
    where coalesce(expires, onset, sent) > now() - interval '7 days' or id = any(_ids)
  ),
  marked as (
    select *,
      case when starts_at > coalesce(max(ends_at) over (
        partition by area, event order by starts_at, sent
        rows between unbounded preceding and 1 preceding), '-infinity') then 1 else 0 end as opens
    from windows
  ),
  episodes as (
    select *, sum(opens) over (partition by area, event order by starts_at, sent) as episode
    from marked
  ),
  keyed as (
    select id,
      first_value(id) over (partition by area, event, episode order by starts_at, sent) as episode_id,
      max(rank) over (partition by area, event, episode order by starts_at, sent
        rows between unbounded preceding and current row) as peak
    from episodes
  )
  select id, 'weather:' || episode_id || ':' || peak
  from keyed
  where id = any(_ids);
$$;
revoke all on function public.onm_alert_keys(uuid[]) from public, anon, authenticated;
grant execute on function public.onm_alert_keys(uuid[]) to service_role;

-- sent weather alerts take the new key so the deploy does not re-alert; the earliest copy per person wins
with keys as (
  select warning_id, alert_key from public.onm_alert_keys(array(
    select distinct source_id from public.alerts
    where kind = 'weather' and source_table = 'onm_vigilance'))
),
ranked as (
  select a.id, a.user_id, k.alert_key,
    row_number() over (partition by a.user_id, k.alert_key order by a.created_at, a.id) as n
  from public.alerts a
  join keys k on k.warning_id = a.source_id
  where a.kind = 'weather' and a.source_table = 'onm_vigilance' and a.dedupe_key <> k.alert_key
)
update public.alerts a
set dedupe_key = r.alert_key
from ranked r
where a.id = r.id and r.n = 1
  and not exists (select 1 from public.alerts b where b.user_id = r.user_id and b.dedupe_key = r.alert_key);
