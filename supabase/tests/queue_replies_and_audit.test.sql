begin;

set local search_path = public, extensions;

select plan(10);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
  email, '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
from (
  values
    ('ad040000-0000-4000-8000-000000000001'::uuid, 'ad04-reporter@example.invalid'),
    ('ad040000-0000-4000-8000-000000000002'::uuid, 'ad04-translator@example.invalid')
) as fixtures(id, email);

insert into public.user_roles (user_id, role) values
  ('ad040000-0000-4000-8000-000000000001', 'report_moderator'),
  ('ad040000-0000-4000-8000-000000000002', 'translator');

insert into public.contribution_ideas (id, lane, message, locale, status)
values (
  'ad040000-0000-4000-8000-0000000000aa',
  'other',
  'A submitted idea long enough to satisfy the twenty five character minimum.',
  'en',
  'pending'
);

insert into public.contribution_ideas (id, lane, message, locale, status)
values (
  'ad040000-0000-4000-8000-0000000000cc',
  'other',
  'A second idea, also long enough to clear the twenty five character minimum.',
  'en',
  'pending'
);

insert into public.translation_suggestions (
  id, locale, key_path, source_text, current_text, suggestion, verdict, reviewer_key
) values (
  'ad040000-0000-4000-8000-0000000000bb',
  'kab', 'common.close', 'Close', 'Mdel', 'Belaɛ', 'suggested', 'reviewerkey01'
);

select throws_ok(
  $$insert into public.translation_suggestions
      (locale, key_path, source_text, current_text, suggestion, verdict, reviewer_key)
    values ('kab','common.back','Back','Uɣal','Uɣal','suggested','reviewerkey02')$$,
  null, null,
  'a suggestion identical to the current text is refused'
);

select lives_ok(
  $$insert into public.translation_suggestions
      (locale, key_path, source_text, current_text, suggestion, verdict, reviewer_key)
    values ('kab','common.back','Back','Uɣal',null,'confirmed','reviewerkey03')$$,
  'a confirmation still needs no suggestion'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', 'ad040000-0000-4000-8000-000000000002', true
);

select lives_ok(
  $$select public.moderate_translation_suggestion(
      'ad040000-0000-4000-8000-0000000000bb', 'rejected', 'register')$$,
  'a translator can moderate a suggestion'
);

select is(
  (select actor_user_id from public.admin_audit
   where action = 'translation.moderate' order by at desc limit 1),
  'ad040000-0000-4000-8000-000000000002'::uuid,
  'the moderating translator is recorded, not left null'
);

select is(
  (select before ->> 'status' from public.admin_audit
   where action = 'translation.moderate' order by at desc limit 1),
  'pending',
  'the audit row keeps the status it moved from'
);

select throws_ok(
  $$select public.reply_to_contribution_idea(
      'ad040000-0000-4000-8000-0000000000aa', 'Thanks', 'person')$$,
  null, null,
  'a translator cannot reply to an idea'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', 'ad040000-0000-4000-8000-000000000001', true
);

select lives_ok(
  $$select public.reply_to_contribution_idea(
      'ad040000-0000-4000-8000-0000000000aa', 'We are on it.', 'person')$$,
  'a report moderator can reply to an idea'
);

select throws_ok(
  $$select public.reply_to_contribution_idea(
      'ad040000-0000-4000-8000-0000000000aa', 'Hello', 'robot')$$,
  null, null,
  'an unknown author kind is refused'
);

reset role;

select is(
  (select reply_author_kind from public.contribution_ideas
   where id = 'ad040000-0000-4000-8000-0000000000aa'),
  'person',
  'the reply records what kind of author wrote it'
);

select throws_ok(
  $$update public.contribution_ideas
    set reply = 'orphan' where id = 'ad040000-0000-4000-8000-0000000000cc'$$,
  null, null,
  'a reply cannot exist without its timestamp and author kind'
);

select * from finish();

rollback;
