alter table public.contribution_ideas
  add column reply text check (reply is null or char_length(reply) between 1 and 2000),
  add column replied_at timestamptz,
  add column replied_by uuid references auth.users(id) on delete set null,
  add column reply_author_kind text
    check (reply_author_kind is null or reply_author_kind in ('person', 'agent'));

alter table public.contribution_ideas
  add constraint contribution_ideas_reply_shape check (
    (reply is null and replied_at is null and reply_author_kind is null)
    or (reply is not null and replied_at is not null and reply_author_kind is not null)
  );

-- The five historical rows predate this rule, so only new writes are checked.
alter table public.translation_suggestions
  add constraint translation_suggestions_suggestion_changes check (
    verdict = 'confirmed' or suggestion is distinct from current_text
  ) not valid;

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
  previous public.contribution_ideas;
begin
  if not public.has_any_role(actor, array['report_moderator','admin']::public.app_role[]) then
    raise insufficient_privilege using message = 'moderation_role_required';
  end if;

  if _status not in ('pending', 'published', 'rejected', 'spam') then
    raise invalid_parameter_value using message = 'invalid_idea_status';
  end if;

  select * into previous from public.contribution_ideas where id = _idea;
  if not found then
    raise no_data_found using message = 'idea_not_found';
  end if;

  update public.contribution_ideas
  set
    status = _status,
    published_at = case when _status = 'published' then now() else null end,
    moderated_by = actor,
    moderation_note = _moderation_note
  where id = _idea;

  perform public.record_admin_audit(
    'queues',
    'idea.moderate',
    'contribution_ideas',
    _idea::text,
    jsonb_build_object('status', previous.status),
    jsonb_build_object('status', _status),
    _moderation_note
  );
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
  previous public.translation_suggestions;
begin
  if not public.has_any_role(actor, array['translator','admin']::public.app_role[]) then
    raise insufficient_privilege using message = 'moderation_role_required';
  end if;

  if _status not in ('pending', 'accepted', 'rejected') then
    raise invalid_parameter_value using message = 'invalid_translation_status';
  end if;

  select * into previous from public.translation_suggestions where id = _suggestion;
  if not found then
    raise no_data_found using message = 'suggestion_not_found';
  end if;

  update public.translation_suggestions
  set
    status = _status,
    moderated_by = actor,
    moderation_note = _moderation_note
  where id = _suggestion;

  perform public.record_admin_audit(
    'queues',
    'translation.moderate',
    'translation_suggestions',
    _suggestion::text,
    jsonb_build_object('status', previous.status, 'key_path', previous.key_path),
    jsonb_build_object('status', _status, 'key_path', previous.key_path),
    _moderation_note
  );
end;
$$;

create or replace function public.reply_to_contribution_idea(
  _idea uuid,
  _reply text,
  _author_kind text,
  _actor_label text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  -- The planned reply agent runs without a session, so a null actor must name its job instead.
  if actor is null then
    if _actor_label is null then
      raise insufficient_privilege using message = 'actor_label_required';
    end if;
  elsif not public.has_any_role(
    actor, array['report_moderator','admin']::public.app_role[]
  ) then
    raise insufficient_privilege using message = 'moderation_role_required';
  end if;

  if _author_kind not in ('person', 'agent') then
    raise invalid_parameter_value using message = 'invalid_reply_author_kind';
  end if;

  if _reply is null or char_length(btrim(_reply)) = 0 then
    raise invalid_parameter_value using message = 'empty_reply';
  end if;

  update public.contribution_ideas
  set
    reply = btrim(_reply),
    replied_at = now(),
    replied_by = actor,
    reply_author_kind = _author_kind
  where id = _idea;

  if not found then
    raise no_data_found using message = 'idea_not_found';
  end if;

  perform public.record_admin_audit(
    'queues',
    'idea.reply',
    'contribution_ideas',
    _idea::text,
    null,
    jsonb_build_object('author_kind', _author_kind),
    null,
    _actor_label
  );
end;
$$;

revoke execute on function public.reply_to_contribution_idea(uuid, text, text, text)
  from public, anon;
grant execute on function public.reply_to_contribution_idea(uuid, text, text, text)
  to authenticated, service_role;

