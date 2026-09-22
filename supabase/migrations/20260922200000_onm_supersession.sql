-- ONM republishes whole bulletins as new Alerts without CAP references, so a
-- warning's absence from a newer feed is the only sign it was replaced.
alter table public.onm_vigilance add column superseded_at timestamptz;

create index onm_vigilance_current_idx on public.onm_vigilance(expires)
  where superseded_at is null;

-- only the newest feed speaks for ONM: an older or cached one neither retires nor revives
create function public.supersede_onm_absent(_feed_cap_ids text[], _feed_sent timestamptz)
returns integer
language plpgsql
set search_path = public
as $$
declare
  _stamped integer;
begin
  if coalesce(cardinality(_feed_cap_ids), 0) = 0 or _feed_sent is null then
    raise exception 'a supersession pass needs a non-empty feed' using errcode = '22023';
  end if;
  if _feed_sent < (select max(sent) from public.onm_vigilance) then
    return 0;
  end if;
  update public.onm_vigilance
     set superseded_at = null
   where superseded_at is not null
     and cap_id = any(_feed_cap_ids);
  update public.onm_vigilance
     set superseded_at = clock_timestamp()
   where superseded_at is null
     and sent < _feed_sent
     and (expires is null or expires > clock_timestamp())
     and cap_id <> all(_feed_cap_ids);
  get diagnostics _stamped = row_count;
  return _stamped;
end;
$$;
revoke all on function public.supersede_onm_absent(text[], timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.supersede_onm_absent(text[], timestamptz) to service_role;
