begin;

set local search_path = public, extensions;

select plan(7);

select has_table('public', 'admin_audit', 'admin_audit exists');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'ad020000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'ad02-actor@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

select throws_ok(
  $$insert into public.admin_audit (actor_kind, domain, action, target_table)
    values ('system', 'queues', 'x.y', 'translation_suggestions')$$,
  null, null,
  'a system row without a label is refused'
);

set local role service_role;

select lives_ok(
  $$select public.record_admin_audit(
      'queues', 'translation.reject', 'translation_suggestions',
      '00000000-0000-4000-8000-000000000001', null,
      '{"status":"rejected"}'::jsonb, 'register', 'test-job')$$,
  'record_admin_audit accepts a write with no session'
);

select is(
  (select actor_kind from public.admin_audit order by at desc limit 1),
  'system',
  'an absent auth.uid() records as system'
);

select is(
  (select actor_label from public.admin_audit order by at desc limit 1),
  'test-job',
  'the job name is kept for a system write'
);

select throws_ok(
  $$update public.admin_audit set reason = 'tampered'$$,
  null, null,
  'service_role cannot rewrite an audit row'
);

select throws_ok(
  $$delete from public.admin_audit$$,
  null, null,
  'service_role cannot delete an audit row'
);

reset role;

select * from finish();

rollback;
