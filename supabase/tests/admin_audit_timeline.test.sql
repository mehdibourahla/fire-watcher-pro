begin;

set local search_path = public, extensions;

select plan(5);

select has_view('public', 'admin_audit_timeline', 'the unioned timeline exists');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'ad030000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'ad03-actor@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.broadcast_audit (action, reason, actor_id)
values ('disabled', 'admin_toggle', 'ad030000-0000-4000-8000-000000000001');

insert into public.broadcast_audit (action, reason, cluster_id)
values ('published', 'cluster_alert', null);

select is(
  (select action from public.admin_audit_timeline
   where target_table = 'broadcast_audit' and actor_user_id is not null),
  'broadcast.disabled',
  'a human toggle is projected with its action prefixed'
);

select is(
  (select actor_kind from public.admin_audit_timeline
   where target_table = 'broadcast_audit' and actor_user_id is not null),
  'user',
  'a toggle carrying an actor reads as a user action'
);

select is(
  (select actor_label from public.admin_audit_timeline
   where target_table = 'broadcast_audit' and actor_user_id is null),
  'broadcast-pipeline',
  'an automated decision is labelled rather than left anonymous'
);

-- The invariant this view exists to preserve: a human toggle cannot be recorded anonymously.
select throws_ok(
  $$insert into public.broadcast_audit (action, reason, actor_id)
    values ('disabled', 'admin_toggle', null)$$,
  null, null,
  'broadcast_audit still refuses an unattributed admin toggle'
);

select * from finish();

rollback;
