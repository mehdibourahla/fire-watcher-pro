-- the runs table stays closed to clients (lifecycle is database-owned); operators read it through this
create function public.list_risk_snapshot_runs()
returns setof public.risk_forecast_snapshot_runs
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.has_any_role((select auth.uid()),array['operator','admin']::public.app_role[]) then
    raise insufficient_privilege using message='operator_role_required';
  end if;
  return query select * from public.risk_forecast_snapshot_runs order by created_at desc limit 30;
end;
$$;
revoke all on function public.list_risk_snapshot_runs() from public,anon,service_role;
grant execute on function public.list_risk_snapshot_runs() to authenticated;
