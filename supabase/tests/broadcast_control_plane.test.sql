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
    ('f0150000-0000-4000-8000-000000000001'::uuid, 'f015-admin@example.invalid'),
    ('f0150000-0000-4000-8000-000000000002'::uuid, 'f015-user@example.invalid')
) as fixtures(id, email);

insert into public.user_roles (user_id, role)
values
  ('f0150000-0000-4000-8000-000000000001', 'admin'),
  ('f0150000-0000-4000-8000-000000000002', 'user');

update public.broadcast_settings
set enabled = true, updated_at = '2026-08-31 20:00:00+00'
where id = true;

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
  when undefined_column or undefined_function or undefined_table then
    return null;
end;
$$;

grant execute on function pg_temp.qa_scalar(text) to public;

select has_column(
  'public',
  'broadcast_audit',
  'actor_id',
  'broadcast audit rows identify their authenticated actor'
);
select ok(
  not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.broadcast_audit'::regclass
      and contype = 'f'
      and conkey = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.broadcast_audit'::regclass
            and attname = 'actor_id'
        )
      ]::smallint[]
  ),
  'audit actor identity survives later account deletion'
);
select has_function(
  'public',
  'set_broadcast_enabled',
  array['boolean'],
  'the kill-switch has a database-owned transition function'
);
select ok(
  case
    when to_regprocedure('public.set_broadcast_enabled(boolean)') is null then false
    else has_function_privilege(
      'authenticated',
      'public.set_broadcast_enabled(boolean)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'public.set_broadcast_enabled(boolean)',
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      'public.set_broadcast_enabled(boolean)',
      'execute'
    )
  end,
  'only signed-in callers can reach the internally authorized transition'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = to_regprocedure('public.set_broadcast_enabled(boolean)')
  ),
  array['search_path=""'],
  'the security-definer transition has an empty search path'
);
select ok(
  not has_table_privilege('anon', 'public.broadcast_settings', 'select')
  and not has_table_privilege('anon', 'public.broadcast_settings', 'update')
  and has_table_privilege('authenticated', 'public.broadcast_settings', 'select')
  and not has_table_privilege('authenticated', 'public.broadcast_settings', 'update')
  and has_table_privilege('service_role', 'public.broadcast_settings', 'select')
  and not has_table_privilege('service_role', 'public.broadcast_settings', 'update'),
  'settings grants preserve admin and publisher reads without direct writes'
);
select ok(
  has_table_privilege('authenticated', 'public.broadcast_audit', 'select')
  and not has_table_privilege('authenticated', 'public.broadcast_audit', 'insert')
  and not has_table_privilege('authenticated', 'public.broadcast_audit', 'update')
  and not has_table_privilege('authenticated', 'public.broadcast_audit', 'delete')
  and not has_table_privilege('authenticated', 'public.broadcast_audit', 'truncate')
  and has_table_privilege('service_role', 'public.broadcast_audit', 'select')
  and not has_table_privilege('service_role', 'public.broadcast_audit', 'insert')
  and has_column_privilege(
    'service_role', 'public.broadcast_audit', 'action', 'insert'
  )
  and has_column_privilege(
    'service_role', 'public.broadcast_audit', 'reason', 'insert'
  )
  and not has_column_privilege(
    'service_role', 'public.broadcast_audit', 'actor_id', 'insert'
  )
  and not has_table_privilege('service_role', 'public.broadcast_audit', 'update')
  and not has_table_privilege('service_role', 'public.broadcast_audit', 'delete')
  and not has_table_privilege('service_role', 'public.broadcast_audit', 'truncate'),
  'audit grants are append-only for every application role'
);

