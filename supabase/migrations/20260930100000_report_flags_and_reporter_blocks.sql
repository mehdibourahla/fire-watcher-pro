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
  if not found or target.publish_state <> 'published' or target.status = 'rejected'
     or target.expires_at <= now() then
    raise no_data_found using message = 'report_not_open';
  end if;
  if target.user_id = actor then
    raise invalid_parameter_value using message = 'own_report';
  end if;

  insert into public.citizen_report_flags (report_id, user_id, reason) values (_report, actor, _reason)
  on conflict (report_id, user_id) do update set reason = excluded.reason;
  -- Hazard asymmetry (CONTEXT.md): a flag queues the report for a moderator, it never hides it
  update public.citizen_reports set flagged_at = coalesce(flagged_at, now()) where id = _report;
end;
$$;
revoke all on function public.flag_citizen_report(uuid, text) from public, anon;
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
  if target.status <> 'rejected' then
    update public.citizen_reports set status = 'rejected', reviewed_by = actor, reviewed_at = now()
    where id = _report;
  end if;
  perform public.record_admin_audit('queues', 'reporter.block', 'reporter_blocks', target.user_id::text,
    jsonb_build_object('report_id', _report, 'status', target.status),
    jsonb_build_object('report_id', _report, 'status', 'rejected'), clean_reason, null);
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
revoke all on function public.block_report_author(uuid) from public, anon;
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
