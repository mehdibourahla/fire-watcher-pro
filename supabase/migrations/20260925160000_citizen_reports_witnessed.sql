alter table public.citizen_reports drop constraint citizen_reports_kind_check;
alter table public.citizen_reports add constraint citizen_reports_kind_check
  check (kind in ('sighting','flooding','storm_damage','road_blocked','earthquake','person_trapped','other'));

alter table public.citizen_reports
  add column hazard text check (hazard in ('fire','flooding','storm_damage','road_blocked','earthquake',
    'person_trapped','sandstorm','landslide','snow_ice','structural','hazmat','other')),
  add column summary text check (summary is null or length(summary) between 1 and 160),
  add column publish_state text not null default 'classifying'
    check (publish_state in ('classifying','published','held','private')),
  add column classified_at timestamptz,
  add column classifier text,
  add column expires_at timestamptz,
  add column flagged_at timestamptz;

-- publication is decided here and by the server classifier, never by the reporter's own insert
create function public.prepare_citizen_report()
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
  new.hazard := case new.kind when 'sighting' then 'fire' when 'other' then null else new.kind end;
  new.publish_state := case
    when new.kind = 'person_trapped' then 'private'
    when new.kind = 'other' or has_text then 'classifying'
    else 'published' end;
  new.expires_at := now() + interval '6 hours';
  return new;
end;
$$;

create trigger citizen_reports_prepare
  before insert on public.citizen_reports
  for each row execute function public.prepare_citizen_report();
revoke all on function public.prepare_citizen_report() from public, anon, authenticated;

-- tile reports now publish instantly, so a delete must not hand back a slot in the daily limit
create table public.citizen_report_submissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index citizen_report_submissions_user_idx on public.citizen_report_submissions (user_id, created_at);
alter table public.citizen_report_submissions enable row level security;
revoke all on public.citizen_report_submissions from public, anon, authenticated;
insert into public.citizen_report_submissions (user_id, created_at)
  select user_id, created_at from public.citizen_reports where created_at > now() - interval '24 hours';

create or replace function public.limit_citizen_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_reports integer;
begin
  new.created_at := now();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('nadhir:citizen-report-limit'),
    pg_catalog.hashtext(new.user_id::text)
  );
  select count(*) into recent_reports
  from public.citizen_report_submissions
  where user_id = new.user_id and created_at > now() - interval '24 hours';
  if recent_reports >= 3 then
    raise exception using
      errcode = '23514',
      message = 'Daily report limit reached (3 per 24 hours)';
  end if;
  insert into public.citizen_report_submissions (user_id) values (new.user_id);
  return new;
end;
$$;

revoke truncate on public.citizen_reports from anon, authenticated;

drop policy "own pending reports update" on public.citizen_reports;

create table public.report_witnesses (
  report_id uuid not null references public.citizen_reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote text not null check (vote in ('seen','gone')),
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);
create index report_witnesses_user_idx on public.report_witnesses (user_id);
alter table public.report_witnesses enable row level security;
revoke all on public.report_witnesses from public, anon, authenticated;
grant select on public.report_witnesses to authenticated;
grant select, insert, update, delete on public.report_witnesses to service_role;
create policy "own witness votes read" on public.report_witnesses
  for select to authenticated using ((select auth.uid()) = user_id);

create function public.witness_report(_report uuid, _vote text, _lat double precision, _lon double precision)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.citizen_reports;
  seen integer;
  gone integer;
begin
  if actor is null then
    raise insufficient_privilege using message = 'sign_in_required';
  end if;
  if _vote not in ('seen', 'gone') then
    raise invalid_parameter_value using message = 'invalid_vote';
  end if;
  if _lat is null or _lon is null or abs(_lat) > 90 or abs(_lon) > 180 then
    raise invalid_parameter_value using message = 'too_far';
  end if;
  if not public.consume_rate_limit('witness:' || actor::text, 30, 3600) then
    raise exception using errcode = '54000', message = 'witness_rate_limited';
  end if;
  select * into target from public.citizen_reports where id = _report for update;
  if not found or target.publish_state <> 'published' or target.status = 'rejected'
     or target.expires_at <= now() then
    raise no_data_found using message = 'report_not_open';
  end if;
  if target.user_id = actor then
    raise invalid_parameter_value using message = 'own_report';
  end if;
  -- a witness must be where the hazard is: the glossary's 5 km sighting radius
  if 6371 * 2 * asin(sqrt(power(sin(radians(_lat - target.lat) / 2), 2)
       + cos(radians(target.lat)) * cos(radians(_lat)) * power(sin(radians(_lon - target.lon) / 2), 2))) > 5 then
    raise invalid_parameter_value using message = 'too_far';
  end if;

  insert into public.report_witnesses (report_id, user_id, vote) values (_report, actor, _vote)
  on conflict (report_id, user_id) do update set vote = excluded.vote, created_at = now();

  select count(*) filter (where vote = 'seen'), count(*) filter (where vote = 'gone')
    into seen, gone from public.report_witnesses where report_id = _report;

  if gone - seen >= 3 then
    update public.citizen_reports set flagged_at = coalesce(flagged_at, now()) where id = _report;
  elsif _vote = 'seen' and target.flagged_at is null then
    update public.citizen_reports
       set expires_at = least(greatest(expires_at, now() + interval '3 hours'), created_at + interval '24 hours')
     where id = _report;
  end if;
  return seen;
