begin;

set local search_path = public, extensions;

select plan(7);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
  email, '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
from (
  values
    ('ad010000-0000-4000-8000-000000000001'::uuid, 'ad01-translator@example.invalid'),
    ('ad010000-0000-4000-8000-000000000002'::uuid, 'ad01-operator@example.invalid')
) as fixtures(id, email);

insert into public.user_roles (user_id, role) values
  ('ad010000-0000-4000-8000-000000000001', 'translator'),
  ('ad010000-0000-4000-8000-000000000002', 'operator');

select ok(
  public.has_any_role(
    'ad010000-0000-4000-8000-000000000001',
    array['translator','admin']::public.app_role[]
  ),
  'has_any_role matches one of several roles'
);

select ok(
  not public.has_any_role(
    'ad010000-0000-4000-8000-000000000001',
    array['operator','admin']::public.app_role[]
  ),
  'has_any_role denies a role the user lacks'
);

select throws_ok(
  $$insert into public.user_roles (user_id, role)
    values ('ad010000-0000-4000-8000-000000000002', 'moderator')$$,
  null, null,
  'moderator can no longer be granted'
);

select is(
  (select count(*)::int from pg_policies
   where schemaname in ('public','storage') and coalesce(qual, '') like '%''moderator''%'),
  0,
  'no policy still reads on moderator'
);

select is(
  (select count(*)::int from pg_policies
   where schemaname in ('public','storage') and coalesce(with_check, '') like '%''moderator''%'),
  0,
  'no policy still writes on moderator'
);

select is(
  (select count(*)::int from public.user_roles where role = 'moderator'),
  0,
  'no moderator grant survives the migration'
);

select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'list_contribution_ideas_for_moderation',
       'list_translation_suggestions_for_moderation',
       'moderate_contribution_idea',
       'moderate_translation_suggestion'
     )
     and pg_get_functiondef(p.oid) like '%''moderator''%'),
  0,
  'no moderation function still checks the retired role'
);

select * from finish();

rollback;
