-- ONM renews a warning under a new id; its episode is fixed on arrival, so a zone re-alerts only when severity rises
alter table public.onm_vigilance
  add column episode_id uuid,
  add column episode_peak smallint;

create index onm_vigilance_episode_lookup_idx
  on public.onm_vigilance ((coalesce(wilaya_id::text, area_desc)), event, sent desc);

create function public.onm_severity_rank(_severity text) returns smallint
language sql immutable set search_path = '' as $$
  select (case _severity when 'Extreme' then 4 when 'Severe' then 3 when 'Moderate' then 2
    when 'Minor' then 1 else 0 end)::smallint
$$;

-- the most recently sent warning of the same area and event whose validity overlaps this one
create function public.onm_episode_of(_warning public.onm_vigilance)
returns table(episode_id uuid, episode_peak smallint)
language sql stable set search_path = '' as $$
  select coalesce(p.episode_id, _warning.id),
    greatest(coalesce(p.episode_peak, 0), public.onm_severity_rank(_warning.severity))::smallint
  from (select 1) one
  left join lateral (
    select v.episode_id, v.episode_peak
    from public.onm_vigilance v
    where v.id <> _warning.id
      and v.episode_id is not null
      and coalesce(v.wilaya_id::text, v.area_desc) = coalesce(_warning.wilaya_id::text, _warning.area_desc)
      and v.event = _warning.event
      and coalesce(v.onset, v.sent) <= coalesce(_warning.expires, _warning.onset, _warning.sent)
      and coalesce(_warning.onset, _warning.sent) <= coalesce(v.expires, v.onset, v.sent)
    -- warnings sent in the same second: prefer the higher peak so an escalation is never lost
    order by v.sent desc, v.episode_peak desc, v.id desc
    limit 1
  ) p on true
$$;

create function public.assign_onm_episode() returns trigger
language plpgsql set search_path = '' as $$
begin
  select e.episode_id, e.episode_peak into new.episode_id, new.episode_peak
  from public.onm_episode_of(new) e;
  return new;
end;
$$;
revoke all on function public.assign_onm_episode() from public, anon, authenticated;

do $$
declare
  w public.onm_vigilance;
begin
  for w in select * from public.onm_vigilance order by sent, id loop
    update public.onm_vigilance v
      set episode_id = e.episode_id, episode_peak = e.episode_peak
      from public.onm_episode_of(w) e
      where v.id = w.id;
  end loop;
end;
$$;

alter table public.onm_vigilance
  alter column episode_id set not null,
  alter column episode_peak set not null;

create trigger onm_vigilance_episode
  before insert on public.onm_vigilance
  for each row execute function public.assign_onm_episode();
