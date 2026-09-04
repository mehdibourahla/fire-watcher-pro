begin;

set local search_path = public, extensions;

select no_plan();

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  id,
  'authenticated',
  'authenticated',
  email,
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
from (
  values
    ('f0270000-0000-4000-8000-000000000001'::uuid, 'f027-user@example.invalid'),
    ('f0270000-0000-4000-8000-000000000002'::uuid, 'f027-moderator@example.invalid'),
    ('f0270000-0000-4000-8000-000000000003'::uuid, 'f027-admin@example.invalid')
) as fixtures(id, email);

insert into public.user_roles (user_id, role)
values
  ('f0270000-0000-4000-8000-000000000002', 'report_moderator'),
  ('f0270000-0000-4000-8000-000000000002', 'translator'),
  ('f0270000-0000-4000-8000-000000000003', 'admin');

insert into public.contribution_ideas (
  id,
  created_at,
  lane,
  message,
  contact,
  locale,
  status,
  published_at,
  moderation_note
)
values
  (
    'f0271000-0000-4000-8000-000000000001',
    '2026-08-31 20:00:00+00',
    'local',
    'Published fixture message long enough for the database constraint.',
    'private-published@example.invalid',
    'en',
    'published',
    '2026-08-31 20:01:00+00',
    'private published note'
  ),
  (
    'f0271000-0000-4000-8000-000000000002',
    '2026-08-31 21:00:00+00',
    'language',
    'Pending fixture message long enough for the database constraint.',
    'private-pending@example.invalid',
    'fr',
    'pending',
    null,
    'private pending note'
  );

insert into public.translation_suggestions (
  id,
  created_at,
  locale,
  key_path,
  source_text,
  current_text,
  suggestion,
  verdict,
  reviewer_key,
  reviewer_name,
  status
)
values (
  'f0230000-0000-4000-8000-000000000001',
  '2026-08-31 21:00:00+00',
  'kab',
  'qa.fixture',
  'Source fixture',
  'Current fixture',
  'Suggested fixture',
  'suggested',
  'f023-reviewer',
  'Private reviewer',
  'pending'
);

create function pg_temp.qa_scalar(_query text)
returns jsonb
language plpgsql
as $$
declare
  result jsonb;
begin
  execute _query into result;
  return result;
exception
  when undefined_function or undefined_table then
    return null;
end;
$$;

grant execute on function pg_temp.qa_scalar(text) to public;

select has_view(
  'public',
  'published_contribution_ideas',
  'published ideas have a dedicated safe projection'
);
select is(
  (
    select jsonb_agg(column_name order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'published_contribution_ideas'
  ),
  '["id", "lane", "message", "score", "published_at"]'::jsonb,
  'the public projection contains only documented safe fields'
);
select ok(
  coalesce((
    select reloptions @> array['security_barrier=true']
    from pg_class
    where oid = to_regclass('public.published_contribution_ideas')
  ), false),
  'the safe owner-bypass projection is a security-barrier view'
);
select ok(
  not has_table_privilege('anon', 'public.contribution_ideas', 'select')
  and not has_table_privilege('authenticated', 'public.contribution_ideas', 'select')
  and not has_table_privilege('anon', 'public.translation_suggestions', 'select')
  and not has_table_privilege('authenticated', 'public.translation_suggestions', 'select'),
  'Data API callers cannot read either private base table'
);
select ok(
  not has_column_privilege('anon', 'public.contribution_ideas', 'contact', 'select')
  and not has_column_privilege('anon', 'public.contribution_ideas', 'moderation_note', 'select')
  and not has_column_privilege('anon', 'public.contribution_ideas', 'moderated_by', 'select')
  and not has_column_privilege('authenticated', 'public.contribution_ideas', 'contact', 'select')
  and not has_column_privilege('authenticated', 'public.contribution_ideas', 'moderation_note', 'select')
  and not has_column_privilege('authenticated', 'public.contribution_ideas', 'moderated_by', 'select'),
  'contact and moderation metadata have no direct column grant'
);

set local role anon;
select is(
  pg_temp.qa_scalar(
    $$select jsonb_build_object(
        'id', id,
        'lane', lane,
        'message', message,
        'score', score,
        'published_at', published_at
      )
      from public.published_contribution_ideas
      where id = 'f0271000-0000-4000-8000-000000000001'$$
  ),
  '{
    "id": "f0271000-0000-4000-8000-000000000001",
    "lane": "local",
    "message": "Published fixture message long enough for the database constraint.",
    "score": 0,
    "published_at": "2026-08-31T20:01:00+00:00"
  }'::jsonb,
  'anonymous readers retain the published board contract'
);
select is(
  pg_temp.qa_scalar(
    $$select to_jsonb(count(*)::integer)
      from public.published_contribution_ideas
      where id = 'f0271000-0000-4000-8000-000000000002'$$
  ),
  '0'::jsonb,
  'the safe projection never publishes pending ideas'
);
select throws_ok(
  $$select contact
    from public.contribution_ideas
    where id = 'f0271000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'anonymous direct contact reads are denied'
);
select throws_ok(
  $$select moderation_note, moderated_by
    from public.contribution_ideas
    where id = 'f0271000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'anonymous direct moderation metadata reads are denied'
);
select throws_ok(
  $$select public.moderate_contribution_idea(
      'f0271000-0000-4000-8000-000000000001',
      'rejected',
      null
    )$$,
  '42501',
  null,
  'anonymous callers cannot invoke idea moderation'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f0270000-0000-4000-8000-000000000001',
  true
);
select is(
  pg_temp.qa_scalar(
    $$select to_jsonb(count(*)::integer)
      from public.published_contribution_ideas
      where id = 'f0271000-0000-4000-8000-000000000001'$$
  ),
  '1'::jsonb,
  'ordinary signed-in readers retain the published board'
);
select throws_ok(
  $$select contact
    from public.contribution_ideas
    where id = 'f0271000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'ordinary signed-in callers cannot read published contact data'
);
select throws_ok(
  $$select * from public.list_contribution_ideas_for_moderation()$$,
  '42501',
  'moderation_role_required',
  'ordinary signed-in callers cannot open the private idea queue'
);
select throws_ok(
  $$select * from public.list_translation_suggestions_for_moderation()$$,
  '42501',
  'moderation_role_required',
  'ordinary signed-in callers cannot open the private translation queue'
);
select throws_ok(
  $$select public.moderate_contribution_idea(
      'f0271000-0000-4000-8000-000000000001',
      'rejected',
      'abuse'
    )$$,
  '42501',
  'moderation_role_required',
  'ordinary signed-in callers cannot moderate ideas through the RPC'
);
select throws_ok(
  $$select public.moderate_translation_suggestion(
      'f0230000-0000-4000-8000-000000000001',
      'accepted',
      'abuse'
    )$$,
  '42501',
  'moderation_role_required',
  'ordinary signed-in callers cannot moderate translations through the RPC'
);
select throws_ok(
  $$update public.contribution_ideas
    set status = 'rejected'
    where id = 'f0271000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'ordinary signed-in callers cannot bypass the RPC with a table update'
);

