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
  select r.id, r.kind, r.hazard, r.sighting, r.summary, r.lat, r.lon, r.observed_at, r.created_at,
         r.expires_at, r.status,
         (select count(*) from public.report_witnesses w where w.report_id = r.id and w.vote = 'seen')::integer
           as witnesses
  from public.citizen_reports r
  where (r.publish_state = 'published' or r.status = 'approved')
    and r.status <> 'rejected'
    and r.kind <> 'person_trapped'
    and r.expires_at > now() - interval '24 hours';
-- a bypassrls view: default privileges would hand anon write access through it (see 20260903150000)
revoke all on public.hazard_reports from public, anon, authenticated;
grant select on public.hazard_reports to anon, authenticated;

alter table public.alerts drop constraint alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check
  check (kind in ('fire','risk','weather','official','road','citizen'));

alter table public.zones add column notify_citizen boolean not null default true;

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
  given as (
    select count(*) as n
    from public.report_witnesses w join public.citizen_reports r on r.id = w.report_id
    where w.user_id = (select auth.uid()) and w.vote = 'seen' and r.status <> 'rejected'
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
