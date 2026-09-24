drop function public.set_source_paused(text,boolean);
create function public.set_source_paused(_key text,_paused boolean,_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare
  _enabled boolean;
begin
  if auth.uid() is null or not public.has_any_role(auth.uid(), array['admin']::public.app_role[]) then
    raise exception 'admin_role_required' using errcode = '42501';
  end if;
  if _paused is null then
    raise exception 'paused_required' using errcode = '22004';
  end if;
  select enabled into _enabled from public.source_contracts where key = _key for update;
  if not found then
    raise exception 'source_not_found' using errcode = 'P0002';
  end if;
  if _enabled = not _paused then return; end if;

  update public.source_contracts set enabled = not _paused, updated_at = now() where key = _key;
  perform public.record_admin_audit(
    'sources', case when _paused then 'source.pause' else 'source.resume' end,
    'source_contracts', _key, jsonb_build_object('enabled', _enabled),
    jsonb_build_object('enabled', not _paused), nullif(btrim(_reason),''), null
  );
end;
$$;
revoke all on function public.set_source_paused(text,boolean,text) from public,anon,service_role;
grant execute on function public.set_source_paused(text,boolean,text) to authenticated;

drop function public.set_delivery_channel_paused(text,boolean);
create function public.set_delivery_channel_paused(_channel text,_paused boolean,_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare previous boolean;
begin
  if not public.has_any_role(auth.uid(),array['operator','admin']::public.app_role[]) then
    raise insufficient_privilege using message='operator_role_required'; end if;
  select paused into strict previous from public.delivery_channel_settings where channel=_channel for update;
  if previous=_paused then return; end if;
  update public.delivery_channel_settings set paused=_paused where channel=_channel;
  perform public.record_admin_audit('broadcasts',case when _paused then 'channel.pause' else 'channel.resume' end,'delivery_channel_settings',_channel,
    jsonb_build_object('paused',previous),jsonb_build_object('paused',_paused),nullif(btrim(_reason),''),null);
end;
$$;
revoke all on function public.set_delivery_channel_paused(text,boolean,text) from public,anon,service_role;
grant execute on function public.set_delivery_channel_paused(text,boolean,text) to authenticated;
