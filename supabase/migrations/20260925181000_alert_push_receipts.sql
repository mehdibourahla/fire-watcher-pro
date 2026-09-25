-- FCM accepts a push to a topic no device holds, so "sent" proves nothing; the device's own receipt does
alter table public.alerts add column push_received_at timestamptz;

create function public.admin_push_delivery(_days integer default 7)
returns table(day date, sent bigint, received bigint, no_device bigint, failed bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_any_role((select auth.uid()), array['operator','admin']::public.app_role[]) then
    raise insufficient_privilege using message = 'operator_role_required';
  end if;
  return query
    select (a.created_at at time zone 'Africa/Algiers')::date,
      count(*) filter (where a.push_state = 'sent'),
      count(*) filter (where a.push_received_at is not null),
      count(*) filter (where a.push_state = 'no_device'),
      count(*) filter (where a.push_state = 'failed')
    from public.alerts a
    where a.created_at > now() - make_interval(days => least(greatest(_days, 1), 30))
      and a.push_state <> 'skipped'
    group by 1
    order by 1 desc;
end;
$$;
revoke all on function public.admin_push_delivery(integer) from public, anon, service_role;
grant execute on function public.admin_push_delivery(integer) to authenticated;
