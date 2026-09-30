alter table public.citizen_reports add column user_flagged_at timestamptz;

create or replace function public.prepare_citizen_report()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  has_text boolean := nullif(btrim(coalesce(new.note, '')), '') is not null;
begin
  new.summary := null;
  new.classified_at := null;
  new.classifier := null;
  new.flagged_at := null;
  new.user_flagged_at := null;
  new.hazard := case new.kind when 'sighting' then 'fire' when 'other' then null else new.kind end;
  new.publish_state := case
    when new.kind = 'person_trapped' then 'private'
    when new.kind = 'other' or has_text then 'classifying'
    else 'published' end;
  new.expires_at := now() + interval '6 hours';
  -- the place is shown publicly, so it comes from the pin, never from the client
  new.commune_id := (
    select u.id from public.admin_units u
    where u.level = 'commune' and u.lat is not null and u.lon is not null
      and 111.32 * sqrt((u.lat - new.lat) ^ 2 + ((u.lon - new.lon) * cos(radians(new.lat))) ^ 2) <= 50
    order by (u.lat - new.lat) ^ 2 + ((u.lon - new.lon) * cos(radians(new.lat))) ^ 2, u.id
    limit 1);
  return new;
end;
$$;

create table public.citizen_report_flags (
  report_id uuid not null references public.citizen_reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('false','offensive','other')),
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);
create index citizen_report_flags_user_idx on public.citizen_report_flags (user_id);
alter table public.citizen_report_flags enable row level security;
revoke all on public.citizen_report_flags from public, anon, authenticated;
grant select, insert, update, delete on public.citizen_report_flags to service_role;

