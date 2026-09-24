-- existing alerts take 'skipped' from the column default (no table rewrite): history is never pushed
alter table public.alerts
  add column push_state text not null default 'skipped'
    check (push_state in ('pending','sent','failed','skipped')),
  add column push_claimed_at timestamptz,
  add column push_attempts smallint not null default 0;
alter table public.alerts alter column push_state set default 'pending';

create index alerts_push_pending_idx on public.alerts (created_at) where push_state = 'pending';

create function public.claim_alert_pushes(_limit integer default 50)
returns setof public.alerts
language sql volatile security definer set search_path='' as $$
  update public.alerts a
     set push_claimed_at = now(), push_attempts = a.push_attempts + 1
   where a.id in (
     select id from public.alerts
      where push_state = 'pending'
        and created_at > now() - interval '6 hours'
        and push_attempts < 5
        and (push_claimed_at is null or push_claimed_at < now() - interval '5 minutes')
      order by created_at
      limit _limit
      for update skip locked)
  returning a.*
$$;
revoke all on function public.claim_alert_pushes(integer) from public, anon, authenticated;
grant execute on function public.claim_alert_pushes(integer) to service_role;

-- clients only mark alerts read; push and source columns are server-owned
revoke update on public.alerts from authenticated, anon;
grant update (read_at) on public.alerts to authenticated;