set local role service_role;
select throws_ok(
  $$insert into public.broadcast_audit (action, reason)
    values ('enabled', 'admin_toggle')$$,
  '23514',
  null,
  'the publisher cannot forge an administrator toggle without an actor'
);
select throws_ok(
  $$insert into public.broadcast_audit (action, reason, actor_id)
    values (
      'enabled',
      'admin_toggle',
      'ffffffff-ffff-4fff-8fff-ffffffffffff'
    )$$,
  '42501',
  null,
  'the publisher cannot forge an administrator actor'
);
select throws_ok(
  $$insert into public.broadcast_audit (action, reason)
    values ('published', 'admin_toggle')$$,
  '23514',
  null,
  'the publisher cannot label a publication as an administrator toggle'
);
select throws_ok(
  $$insert into public.broadcast_audit (action, reason)
    values ('suppressed', 'admin_toggle')$$,
  '23514',
  null,
  'the publisher cannot label a suppression as an administrator toggle'
);
select lives_ok(
  $$insert into public.broadcast_audit (action, reason)
    values ('suppressed', 'qa_service_audit')$$,
  'the publisher can still append a system suppression audit row'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f0150000-0000-4000-8000-000000000002',
  true
);
select throws_ok(
  $$select public.set_broadcast_enabled(false)$$,
  '42501',
  'admin_role_required',
  'an ordinary user cannot call the kill-switch transition'
);
select throws_ok(
  $$update public.broadcast_settings set enabled = false where id = true$$,
  '42501',
  null,
  'an ordinary user cannot directly update the singleton'
);

select set_config(
  'request.jwt.claim.sub',
  'f0150000-0000-4000-8000-000000000001',
  true
);
select throws_ok(
  $$update public.broadcast_settings set enabled = false where id = true$$,
  '42501',
  null,
  'an admin cannot bypass audit with a direct table update'
);

reset role;
create function pg_temp.reject_toggle_audit()
returns trigger
language plpgsql
as $$
begin
  raise exception 'qa_rejected_toggle_audit';
end;
$$;
create trigger qa_reject_toggle_audit
before insert on public.broadcast_audit
for each row
when (new.reason = 'admin_toggle')
execute function pg_temp.reject_toggle_audit();

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f0150000-0000-4000-8000-000000000001',
  true
);
select throws_ok(
  $$select public.set_broadcast_enabled(false)$$,
  'P0001',
  'qa_rejected_toggle_audit',
  'an audit failure aborts the settings transition'
);

reset role;
select is(
  (select enabled from public.broadcast_settings where id = true),
  true,
  'a failed audit insert leaves the singleton unchanged'
);
drop trigger qa_reject_toggle_audit on public.broadcast_audit;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f0150000-0000-4000-8000-000000000001',
  true
);
select is(
  pg_temp.qa_scalar(
    $$select to_jsonb(public.set_broadcast_enabled(false))$$
  ) - 'updated_at',
  '{"changed": true, "enabled": false}'::jsonb,
  'an admin can disable broadcasting'
);

reset role;
select ok(
  (
    select not enabled and updated_at > '2026-08-31 20:00:00+00'
    from public.broadcast_settings
    where id = true
  ),
  'the successful transition updates the singleton timestamp'
);
select is(
  pg_temp.qa_scalar(
    $$select jsonb_build_object(
        'action', action,
        'reason', reason,
        'actor_id', actor_id
      )
      from public.broadcast_audit
      where actor_id = 'f0150000-0000-4000-8000-000000000001'
        and reason = 'admin_toggle'
      order by at desc
      limit 1$$
  ),
  '{
    "action": "disabled",
    "reason": "admin_toggle",
    "actor_id": "f0150000-0000-4000-8000-000000000001"
  }'::jsonb,
  'disable audit records the action and authenticated actor'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f0150000-0000-4000-8000-000000000001',
  true
);
select is(
  pg_temp.qa_scalar(
    $$select to_jsonb(public.set_broadcast_enabled(false))$$
  ) - 'updated_at',
  '{"changed": false, "enabled": false}'::jsonb,
  'repeating the same state is an explicit no-op'
);

reset role;
select is(
  pg_temp.qa_scalar(
    $$select to_jsonb(count(*)::integer)
      from public.broadcast_audit
      where actor_id = 'f0150000-0000-4000-8000-000000000001'
        and reason = 'admin_toggle'$$
  ),
  '1'::jsonb,
  'a no-op transition appends no duplicate audit row'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f0150000-0000-4000-8000-000000000001',
  true
);
select is(
  pg_temp.qa_scalar(
    $$select to_jsonb(public.set_broadcast_enabled(true))$$
  ) - 'updated_at',
  '{"changed": true, "enabled": true}'::jsonb,
  'an admin can re-enable broadcasting'
);

