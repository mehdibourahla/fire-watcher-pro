-- Source corrections must never reopen a retry window.
create function public.onm_delivery_deadline(_sent timestamptz, _onset timestamptz, _expires timestamptz)
returns timestamptz language sql stable set search_path = '' as $$
  select case
    when _sent is null or not isfinite(_sent) or _sent > now()
      or not isfinite(coalesce(_onset, _sent))
      or not isfinite(coalesce(_expires, coalesce(_onset, _sent) + interval '24 hours'))
      or coalesce(_expires, coalesce(_onset, _sent) + interval '24 hours') <= coalesce(_onset, _sent)
    then '-infinity'::timestamptz
    else coalesce(_expires, coalesce(_onset, _sent) + interval '24 hours')
  end;
$$;

create function public.clamp_onm_delivery_deadline() returns trigger
language plpgsql security definer set search_path = '' as $$
declare source_deadline timestamptz; broadcast_deadline timestamptz;
begin
  if new.state not in ('pending', 'leased') then return new; end if;
  select public.onm_delivery_deadline(v.sent, v.onset, v.expires), b.created_at + interval '24 hours'
    into source_deadline, broadcast_deadline
  from public.broadcasts b join public.onm_vigilance v on v.id = b.onm_vigilance_id
  where b.id = new.broadcast_id and b.kind = 'onm';
  if found then
    new.expires_at := least(new.expires_at, source_deadline, broadcast_deadline);
    if tg_op = 'UPDATE' then new.expires_at := least(new.expires_at, old.expires_at); end if;
  end if;
  return new;
end;
$$;
create trigger clamp_onm_delivery_deadline before insert or update
  on public.broadcast_delivery_queue for each row execute function public.clamp_onm_delivery_deadline();

create function public.shorten_onm_delivery_deadlines() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.broadcast_delivery_queue q
    set expires_at = least(q.expires_at, public.onm_delivery_deadline(new.sent, new.onset, new.expires))
  from public.broadcasts b
  where b.id = q.broadcast_id and b.kind = 'onm' and b.onm_vigilance_id = new.id
    and q.state in ('pending', 'leased');
  return new;
end;
$$;
create trigger shorten_onm_delivery_deadlines after update of sent, onset, expires
  on public.onm_vigilance for each row execute function public.shorten_onm_delivery_deadlines();

-- Check the final deadline after clamping a concurrent source correction.
create or replace function public.renew_broadcast_delivery(_broadcast_id uuid, _channel text, _lease_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare still_valid boolean;
begin
  update public.broadcast_delivery_queue q set lease_until=now()+interval '90 seconds'
  where q.broadcast_id=_broadcast_id and q.channel=_channel and q.lease_token=_lease_token
    and q.state='leased' and q.lease_until>now() and q.expires_at>now()
    and exists(select 1 from public.delivery_channel_settings c where c.channel=_channel and not c.paused)
    and exists(select 1 from public.broadcast_settings where id=true and enabled)
  returning q.expires_at>now() into still_valid;
  return coalesce(still_valid, false);
end;
$$;

revoke all on function public.onm_delivery_deadline(timestamptz,timestamptz,timestamptz),
  public.clamp_onm_delivery_deadline(), public.shorten_onm_delivery_deadlines()
  from public, anon, authenticated, service_role;

-- Backfill deadlines without discarding active leases or delivery history.
update public.broadcast_delivery_queue q set expires_at = q.expires_at
from public.broadcasts b
where b.id = q.broadcast_id and b.kind = 'onm' and q.state in ('pending', 'leased');
