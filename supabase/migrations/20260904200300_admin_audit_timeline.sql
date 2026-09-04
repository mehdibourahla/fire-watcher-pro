-- broadcast_audit is not folded in: its action/actor invariant is stronger than anything
-- admin_audit's generic check can express, so the two are unioned for reading instead.
create view public.admin_audit_timeline
with (security_invoker = true)
as
select
  a.id,
  a.at,
  a.actor_user_id,
  a.actor_kind,
  a.actor_label,
  a.domain,
  a.action,
  a.target_table,
  a.target_id,
  a.reason
from public.admin_audit as a
union all
select
  b.id,
  b.at,
  b.actor_id,
  case when b.actor_id is null then 'system' else 'user' end,
  case when b.actor_id is null then 'broadcast-pipeline' else null end,
  'broadcasts',
  'broadcast.' || b.action,
  'broadcast_audit',
  b.cluster_id::text,
  b.reason
from public.broadcast_audit as b;

revoke all on public.admin_audit_timeline from public, anon;
grant select on public.admin_audit_timeline to authenticated, service_role;