end;
$$;
revoke all on function public.witness_report(uuid, text, double precision, double precision) from public, anon;
grant execute on function public.witness_report(uuid, text, double precision, double precision) to authenticated;

drop view public.hazard_reports;
-- Hazard asymmetry (CONTEXT.md): only published danger shows, through safe columns; "gone" votes never do
create view public.hazard_reports
  with (security_invoker = false, security_barrier = true) as
  select r.id, r.kind, r.hazard, r.sighting, r.summary, r.lat, r.lon, r.commune_id, r.observed_at,
         r.created_at, r.expires_at, r.status,
         (select count(*) from public.report_witnesses w where w.report_id = r.id and w.vote = 'seen')::integer
           as witnesses
  from public.citizen_reports r
  where (r.publish_state = 'published' or r.status = 'approved')
    and r.status <> 'rejected'
    and r.kind <> 'person_trapped'
    and r.expires_at > now();
-- a bypassrls view: default privileges would hand anon write access through it (see 20260903150000)
revoke all on public.hazard_reports from public, anon, authenticated;
grant select on public.hazard_reports to anon, authenticated;

alter table public.alerts drop constraint alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check
  check (kind in ('fire','risk','weather','official','road','citizen'));

alter table public.zones add column notify_citizen boolean not null default true;

create index alerts_citizen_source_idx on public.alerts (source_id) where source_table = 'citizen_reports';

-- points reward what others confirmed, never the act of sending (a points-for-sending game rewards false reports)
create function public.my_contribution()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select r.id, r.hazard,
      exists (select 1 from public.report_witnesses w where w.report_id = r.id and w.vote = 'seen') as corroborated
    from public.citizen_reports r
    where r.user_id = (select auth.uid()) and r.status <> 'rejected'
      and (r.publish_state = 'published' or r.status = 'approved') and r.kind <> 'person_trapped'
  ),
  -- a confirmation earns points only once a second independent witness agrees, so a vote alone mints nothing
  given as (
    select count(*) as n
    from public.report_witnesses w join public.citizen_reports r on r.id = w.report_id
    where w.user_id = (select auth.uid()) and w.vote = 'seen' and r.status <> 'rejected'
      and (select count(*) from public.report_witnesses o
           where o.report_id = r.id and o.vote = 'seen') >= 2
  )
  select jsonb_build_object(
    'published', (select count(*) from mine),
    'corroborated', (select count(*) from mine where corroborated),
    'confirmations', (select n from given),
    'hazards', (select count(distinct hazard) from mine where hazard is not null),
    'alerted', (select count(distinct a.user_id) from public.alerts a
                where a.source_table = 'citizen_reports' and a.source_id in (select id from mine)),
    'witnesses', (select count(*) from public.report_witnesses w
                  where w.vote = 'seen' and w.report_id in (select id from mine)),
    'points', 10 * (select count(*) from mine where corroborated) + 3 * (select n from given)
  );
$$;
revoke all on function public.my_contribution() from public, anon;
grant execute on function public.my_contribution() to authenticated;

-- published reports need no moderator; the badge counts what needs a decision
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
      where r.status='pending' and r.expires_at>now() and (r.publish_state<>'published' or r.flagged_at is not null);
    return query select 'ideas',count(*),min(i.created_at) from public.contribution_ideas i where i.status='pending';
  end if;
  if translators then
    return query select 'translations',count(distinct (t.locale,t.key_path)),min(t.created_at) from public.translation_suggestions t where t.status='pending';
  end if;
end;
$$;
