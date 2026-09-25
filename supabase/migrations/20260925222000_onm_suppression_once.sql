-- the relay logs a suppressed ONM duplicate once per warning and looks it up here each run
create index broadcast_audit_onm_duplicate_idx on public.broadcast_audit (onm_vigilance_id)
  where action = 'suppressed' and reason = 'onm_duplicate';

-- distinct in the database: old warnings carry ~90 repeat rows each, past the API's 1,000-row cap
create function public.onm_suppressions_logged(_ids uuid[]) returns setof uuid
language sql stable set search_path = '' as $$
  select distinct a.onm_vigilance_id from public.broadcast_audit a
  where a.action = 'suppressed' and a.reason = 'onm_duplicate' and a.onm_vigilance_id = any(_ids)
$$;
revoke all on function public.onm_suppressions_logged(uuid[]) from public, anon, authenticated;
grant execute on function public.onm_suppressions_logged(uuid[]) to service_role;
