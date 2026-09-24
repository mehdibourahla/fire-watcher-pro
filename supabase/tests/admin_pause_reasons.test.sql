begin;
set local search_path = public, extensions;
select plan(6);

insert into auth.users(id,email) values ('1e000000-0000-4000-8000-000000000001','pause-admin@example.invalid');
insert into user_roles(user_id,role) values ('1e000000-0000-4000-8000-000000000001','admin');

set local role authenticated;
select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',true);
select lives_ok($$select set_source_paused('firms',true,'NASA quota exhausted until midnight UTC')$$,'an admin pauses a source with a reason');
select lives_ok($$select set_delivery_channel_paused('telegram',true,'Bot token rotated')$$,'an admin pauses a channel with a reason');
select lives_ok($$select set_source_paused('firms',false)$$,'the reason stays optional for existing callers');
select lives_ok($$select set_broadcast_enabled(false,'Suspected false alarm wave from FCI')$$,'an admin stops broadcasting with a note');
reset role;

select is(
  (select array_agg(reason order by at) from admin_audit where action in ('source.pause','channel.pause') and actor_user_id='1e000000-0000-4000-8000-000000000001'),
  array['NASA quota exhausted until midnight UTC','Bot token rotated'],
  'both pauses record their reason in the audit log');

select is((select reason from admin_audit_timeline where action='broadcast.disabled' and actor_user_id='1e000000-0000-4000-8000-000000000001'),'Suspected false alarm wave from FCI','the audit timeline shows the note, not the internal reason code');

select * from finish();
rollback;
