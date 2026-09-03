-- gaps were recorded and never drained: 92 sat open while 157 aged into unrecoverable
create function private.replay_open_source_gaps(
  _now timestamptz,
  _limit integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _gap record;
  _enqueued integer := 0;
begin
  for _gap in
    select gap.id
    from public.source_gaps gap
    join public.source_contracts contract on contract.key = gap.contract_key
    where gap.state = 'open'
      and contract.replay_capability = 'interval'
      and gap.replay_count < 3
    order by gap.data_from
    limit greatest(_limit, 0)
  loop
    begin
      if public.enqueue_source_replay(_gap.id, _now) is not null then
        _enqueued := _enqueued + 1;
      end if;
    exception when raise_exception then
      if sqlerrm <> 'source gap already has active work' then
        raise;
      end if;
    end;
  end loop;

  return _enqueued;
end;
$$;

revoke all on function private.replay_open_source_gaps(timestamptz, integer)
  from public, anon, authenticated, service_role;

-- both stay current-only: a stale daily slot must never run. Their retries were
-- spent inside 20 minutes of a 720-minute window, so a brief upstream outage cost
-- the whole day; a wider base spreads five attempts across ~7.5h instead
update public.source_contracts
set max_attempts = 5, retry_base_seconds = 1800
where key in ('local_fwi', 'effis');

select cron.schedule(
  'nadhir-gap-replay',
  '*/5 * * * *',
  $$select private.replay_open_source_gaps(now(), 2)$$
);
