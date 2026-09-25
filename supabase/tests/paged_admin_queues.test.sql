begin;
set local search_path = public, extensions;
select plan(14);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, '', now(), created_at, now()
from (values
  ('26000000-0000-4000-8000-000000000001'::uuid, 'paged-admin@example.invalid', now()),
  ('26000000-0000-4000-8000-000000000002'::uuid, 'paged-probe-one@example.invalid', '2099-01-01'::timestamptz),
  ('26000000-0000-4000-8000-000000000003'::uuid, 'paged-probe-two@example.invalid', '2099-01-02'::timestamptz),
  ('26000000-0000-4000-8000-000000000004'::uuid, 'paged-plain@example.invalid', now())
) as users(id, email, created_at);
insert into public.user_roles (user_id, role) values
  ('26000000-0000-4000-8000-000000000001', 'admin'),
  ('26000000-0000-4000-8000-000000000003', 'translator');

set local role authenticated;
select set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-000000000001', true);
create temp table baseline as select public.idea_queue_counts() as ideas, public.translation_queue_counts() as strings;
reset role;

insert into public.contribution_ideas (id, created_at, lane, message, locale, status) values
  ('26000000-0000-4000-8000-000000000011', '2099-01-02', 'code', 'A newer pending idea about paging the queue', 'en', 'pending'),
  ('26000000-0000-4000-8000-000000000012', '2099-01-01', 'code', 'An older pending idea about paging the queue', 'en', 'pending'),
  ('26000000-0000-4000-8000-000000000013', '2099-01-03', 'code', 'A published idea that the pending filter skips', 'en', 'published');
insert into public.translation_suggestions (id, created_at, locale, key_path, source_text, current_text, suggestion, verdict, reviewer_key, status) values
  ('26000000-0000-4000-8000-000000000021', '2099-01-02', 'kab', 'paged.first', 'a', 'b', 'c', 'suggested', 'paged-reviewer-1', 'pending'),
  ('26000000-0000-4000-8000-000000000022', '2099-01-03', 'kab', 'paged.first', 'a', 'b', 'd', 'suggested', 'paged-reviewer-2', 'pending'),
  ('26000000-0000-4000-8000-000000000023', '2099-01-01', 'kab', 'paged.second', 'a', 'b', 'e', 'suggested', 'paged-reviewer-1', 'pending');

set local role authenticated;
select set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-000000000001', true);

select is((select count(*) from public.list_members_page('paged-probe', null, 'newest', 0, 1)), 1::bigint,
  'a member page holds only the requested rows');
select is((select matching from public.list_members_page('paged-probe', null, 'newest', 0, 1)), 2::bigint,
  'each page still says how many members match the search');
select is((select email from public.list_members_page('paged-probe', null, 'newest', 1, 1)), 'paged-probe-one@example.invalid',
  'the next page continues where the first stopped');
select is((select array_agg(email order by email) from public.list_members_page('paged-probe', 'none', 'newest', 0, 25)),
  array['paged-probe-one@example.invalid'], 'the no-role filter runs on the server');
select throws_ok($$select * from public.list_members_page(null, null, 'newest', 0, 1000)$$, '22023', 'invalid_page',
  'a page larger than 100 members is refused');
select throws_ok($$select * from public.list_contribution_ideas_for_moderation(null, 0, null)$$, '22023', 'invalid_page',
  'a missing page size is refused, never read as no limit');

select is((select array_agg(id::text) from public.list_contribution_ideas_for_moderation('pending', 0, 1)),
  array['26000000-0000-4000-8000-000000000011'], 'ideas page on the server, filtered by status');
select is((select array_agg(id::text) from public.list_contribution_ideas_for_moderation('pending', 1, 1)),
  array['26000000-0000-4000-8000-000000000012'], 'the next idea page continues');
select is(((public.idea_queue_counts() ->> 'pending')::int - coalesce((select (ideas ->> 'pending')::int from baseline), 0)), 2,
  'idea counts cover every row, not only the loaded page');

select is((select count(*) from public.list_translation_suggestions_for_moderation('pending', 'kab', 0, 1)), 2::bigint,
  'one string is one page item, with all its suggestions');
select is((select array_agg(distinct key_path) from public.list_translation_suggestions_for_moderation('pending', 'kab', 1, 1)),
  array['paged.second'], 'the next page starts at the next string');
select is(((public.translation_queue_counts() -> 'strings' ->> 'pending')::int
    - coalesce((select (strings -> 'strings' ->> 'pending')::int from baseline), 0)), 2,
  'string counts count strings, not suggestions');

select set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-000000000004', true);
select throws_ok($$select * from public.list_members_page()$$, '42501', 'admin_role_required',
  'members without the admin role cannot page the directory');
select throws_ok($$select public.translation_queue_counts()$$, '42501', 'moderation_role_required',
  'queue counts are private to moderators');
reset role;

select * from finish();
rollback;