select set_config(
  'request.jwt.claim.sub',
  'f0270000-0000-4000-8000-000000000002',
  true
);
select is(
  pg_temp.qa_scalar(
    $$select jsonb_build_object(
        'contact', contact,
        'moderation_note', moderation_note
      )
      from public.list_contribution_ideas_for_moderation()
      where id = 'f0271000-0000-4000-8000-000000000002'$$
  ),
  '{
    "contact": "private-pending@example.invalid",
    "moderation_note": "private pending note"
  }'::jsonb,
  'report moderators retain private idea queue fields needed for review'
);
select is(
  pg_temp.qa_scalar(
    $$select jsonb_build_object(
        'reviewer_name', reviewer_name,
        'suggestion', suggestion
      )
      from public.list_translation_suggestions_for_moderation()
      where id = 'f0230000-0000-4000-8000-000000000001'$$
  ),
  '{
    "reviewer_name": "Private reviewer",
    "suggestion": "Suggested fixture"
  }'::jsonb,
  'translators retain the full translation queue'
);
select throws_ok(
  $$select public.moderate_contribution_idea(
      'f0271000-0000-4000-8000-000000000001',
      'approved',
      null
    )$$,
  '22023',
  'invalid_idea_status',
  'idea moderation rejects statuses outside its state machine'
);
select throws_ok(
  $$select public.moderate_translation_suggestion(
      'f0230000-0000-4000-8000-000000000001',
      'published',
      null
    )$$,
  '22023',
  'invalid_translation_status',
  'translation moderation rejects statuses outside its state machine'
);
select lives_ok(
  $$select public.moderate_contribution_idea(
      'f0271000-0000-4000-8000-000000000002',
      'published',
      'reviewed by moderator'
    )$$,
  'a report moderator can publish an idea'
);
select lives_ok(
  $$select public.moderate_translation_suggestion(
      'f0230000-0000-4000-8000-000000000001',
      'accepted',
      null
    )$$,
  'a translator can accept a translation'
);

reset role;
select ok(
  (
    select
      status = 'published'
      and published_at is not null
      and moderated_by = 'f0270000-0000-4000-8000-000000000002'
      and moderation_note = 'reviewed by moderator'
    from public.contribution_ideas
    where id = 'f0271000-0000-4000-8000-000000000002'
  ),
  'idea publication atomically records timestamp, actor, and note'
);
select ok(
  (
    select
      status = 'accepted'
      and moderated_by = 'f0270000-0000-4000-8000-000000000002'
      and moderation_note is null
    from public.translation_suggestions
    where id = 'f0230000-0000-4000-8000-000000000001'
  ),
  'translation acceptance atomically records its actor and cleared note'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f0270000-0000-4000-8000-000000000003',
  true
);
select lives_ok(
  $$select public.moderate_contribution_idea(
      'f0271000-0000-4000-8000-000000000002',
      'pending',
      null
    )$$,
  'an admin can return an idea to triage'
);
select lives_ok(
  $$select public.moderate_translation_suggestion(
      'f0230000-0000-4000-8000-000000000001',
      'rejected',
      'stale copy'
    )$$,
  'an admin can re-triage a translation'
);

reset role;
select ok(
  (
    select
      status = 'pending'
      and published_at is null
      and moderated_by = 'f0270000-0000-4000-8000-000000000003'
      and moderation_note is null
    from public.contribution_ideas
    where id = 'f0271000-0000-4000-8000-000000000002'
  ),
  'idea re-triage clears publication data and replaces moderation metadata'
);
select ok(
  (
    select
      status = 'rejected'
      and moderated_by = 'f0270000-0000-4000-8000-000000000003'
      and moderation_note = 'stale copy'
    from public.translation_suggestions
    where id = 'f0230000-0000-4000-8000-000000000001'
  ),
  'translation re-triage replaces actor and moderation note atomically'
);

select * from finish();

rollback;
