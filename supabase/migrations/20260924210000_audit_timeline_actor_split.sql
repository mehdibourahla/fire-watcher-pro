-- one branch per actor kind so a filter on actor_kind prunes a branch at plan time instead of scanning every pipeline row
create or replace view public.admin_audit_timeline with (security_invoker=true) as
 select a.id, a.at, a.actor_user_id, a.actor_kind, a.actor_label, a.domain, a.action, a.target_table, a.target_id, a.reason, a.before, a.after
   from public.admin_audit a
union all
 select b.id, b.at, null::uuid as actor_user_id, 'system'::text as actor_kind, 'broadcast-pipeline'::text as actor_label,
    'broadcasts'::text as domain, 'broadcast.'::text || b.action as action, 'broadcast_audit'::text as target_table,
    b.cluster_id::text as target_id, coalesce(b.payload->>'note', b.reason) as reason, null::jsonb as before, null::jsonb as after
   from public.broadcast_audit b
  where b.actor_id is null
union all
 select b.id, b.at, b.actor_id as actor_user_id, 'user'::text as actor_kind, null::text as actor_label,
    'broadcasts'::text as domain, 'broadcast.'::text || b.action as action, 'broadcast_audit'::text as target_table,
    b.cluster_id::text as target_id, coalesce(b.payload->>'note', b.reason) as reason, null::jsonb as before, null::jsonb as after
   from public.broadcast_audit b
  where b.actor_id is not null;

create index broadcast_audit_person_at_idx on public.broadcast_audit (at desc) where actor_id is not null;
