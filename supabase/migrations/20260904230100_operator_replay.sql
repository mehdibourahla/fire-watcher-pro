-- enqueue_source_replay stays the scheduler's entry point; this is the operator-facing
-- wrapper that checks a role and leaves a record.
create or replace function public.replay_source_gap(_gap_id uuid, _reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  gap public.source_gaps;
  job_id uuid;
begin
  if not public.has_any_role(actor, array['operator','admin']::public.app_role[]) then
    raise insufficient_privilege using message = 'operator_role_required';
  end if;

  select * into gap from public.source_gaps where id = _gap_id;
  if not found then
    raise no_data_found using message = 'gap_not_found';
  end if;

  job_id := public.enqueue_source_replay(_gap_id);

  perform public.record_admin_audit(
    'sources',
    'gap.replay',
    'source_gaps',
    _gap_id::text,
    jsonb_build_object('state', gap.state, 'replay_count', gap.replay_count),
    jsonb_build_object('contract_key', gap.contract_key, 'job_id', job_id),
    _reason
  );

  return job_id;
end;
$$;

revoke execute on function public.replay_source_gap(uuid, text) from public, anon;
grant execute on function public.replay_source_gap(uuid, text) to authenticated;
