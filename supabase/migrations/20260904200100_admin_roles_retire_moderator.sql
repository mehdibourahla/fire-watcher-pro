create or replace function public.has_any_role(_user_id uuid, _roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = any(_roles)
  )
$$;

revoke execute on function public.has_any_role(uuid, public.app_role[]) from anon, public;
grant execute on function public.has_any_role(uuid, public.app_role[]) to authenticated, service_role;

insert into public.user_roles (user_id, role)
select ur.user_id, r.role
from public.user_roles as ur
cross join (values
  ('report_moderator'::public.app_role),
  ('translator'::public.app_role),
  ('incident_editor'::public.app_role)
) as r(role)
where ur.role = 'moderator'
on conflict do nothing;

drop policy if exists "moderators read all reports" on public.citizen_reports;
create policy "report moderators read all reports"
on public.citizen_reports for select to authenticated
using (public.has_any_role(auth.uid(), array['report_moderator','operator','admin']::public.app_role[]));

drop policy if exists "moderators update reports" on public.citizen_reports;
create policy "report moderators update reports"
on public.citizen_reports for update to authenticated
using (public.has_any_role(auth.uid(), array['report_moderator','admin']::public.app_role[]))
with check (public.has_any_role(auth.uid(), array['report_moderator','admin']::public.app_role[]));

drop policy if exists "moderators resolve clusters" on public.fire_clusters;
create policy "operators resolve fires"
on public.fire_clusters for update to authenticated
using (public.has_any_role(auth.uid(), array['operator','admin']::public.app_role[]))
with check (public.has_any_role(auth.uid(), array['operator','admin']::public.app_role[]));

drop policy if exists "moderators read votes" on public.contribution_idea_votes;
create policy "report moderators read votes"
on public.contribution_idea_votes for select to authenticated
using (public.has_any_role(auth.uid(), array['report_moderator','admin']::public.app_role[]));

drop policy if exists "report photos moderator read" on storage.objects;
create policy "report photos moderator read"
on storage.objects for select to authenticated
using (
  bucket_id = 'report-photos'
  and public.has_any_role(auth.uid(), array['report_moderator','operator','admin']::public.app_role[])
);

-- These four are unreachable: the 2026-09-01 migration revoked every table grant from
-- authenticated, so access runs through the security-definer functions below instead.
drop policy if exists "moderators read suggestions" on public.translation_suggestions;
drop policy if exists "moderators update suggestions" on public.translation_suggestions;
drop policy if exists "moderators read every idea" on public.contribution_ideas;
drop policy if exists "moderators update ideas" on public.contribution_ideas;

create or replace function public.list_contribution_ideas_for_moderation()
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

  return query
  select ideas.*
  from public.contribution_ideas as ideas
  order by ideas.created_at desc
  limit 300;
end;
$$;

create or replace function public.list_translation_suggestions_for_moderation()
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

  return query
  select suggestions.*
  from public.translation_suggestions as suggestions
  order by suggestions.created_at desc
  limit 500;
end;
$$;

create or replace function public.moderate_contribution_idea(
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
  if not public.has_any_role(actor, array['report_moderator','admin']::public.app_role[]) then
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

create or replace function public.moderate_translation_suggestion(
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
  if not public.has_any_role(actor, array['translator','admin']::public.app_role[]) then
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

delete from public.user_roles where role = 'moderator';

alter table public.user_roles
  add constraint user_roles_moderator_retired check (role <> 'moderator');