reset role;
select is(
  pg_temp.qa_scalar(
    $$select to_jsonb(count(*)::integer)
      from public.broadcast_audit
      where actor_id = 'f0150000-0000-4000-8000-000000000001'
        and reason = 'admin_toggle'
        and action in ('enabled', 'disabled')$$
  ),
  '2'::jsonb,
  'the audit distinguishes enabled and disabled transitions'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.authority_warnings'::regclass
      and conname = 'authority_warnings_source_nonblank'
      and contype = 'c'
  ),
  'authority warning sources must contain a visible character'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.authority_warnings'::regclass
      and conname = 'authority_warnings_body_nonblank'
      and contype = 'c'
  ),
  'authority warning bodies must contain a visible character'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f0150000-0000-4000-8000-000000000001',
  true
);
select throws_ok(
  $$insert into public.authority_warnings (
      source, received_via, body, severity, wilaya_id, created_by
    )
    select '   ', 'phone', 'Valid warning body', 'Severe', id,
      'f0150000-0000-4000-8000-000000000001'
    from public.admin_units where level = 'wilaya' order by code limit 1$$,
  '23514',
  null,
  'ASCII-space-only sources are rejected'
);
select throws_ok(
  $$insert into public.authority_warnings (
      source, received_via, body, severity, wilaya_id, created_by
    )
    select E'\t\n', 'phone', 'Valid warning body', 'Severe', id,
      'f0150000-0000-4000-8000-000000000001'
    from public.admin_units where level = 'wilaya' order by code limit 1$$,
  '23514',
  null,
  'control-whitespace-only sources are rejected'
);
select throws_ok(
  $$insert into public.authority_warnings (
      source, received_via, body, severity, wilaya_id, created_by
    )
    select U&'\00A0\2003\202F\3000', 'phone', 'Valid warning body',
      'Severe', id, 'f0150000-0000-4000-8000-000000000001'
    from public.admin_units where level = 'wilaya' order by code limit 1$$,
  '23514',
  null,
  'Unicode-whitespace-only sources are rejected'
);
select throws_ok(
  $$insert into public.authority_warnings (
      source, received_via, body, severity, wilaya_id, created_by
    )
    select 'Protection Civile', 'phone', U&'\00A0\2003\202F\3000',
      'Severe', id, 'f0150000-0000-4000-8000-000000000001'
    from public.admin_units where level = 'wilaya' order by code limit 1$$,
  '23514',
  null,
  'Unicode-whitespace-only warning bodies are rejected'
);
select lives_ok(
  $$insert into public.authority_warnings (
      source, received_via, body, severity, wilaya_id, created_by
    )
    select 'Protection Civile F016', 'phone', 'Close the forest road', 'Severe', id,
      'f0150000-0000-4000-8000-000000000001'
    from public.admin_units where level = 'wilaya' order by code limit 1$$,
  'an admin can insert a valid attributed warning'
);

reset role;
select is(
  (
    select created_by
    from public.authority_warnings
    where source = 'Protection Civile F016'
  ),
  'f0150000-0000-4000-8000-000000000001'::uuid,
  'valid warning attribution is preserved'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f0150000-0000-4000-8000-000000000001',
  true
);
select throws_ok(
  $$insert into public.authority_warnings (
      source, received_via, body, severity, wilaya_id, created_by
    )
    select 'Protection Civile', 'phone', 'Spoofed actor', 'Severe', id,
      'f0150000-0000-4000-8000-000000000002'
    from public.admin_units where level = 'wilaya' order by code limit 1$$,
  '42501',
  null,
  'an admin cannot attribute a warning to another user'
);

select set_config(
  'request.jwt.claim.sub',
  'f0150000-0000-4000-8000-000000000002',
  true
);
select throws_ok(
  $$insert into public.authority_warnings (
      source, received_via, body, severity, wilaya_id, created_by
    )
    select 'Protection Civile', 'phone', 'Unauthorized warning', 'Severe', id,
      'f0150000-0000-4000-8000-000000000002'
    from public.admin_units where level = 'wilaya' order by code limit 1$$,
  '42501',
  null,
  'an ordinary user cannot insert an authority warning'
);

reset role;
select ok(
  has_table_privilege('service_role', 'public.authority_warnings', 'select')
  and not has_table_privilege('service_role', 'public.authority_warnings', 'update')
  and not has_table_privilege('service_role', 'public.authority_warnings', 'delete')
  and not has_table_privilege('service_role', 'public.authority_warnings', 'truncate'),
  'the publisher retains warning reads without destructive privileges'
);

select * from finish();

rollback;
