-- the return columns change, which create-or-replace cannot do
drop function if exists public.list_members_for_admin();

create function public.list_members_for_admin()
returns table (
  id uuid,
  email text,
  display_name text,
  locale text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  roles public.app_role[],
  zone_count integer,
  report_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role((select auth.uid()), 'admin'::public.app_role) then
    raise insufficient_privilege using message = 'admin_role_required';
  end if;

  return query
  select
    u.id,
    u.email::text,
    p.display_name,
    coalesce(p.locale, 'ar'),
    u.created_at,
    u.last_sign_in_at,
    coalesce(
      (select array_agg(r.role order by r.role)
       from public.user_roles as r where r.user_id = u.id),
      '{}'::public.app_role[]
    ),
    (select count(*)::integer from public.zones as z where z.user_id = u.id),
    (select count(*)::integer from public.citizen_reports as c where c.user_id = u.id)
  from auth.users as u
  left join public.profiles as p on p.id = u.id
  order by u.created_at desc
  limit 500;
end;
$$;

create or replace function public.member_detail_for_admin(_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  detail jsonb;
begin
  if not public.has_role(actor, 'admin'::public.app_role) then
    raise insufficient_privilege using message = 'admin_role_required';
  end if;

  select jsonb_build_object(
    'alert_email', p.alert_email,
    'alert_push', p.alert_push,
    'min_danger_level', p.min_danger_level,
    'min_confidence', p.min_confidence,
    'quiet_hours_start', p.quiet_hours_start,
    'quiet_hours_end', p.quiet_hours_end,
    'has_phone', p.phone is not null,
    'zones', coalesce(
      (select jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name)
              order by z.created_at)
       from public.zones as z where z.user_id = _user),
      '[]'::jsonb),
    'alerts_received', (
      select count(*)::integer from public.alerts as a where a.user_id = _user),
    'webhooks', (
      select count(*)::integer from public.webhook_endpoints as w where w.user_id = _user),
    'recent_actions', coalesce(
      (select jsonb_agg(jsonb_build_object('at', x.at, 'action', x.action, 'domain', x.domain))
       from (
         select aa.at, aa.action, aa.domain
         from public.admin_audit as aa
         where aa.actor_user_id = _user
         order by aa.at desc
         limit 10
       ) as x),
      '[]'::jsonb)
  )
  into detail
  from public.profiles as p
  where p.id = _user;

  if detail is null then
    raise no_data_found using message = 'member_not_found';
  end if;

  return detail;
end;
$$;

revoke execute on function public.list_members_for_admin() from public, anon, service_role;
grant execute on function public.list_members_for_admin() to authenticated;

revoke execute on function public.member_detail_for_admin(uuid) from public, anon, service_role;
grant execute on function public.member_detail_for_admin(uuid) to authenticated;
