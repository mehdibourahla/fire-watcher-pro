create function public.moderate_citizen_report(_id uuid,_status text,_note text default null,_cluster uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare
  actor uuid := (select auth.uid());
  previous public.citizen_reports;
  clean_note text := nullif(btrim(_note),'');
begin
  if actor is null or not public.has_any_role(actor,array['report_moderator','admin']::public.app_role[]) then
    raise insufficient_privilege using message='report_moderator_role_required';
  end if;
  if _status not in ('pending','approved','rejected') then
    raise invalid_parameter_value using message='invalid_report_status';
  end if;
  select * into previous from public.citizen_reports where id=_id for update;
  if not found then
    raise no_data_found using message='report_not_found';
  end if;
  update public.citizen_reports set
    status=_status,moderation_note=clean_note,cluster_id=_cluster,
    reviewed_by=case when _status='pending' then null else actor end,
    reviewed_at=case when _status='pending' then null else now() end
  where id=_id;
  perform public.record_admin_audit('queues','report.moderate','citizen_reports',_id::text,
    jsonb_build_object('status',previous.status,'cluster_id',previous.cluster_id),
    jsonb_build_object('status',_status,'cluster_id',_cluster),clean_note,null);
end;
$$;
revoke all on function public.moderate_citizen_report(uuid,text,text,uuid) from public,anon,service_role;
grant execute on function public.moderate_citizen_report(uuid,text,text,uuid) to authenticated;
drop policy "report moderators update reports" on public.citizen_reports;

create function public.relay_authority_warning(_source text,_received_via text,_body text,_severity text,_wilaya uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid := (select auth.uid());
  warning public.authority_warnings;
begin
  if actor is null or not public.has_role(actor,'admin') then
    raise insufficient_privilege using message='admin_role_required';
  end if;
  if coalesce(_source,'') !~ '[^[:space:]]' or coalesce(_body,'') !~ '[^[:space:]]' or _wilaya is null then
    raise invalid_parameter_value using message='warning_fields_required';
  end if;
  insert into public.authority_warnings(source,received_via,body,severity,wilaya_id,created_by)
  values (btrim(_source),_received_via,btrim(_body),_severity,_wilaya,actor)
  returning * into warning;
  perform public.record_admin_audit('broadcasts','authority_warning.relay','authority_warnings',warning.id::text,null,
    jsonb_build_object('source',warning.source,'received_via',warning.received_via,'severity',warning.severity,'wilaya_id',warning.wilaya_id),
    null,null);
  return warning.id;
end;
$$;
revoke all on function public.relay_authority_warning(text,text,text,text,uuid) from public,anon,service_role;
grant execute on function public.relay_authority_warning(text,text,text,text,uuid) to authenticated;
drop policy "admins insert attributed authority warnings" on public.authority_warnings;
revoke insert on public.authority_warnings from authenticated;

drop policy "operators resolve fires" on public.fire_clusters;

create function public.admin_attention_counts()
returns table(item text,count bigint,oldest timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid := (select auth.uid());
  ops boolean;
  mods boolean;
  translators boolean;
begin
  if actor is null or not public.has_any_role(actor,array['admin','operator','report_moderator','translator','incident_editor']::public.app_role[]) then
    raise insufficient_privilege using message='panel_role_required';
  end if;
  ops := public.has_any_role(actor,array['operator','admin']::public.app_role[]);
  mods := public.has_any_role(actor,array['report_moderator','admin']::public.app_role[]);
  translators := public.has_any_role(actor,array['translator','admin']::public.app_role[]);
  if ops then
    return query select 'ita_review',count(*),min(w.updated_at) from public.civil_investigations w where w.state='review';
    return query select 'ita_failed',count(*),min(w.updated_at) from public.civil_investigations w where w.state='failed';
    return query select 'fires',count(*),min(c.first_detected_at) from public.fire_clusters c
      where c.resolved_at is null and c.confidence>=0.6 and c.state in ('unconfirmed','active','contained_guess');
    return query select 'operational_incidents',count(*),min(i.first_seen_at) from public.operational_incidents i
      where i.acknowledged_at is null and i.resolved_at is null;
    return query select 'source_gaps',count(*),min(g.detected_at) from public.source_gaps g where g.state='open';
    return query select 'sources_unhealthy',count(*),null::timestamptz from public.source_health h
      where h.state in ('delayed','degraded','stale');
    return query select 'delivery_backlog',coalesce(sum(d.pending_count),0)::bigint,min(d.oldest_pending_at) from public.delivery_queue_health d;
    return query select 'risk_pending',count(*),min(r.finished_at) from public.risk_forecast_snapshot_runs r
      where r.status='active' and r.finished_at is not null;
    return query select 'broadcasting_off',count(*),max(s.updated_at) from public.broadcast_settings s where not s.enabled;
  end if;
  if mods then
    return query select 'citizen_reports',count(*),min(r.created_at) from public.citizen_reports r where r.status='pending';
    return query select 'ideas',count(*),min(i.created_at) from public.contribution_ideas i where i.status='pending';
  end if;
  if translators then
    return query select 'translations',count(distinct (t.locale,t.key_path)),min(t.created_at) from public.translation_suggestions t where t.status='pending';
  end if;
end;
$$;
revoke all on function public.admin_attention_counts() from public,anon,service_role;
grant execute on function public.admin_attention_counts() to authenticated;
