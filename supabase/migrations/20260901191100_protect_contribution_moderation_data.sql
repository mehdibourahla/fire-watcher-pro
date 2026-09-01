begin;

drop policy if exists "read published ideas" on public.contribution_ideas;
drop policy if exists "moderators read every idea" on public.contribution_ideas;
drop policy if exists "moderators update ideas" on public.contribution_ideas;
drop policy if exists "moderators read suggestions" on public.translation_suggestions;
drop policy if exists "moderators update suggestions" on public.translation_suggestions;

revoke all on table public.contribution_ideas from public, anon, authenticated;
revoke all on table public.translation_suggestions from public, anon, authenticated;

create view public.published_contribution_ideas
with (security_barrier = true)
as
select
  id,
  lane,
  message,
  score,
  published_at
from public.contribution_ideas
where status = 'published';

revoke all on table public.published_contribution_ideas
  from public, anon, authenticated, service_role;
grant select on table public.published_contribution_ideas
  to anon, authenticated, service_role;

create function public.list_contribution_ideas_for_moderation()
returns setof public.contribution_ideas
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    public.has_role((select auth.uid()), 'moderator'::public.app_role)
    or public.has_role((select auth.uid()), 'admin'::public.app_role)
  ) then
    raise insufficient_privilege using message = 'moderation_role_required';
  end if;

  return query
  select ideas.*
  from public.contribution_ideas as ideas
  order by ideas.created_at desc
  limit 300;
end;
$$;

create function public.list_translation_suggestions_for_moderation()
returns setof public.translation_suggestions
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    public.has_role((select auth.uid()), 'moderator'::public.app_role)
    or public.has_role((select auth.uid()), 'admin'::public.app_role)
  ) then
    raise insufficient_privilege using message = 'moderation_role_required';
  end if;

  return query
  select suggestions.*
  from public.translation_suggestions as suggestions
  order by suggestions.created_at desc
  limit 500;
end;
$$;

create function public.moderate_contribution_idea(
  _idea uuid,
  _status text,
  _moderation_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if not (
    public.has_role(actor, 'moderator'::public.app_role)
    or public.has_role(actor, 'admin'::public.app_role)
  ) then
    raise insufficient_privilege using message = 'moderation_role_required';
  end if;

  if _status not in ('pending', 'published', 'rejected', 'spam') then
    raise invalid_parameter_value using message = 'invalid_idea_status';
  end if;

  update public.contribution_ideas
  set
    status = _status,
    published_at = case when _status = 'published' then now() else null end,
    moderated_by = actor,
    moderation_note = _moderation_note
  where id = _idea;
end;
$$;

create function public.moderate_translation_suggestion(
  _suggestion uuid,
  _status text,
  _moderation_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if not (
    public.has_role(actor, 'moderator'::public.app_role)
    or public.has_role(actor, 'admin'::public.app_role)
  ) then
    raise insufficient_privilege using message = 'moderation_role_required';
  end if;

  if _status not in ('pending', 'accepted', 'rejected') then
    raise invalid_parameter_value using message = 'invalid_translation_status';
  end if;

  update public.translation_suggestions
  set
    status = _status,
    moderated_by = actor,
    moderation_note = _moderation_note
  where id = _suggestion;
end;
$$;

revoke all on function public.list_contribution_ideas_for_moderation()
  from public, anon, authenticated, service_role;
revoke all on function public.list_translation_suggestions_for_moderation()
  from public, anon, authenticated, service_role;
revoke all on function public.moderate_contribution_idea(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.moderate_translation_suggestion(uuid, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.list_contribution_ideas_for_moderation()
  to authenticated;
grant execute on function public.list_translation_suggestions_for_moderation()
  to authenticated;
grant execute on function public.moderate_contribution_idea(uuid, text, text)
  to authenticated;
grant execute on function public.moderate_translation_suggestion(uuid, text, text)
  to authenticated;

commit;
