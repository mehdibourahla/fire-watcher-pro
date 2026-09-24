create function public.dismiss_civil_investigation(_id uuid,_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare
  actor uuid := (select auth.uid());
  work public.civil_investigations;
begin
  if actor is null or not public.has_any_role(actor,array['operator','admin']::public.app_role[]) then
    raise insufficient_privilege using message='operator_role_required';
  end if;
  if coalesce(_reason,'') !~ '[^[:space:]]' then
    raise invalid_parameter_value using message='dismissal_reason_required';
  end if;
  select * into work from public.civil_investigations where id=_id for update;
  if not found then
    raise no_data_found using message='investigation_not_found';
  end if;
  if work.state not in ('pending','hold','failed','review') then
    raise object_not_in_prerequisite_state using message='investigation_already_decided';
  end if;
  update public.civil_investigations set state='discard',updated_at=clock_timestamp() where id=_id;
  perform public.record_admin_audit('queues','ita.dismiss','civil_investigations',_id::text,
    jsonb_build_object('state',work.state),jsonb_build_object('state','discard'),btrim(_reason),null);
end;
$$;
revoke all on function public.dismiss_civil_investigation(uuid,text) from public,anon,service_role;
grant execute on function public.dismiss_civil_investigation(uuid,text) to authenticated;
