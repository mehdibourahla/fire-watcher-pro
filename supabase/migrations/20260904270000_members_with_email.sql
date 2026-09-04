insert into public.profiles (id, display_name)
select u.id, nullif(u.raw_user_meta_data ->> 'full_name', '')
from auth.users as u
left join public.profiles as p on p.id = u.id
where p.id is null;

create or replace function public.ensure_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.ensure_profile_for_new_user()
  from public, anon, authenticated, service_role;

-- Profiles were created lazily on first read, so an account that never opened a page that
-- reads one stayed invisible to /admin/people and to the alerts engine.
drop trigger if exists users_ensure_profile on auth.users;
create trigger users_ensure_profile
after insert on auth.users
for each row
execute function public.ensure_profile_for_new_user();

create or replace function public.list_members_for_admin()
returns table (
  id uuid,
  email text,
  display_name text,
  locale text,
  created_at timestamptz,
  roles public.app_role[]
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
    coalesce(
      array_agg(r.role order by r.role) filter (where r.role is not null),
      '{}'::public.app_role[]
    )
  from auth.users as u
  left join public.profiles as p on p.id = u.id
  left join public.user_roles as r on r.user_id = u.id
  group by u.id, u.email, p.display_name, p.locale, u.created_at
  order by u.created_at desc
  limit 500;
end;
$$;

revoke execute on function public.list_members_for_admin() from public, anon, service_role;
grant execute on function public.list_members_for_admin() to authenticated;
