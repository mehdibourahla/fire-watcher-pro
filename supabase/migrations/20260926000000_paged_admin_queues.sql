create function public.list_members_page(
  _search text default null,
  _role text default null,
  _sort text default 'newest',
  _offset integer default 0,
  _limit integer default 25
)
returns table (
  id uuid,
  email text,
  display_name text,
  locale text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  roles public.app_role[],
  zone_count integer,
  report_count integer,
  matching bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _needle text := nullif(lower(btrim(coalesce(_search, ''))), '');
begin
  if not public.has_role((select auth.uid()), 'admin'::public.app_role) then
    raise insufficient_privilege using message = 'admin_role_required';
  end if;
  if coalesce(_offset < 0 or _limit not between 1 and 100 or _sort not in ('newest', 'oldest', 'email'), true)
    or (_role is not null and _role <> 'none' and _role not in (select unnest(enum_range(null::public.app_role))::text)) then
    raise invalid_parameter_value using message = 'invalid_page';
  end if;

  return query
  with members as (
    select
      u.id,
      u.email::text as email,
      p.display_name,
      coalesce(p.locale, 'ar') as locale,
      u.created_at,
      u.last_sign_in_at,
      coalesce(
        (select array_agg(r.role order by r.role)
         from public.user_roles as r where r.user_id = u.id),
        '{}'::public.app_role[]
      ) as roles
    from auth.users as u
    left join public.profiles as p on p.id = u.id
  ), matched as (
    select m.*
    from members as m
    where (_needle is null
        or strpos(lower(coalesce(m.display_name, '')), _needle) > 0
        or strpos(lower(m.email), _needle) > 0
        or strpos(m.id::text, _needle) > 0)
      and (_role is null
        or (_role = 'none' and not m.roles && array['operator', 'report_moderator', 'translator', 'incident_editor', 'admin']::public.app_role[])
        or (_role <> 'none' and _role::public.app_role = any (m.roles)))
  )
  select
    m.id, m.email, m.display_name, m.locale, m.created_at, m.last_sign_in_at, m.roles,
    (select count(*)::integer from public.zones as z where z.user_id = m.id),
    (select count(*)::integer from public.citizen_reports as c where c.user_id = m.id),
    count(*) over ()
  from matched as m
  order by
    case when _sort = 'email' then m.email end,
    case when _sort = 'oldest' then m.created_at end,
    m.created_at desc,
    m.id
  offset _offset
  limit _limit;
end;
$$;
revoke all on function public.list_members_page(text, text, text, integer, integer) from public, anon, service_role;
grant execute on function public.list_members_page(text, text, text, integer, integer) to authenticated;

create function public.member_counts_for_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role((select auth.uid()), 'admin'::public.app_role) then
    raise insufficient_privilege using message = 'admin_role_required';
  end if;
  return jsonb_build_object(
    'total', (select count(*) from auth.users),
    'with_role', (select count(distinct r.user_id) from public.user_roles as r
      where r.role = any (array['operator', 'report_moderator', 'translator', 'incident_editor', 'admin']::public.app_role[]))
  );
end;
$$;
revoke all on function public.member_counts_for_admin() from public, anon, service_role;
grant execute on function public.member_counts_for_admin() to authenticated;

-- same name and no-argument result as before, so existing callers and the privacy tests are unchanged
drop function public.list_contribution_ideas_for_moderation();
create function public.list_contribution_ideas_for_moderation(
  _status text default null,
  _offset integer default 0,
  _limit integer default 300
)
returns setof public.contribution_ideas
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_any_role(
    (select auth.uid()),
    array['report_moderator','admin']::public.app_role[]
  ) then
    raise insufficient_privilege using message = 'moderation_role_required';
  end if;
  if coalesce(_offset < 0 or _limit not between 1 and 300, true) then
    raise invalid_parameter_value using message = 'invalid_page';
  end if;

  return query
  select ideas.*
  from public.contribution_ideas as ideas
  where _status is null or ideas.status = _status
  order by ideas.created_at desc, ideas.id
  offset _offset
  limit _limit;
end;
$$;
revoke all on function public.list_contribution_ideas_for_moderation(text, integer, integer) from public, anon, service_role;
grant execute on function public.list_contribution_ideas_for_moderation(text, integer, integer) to authenticated;

create function public.idea_queue_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_any_role(
    (select auth.uid()),
    array['report_moderator','admin']::public.app_role[]
  ) then
    raise insufficient_privilege using message = 'moderation_role_required';
  end if;
  return coalesce(
    (select jsonb_object_agg(status, n) from (
      select ideas.status, count(*) as n from public.contribution_ideas as ideas group by ideas.status) as counts),
    '{}'::jsonb
  );
end;
$$;
revoke all on function public.idea_queue_counts() from public, anon, service_role;
grant execute on function public.idea_queue_counts() to authenticated;

-- pages whole strings (locale and key), so one string's suggestions never split across pages
drop function public.list_translation_suggestions_for_moderation();
create function public.list_translation_suggestions_for_moderation(
  _status text default null,
  _locale text default null,
  _offset integer default 0,
  _limit integer default 500
)
returns setof public.translation_suggestions
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_any_role(
    (select auth.uid()),
    array['translator','admin']::public.app_role[]
  ) then
    raise insufficient_privilege using message = 'moderation_role_required';
  end if;
  if coalesce(_offset < 0 or _limit not between 1 and 500, true) then
    raise invalid_parameter_value using message = 'invalid_page';
  end if;

  return query
  with strings as (
    select s.locale, s.key_path, max(s.created_at) as latest
    from public.translation_suggestions as s
    where (_status is null or s.status = _status)
      and (_locale is null or s.locale = _locale)
    group by s.locale, s.key_path
    order by latest desc, s.locale, s.key_path
    offset _offset
    limit _limit
  )
  select suggestions.*
  from public.translation_suggestions as suggestions
  join strings on strings.locale = suggestions.locale and strings.key_path = suggestions.key_path
  where _status is null or suggestions.status = _status
  order by strings.latest desc, suggestions.locale, suggestions.key_path, suggestions.created_at desc;
end;
$$;
revoke all on function public.list_translation_suggestions_for_moderation(text, text, integer, integer) from public, anon, service_role;
grant execute on function public.list_translation_suggestions_for_moderation(text, text, integer, integer) to authenticated;

create function public.translation_queue_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_any_role(
    (select auth.uid()),
    array['translator','admin']::public.app_role[]
  ) then
    raise insufficient_privilege using message = 'moderation_role_required';
  end if;
  return jsonb_build_object(
    'strings', coalesce(
      (select jsonb_object_agg(status, n) from (
        select s.status, count(distinct (s.locale, s.key_path)) as n
        from public.translation_suggestions as s group by s.status) as counts),
      '{}'::jsonb),
    'locales', coalesce(
      (select jsonb_agg(distinct s.locale order by s.locale) from public.translation_suggestions as s),
      '[]'::jsonb)
  );
end;
$$;
revoke all on function public.translation_queue_counts() from public, anon, service_role;
grant execute on function public.translation_queue_counts() to authenticated;
