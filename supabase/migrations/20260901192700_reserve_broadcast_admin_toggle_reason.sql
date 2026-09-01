begin;

lock table public.broadcast_audit in access exclusive mode;

do $$
begin
  if exists (
    select 1
    from public.broadcast_audit
    where not (
      (action in ('enabled', 'disabled')
        and reason = 'admin_toggle'
        and actor_id is not null)
      or
      (action in ('published', 'suppressed')
        and reason <> 'admin_toggle'
        and actor_id is null)
    )
  ) then
    raise exception 'broadcast_audit contains rows with invalid action attribution';
  end if;
end;
$$;

alter table public.broadcast_audit
  drop constraint broadcast_audit_action_actor_valid,
  add constraint broadcast_audit_action_actor_valid
  check (
    (action in ('enabled', 'disabled')
      and reason = 'admin_toggle'
      and actor_id is not null)
    or
    (action in ('published', 'suppressed')
      and reason <> 'admin_toggle'
      and actor_id is null)
  );

commit;
