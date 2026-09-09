revoke execute on function public.record_admin_audit(text,text,text,text,jsonb,jsonb,text,text) from public, anon, authenticated;

create table public.webhook_outbox (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_id uuid not null references public.alerts(id) on delete cascade,
  payload jsonb not null,
  state text not null default 'pending' check (state in ('pending','leased','sent','dead','cancelled')),
  attempts integer not null default 0 check (attempts between 0 and 8),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  unique (endpoint_id, alert_id)
);
alter table public.webhook_outbox enable row level security;
revoke all on public.webhook_outbox from public, anon, authenticated, service_role;
grant select on public.webhook_outbox to authenticated, service_role;
create policy "owners read webhook outbox" on public.webhook_outbox for select to authenticated using ((select auth.uid()) = user_id);
create index webhook_outbox_due_idx on public.webhook_outbox (available_at, id) where state in ('pending','leased');
create index webhook_outbox_user_idx on public.webhook_outbox (user_id);
create index webhook_outbox_alert_idx on public.webhook_outbox (alert_id);

create function public.enqueue_alert_webhooks() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.webhook_outbox (endpoint_id,user_id,alert_id,payload)
  select e.id,new.user_id,new.id,jsonb_build_object(
    'type','alert.' || new.kind,
    'alert',jsonb_build_object('id',new.id,'kind',new.kind,'severity',new.severity,
      'title',new.title,'body',new.body,'distance_km',new.distance_km,'zone_id',new.zone_id,'payload',new.payload),
    'sent_at',new.created_at)
  from public.webhook_endpoints e
  where e.user_id = new.user_id and e.active and new.kind = any(e.kinds) and new.severity >= e.min_severity;
  return new;
end;
$$;
revoke all on function public.enqueue_alert_webhooks() from public,anon,authenticated,service_role;
create trigger alerts_enqueue_webhooks after insert on public.alerts for each row execute function public.enqueue_alert_webhooks();

create function public.claim_webhook_delivery()
returns table (id uuid,lease_token uuid,url text,secret text,payload jsonb)
language plpgsql security definer set search_path = '' as $$
declare q public.webhook_outbox;
begin
  update public.webhook_outbox o set state = 'cancelled',lease_token = null,lease_until = null
  where o.state in ('pending','leased') and (o.lease_until is null or o.lease_until < now())
    and not exists (select 1 from public.webhook_endpoints e where e.id = o.endpoint_id and e.user_id = o.user_id and e.active);
  update public.webhook_outbox o set state = 'dead',lease_token = null,lease_until = null
  where o.state = 'leased' and o.lease_until < now() and o.attempts >= 8;
  select o.* into q from public.webhook_outbox o
  where o.state in ('pending','leased') and o.available_at <= now()
    and (o.lease_until is null or o.lease_until < now()) and o.attempts < 8
  order by o.available_at,o.id for update skip locked limit 1;
  if not found then return; end if;
  update public.webhook_outbox o set state = 'leased',attempts = attempts + 1,
    lease_token = gen_random_uuid(),lease_until = now() + interval '120 seconds'
    where o.id = q.id returning o.* into q;
  return query select q.id,q.lease_token,e.url,e.secret,q.payload || jsonb_build_object('event_id',q.id)
    from public.webhook_endpoints e where e.id = q.endpoint_id and e.user_id = q.user_id and e.active;
end;
$$;

create function public.finish_webhook_delivery(_id uuid,_token uuid,_status integer,_error text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare q public.webhook_outbox; succeeded boolean := _status between 200 and 299 and _error is null;
begin
  select * into q from public.webhook_outbox where id = _id and state = 'leased'
    and lease_token = _token and lease_until > now() for update;
  if not found then return false; end if;
  succeeded := coalesce(succeeded,false);
  insert into public.webhook_deliveries(endpoint_id,user_id,alert_id,status_code,ok,error)
    values(q.endpoint_id,q.user_id,q.alert_id,_status,succeeded,left(_error,80));
  update public.webhook_outbox set state = case when succeeded then 'sent' when attempts >= 8 then 'dead' else 'pending' end,
    available_at = now() + least(3600,30 * power(2,q.attempts - 1)) * interval '1 second',lease_token = null,lease_until = null where id = q.id;
  update public.webhook_endpoints set last_status = _status,last_error = left(_error,80),last_attempt_at = now() where id = q.endpoint_id;
  if succeeded then update public.alerts set delivered_webhook = true where id = q.alert_id; end if;
  return true;
end;
$$;
revoke all on function public.claim_webhook_delivery() from public,anon,authenticated;
revoke all on function public.finish_webhook_delivery(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.claim_webhook_delivery() to service_role;
grant execute on function public.finish_webhook_delivery(uuid,uuid,integer,text) to service_role;