create function public.flag_citizen_report(_report uuid, _reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.citizen_reports;
begin
  if actor is null then
    raise insufficient_privilege using message = 'sign_in_required';
  end if;
  if _reason is null or _reason not in ('false', 'offensive', 'other') then
    raise invalid_parameter_value using message = 'invalid_flag_reason';
  end if;
  if not public.consume_rate_limit('report-flag:' || actor::text, 10, 3600) then
    raise exception using errcode = '54000', message = 'flag_rate_limited';
  end if;
  select * into target from public.citizen_reports where id = _report for update;
  -- open means exactly what hazard_reports shows
  if not found or not (target.publish_state = 'published' or target.status = 'approved')
     or target.status = 'rejected' or target.kind = 'person_trapped' or target.expires_at <= now() then
    raise no_data_found using message = 'report_not_open';
  end if;
  if target.user_id = actor then
    raise invalid_parameter_value using message = 'own_report';
  end if;

  insert into public.citizen_report_flags (report_id, user_id, reason) values (_report, actor, _reason)
  on conflict (report_id, user_id) do update set reason = excluded.reason;
  -- Hazard asymmetry (CONTEXT.md): flagged_at silences alerts, so a single user only queues the report
  update public.citizen_reports set user_flagged_at = coalesce(user_flagged_at, now()) where id = _report;
end;
$$;
revoke all on function public.flag_citizen_report(uuid, text) from public, anon, service_role;
grant execute on function public.flag_citizen_report(uuid, text) to authenticated;

create function public.citizen_report_flag_summary(_report uuid)
returns table(reason text, flags integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not public.has_any_role(actor, array['report_moderator','admin']::public.app_role[]) then
    raise insufficient_privilege using message = 'report_moderator_role_required';
  end if;
  return query
    select f.reason, count(*)::integer from public.citizen_report_flags f
    where f.report_id = _report group by f.reason order by f.reason;
end;
$$;
revoke all on function public.citizen_report_flag_summary(uuid) from public, anon, service_role;
grant execute on function public.citizen_report_flag_summary(uuid) to authenticated;

create table public.reporter_blocks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  blocked_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.reporter_blocks enable row level security;
revoke all on public.reporter_blocks from public, anon, authenticated;
grant select, insert, update, delete on public.reporter_blocks to service_role;

create function public.block_reporter(_report uuid, _reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.citizen_reports;
  clean_reason text := nullif(btrim(_reason), '');
  rejected integer;
begin
  if actor is null or not public.has_any_role(actor, array['report_moderator','admin']::public.app_role[]) then
    raise insufficient_privilege using message = 'report_moderator_role_required';
  end if;
  select * into target from public.citizen_reports where id = _report for update;
  if not found then
    raise no_data_found using message = 'report_not_found';
  end if;

  insert into public.reporter_blocks (user_id, blocked_by, reason) values (target.user_id, actor, clean_reason)
  on conflict (user_id) do update set blocked_by = excluded.blocked_by, reason = excluded.reason;
  update public.citizen_reports
  set status = 'rejected', reviewed_by = actor, reviewed_at = now(), user_flagged_at = null
  where user_id = target.user_id and status <> 'rejected'
    and (id = _report or (expires_at > now() and kind <> 'person_trapped'));
  get diagnostics rejected = row_count;
  perform public.record_admin_audit('queues', 'reporter.block', 'reporter_blocks', target.user_id::text,
    jsonb_build_object('report_id', _report, 'status', target.status),
    jsonb_build_object('report_id', _report, 'status', 'rejected', 'rejected_reports', rejected), clean_reason, null);
end;
$$;
revoke all on function public.block_reporter(uuid, text) from public, anon, service_role;
grant execute on function public.block_reporter(uuid, text) to authenticated;

-- prepare_citizen_report runs as the reporter, who cannot read reporter_blocks; named to fire before it
create function public.refuse_blocked_reporter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.reporter_blocks b where b.user_id = new.user_id) then
    raise insufficient_privilege using message = 'reporting_blocked';
  end if;
  return new;
end;
$$;
create trigger citizen_reports_blocked_reporter
  before insert on public.citizen_reports
  for each row execute function public.refuse_blocked_reporter();
revoke all on function public.refuse_blocked_reporter() from public, anon, authenticated;

create table public.user_report_blocks (
  blocker uuid not null references auth.users(id) on delete cascade,
  author uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, author)
);
create index user_report_blocks_author_idx on public.user_report_blocks (author);
alter table public.user_report_blocks enable row level security;
revoke all on public.user_report_blocks from public, anon, authenticated;
grant select, insert, update, delete on public.user_report_blocks to service_role;

create function public.block_report_author(_report uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  report_author uuid;
begin
  if actor is null then
    raise insufficient_privilege using message = 'sign_in_required';
  end if;
  select r.user_id into report_author from public.citizen_reports r where r.id = _report;
  if not found then
    raise no_data_found using message = 'report_not_found';
  end if;
  if report_author = actor then
    raise invalid_parameter_value using message = 'own_report';
  end if;
  insert into public.user_report_blocks (blocker, author) values (actor, report_author)
  on conflict (blocker, author) do nothing;
end;
$$;
revoke all on function public.block_report_author(uuid) from public, anon, service_role;
grant execute on function public.block_report_author(uuid) to authenticated;

create or replace view public.hazard_reports
  with (security_invoker = false, security_barrier = true) as
  select r.id, r.kind, r.hazard, r.sighting, r.summary, r.lat, r.lon, r.commune_id, r.observed_at,
         r.created_at, r.expires_at, r.status,
         (select count(*) from public.report_witnesses w where w.report_id = r.id and w.vote = 'seen')::integer
           as witnesses
  from public.citizen_reports r
  where (r.publish_state = 'published' or r.status = 'approved')
    and r.status <> 'rejected'
    and r.kind <> 'person_trapped'
    and r.expires_at > now()
    and not exists (select 1 from public.user_report_blocks b
                    where b.blocker = (select auth.uid()) and b.author = r.user_id);

create or replace function public.moderate_citizen_report(_id uuid,_status text,_cluster uuid,_note text default null)
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
    reviewed_at=case when _status='pending' then null else now() end,
    user_flagged_at=case when _status='pending' then user_flagged_at else null end
  where id=_id;
  perform public.record_admin_audit('queues','report.moderate','citizen_reports',_id::text,
    jsonb_build_object('status',previous.status,'cluster_id',previous.cluster_id),
    jsonb_build_object('status',_status,'cluster_id',_cluster),clean_note,null);
end;
$$;

create or replace function public.admin_attention_counts()
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
    return query select 'citizen_reports',count(*),min(r.created_at) from public.citizen_reports r
      where r.status<>'rejected' and r.expires_at>now()
        and ((r.status='pending' and (r.publish_state<>'published' or r.flagged_at is not null))
             or r.user_flagged_at is not null);
    return query select 'ideas',count(*),min(i.created_at) from public.contribution_ideas i where i.status='pending';
  end if;
  if translators then
    return query select 'translations',count(distinct (t.locale,t.key_path)),min(t.created_at) from public.translation_suggestions t where t.status='pending';
  end if;
end;
$$;
