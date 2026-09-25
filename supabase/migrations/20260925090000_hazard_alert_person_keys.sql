-- hazard alerts are keyed per person, not per zone; the earliest of each person's copies takes the new key
with ranked as (
  select id, user_id,
    regexp_replace(dedupe_key, '^(weather|official|road):[0-9a-f-]{36}:', '\1:') as person_key,
    row_number() over (
      partition by user_id, regexp_replace(dedupe_key, '^(weather|official|road):[0-9a-f-]{36}:', '\1:')
      order by created_at, id
    ) as n
  from public.alerts
  where dedupe_key ~ '^(weather|official|road):[0-9a-f-]{36}:'
)
update public.alerts a
set dedupe_key = r.person_key
from ranked r
where a.id = r.id and r.n = 1
  and not exists (select 1 from public.alerts b where b.user_id = r.user_id and b.dedupe_key = r.person_key);
