create or replace function public.enqueue_source_replay(
  _gap_id uuid,
  _requested_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _gap public.source_gaps%rowtype;
  _contract public.source_contracts%rowtype;
  _job_id uuid;
  _replay_count integer;
begin
  select * into _gap from public.source_gaps where id = _gap_id for update;
  if _gap.id is null then
    raise exception 'unknown source gap';
  end if;

  select * into _contract from public.source_contracts
  where key = _gap.contract_key for share;
  if not _contract.enabled then
    raise exception 'source contract is paused';
  end if;
  if _contract.replay_capability <> 'interval' then
    raise exception 'source gap is not replayable';
  end if;
  if _gap.state <> 'open' then
    raise exception 'source gap is not open';
  end if;
  if exists (
    select 1 from public.source_jobs
    where gap_id = _gap.id and state in ('queued', 'running', 'retry_wait')
  ) then
    raise exception 'source gap already has active work';
  end if;
  if _gap.replay_count >= 3 or _gap.data_from < _requested_at
    - make_interval(mins => _contract.replay_window_minutes) then
    update public.source_gaps set state = 'unrecoverable', updated_at = _requested_at
    where id = _gap.id;
    return null;
  end if;

  _replay_count := _gap.replay_count + 1;
  insert into public.source_jobs (
    contract_key, contract_version, trigger_kind, idempotency_key,
    scheduled_for, data_from, data_through, execution_target, enqueued_by,
    available_at, max_attempts, retry_base_seconds, retry_until, gap_id
  ) values (
    _contract.key, _contract.version, 'replay',
    'replay:' || _gap.id::text || ':' || _replay_count::text,
    _gap.data_through, _gap.data_from, _gap.data_through,
    _contract.execution_target, array['manual'], _requested_at,
    _contract.max_attempts, _contract.retry_base_seconds,
    _requested_at + make_interval(mins => _contract.retry_window_minutes), _gap.id
  ) returning id into _job_id;

  update public.source_gaps
  set state = 'replaying', replay_count = _replay_count, updated_at = _requested_at
  where id = _gap.id;
  return _job_id;
end;
$$;

create or replace function private.dispatch_github_source_jobs(_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _token text;
  _repo text;
  _job record;
  _dispatched integer := 0;
begin
  select decrypted_secret into _token
  from vault.decrypted_secrets where name = 'github_dispatch_token';
  select decrypted_secret into _repo
  from vault.decrypted_secrets where name = 'github_repo';
  if coalesce(_token, '') = '' or coalesce(_repo, '') = '' then
    raise warning 'github dispatch skipped: vault secrets github_dispatch_token/github_repo are not set';
    return 0;
  end if;

  for _job in
    select job.id, job.contract_key
    from public.source_jobs job
    join public.source_contracts contract on contract.key = job.contract_key
    where contract.enabled and job.execution_target = 'github'
      and job.state in ('queued', 'retry_wait')
      and job.available_at <= _now
      and (job.dispatched_at is null or job.dispatched_at <= _now - interval '20 minutes')
    order by job.available_at
    for update of job skip locked
    for share of contract skip locked
  loop
    perform net.http_post(
      url := 'https://api.github.com/repos/' || _repo || '/dispatches',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || _token,
        'Accept', 'application/vnd.github+json',
        'X-GitHub-Api-Version', '2022-11-28',
        'User-Agent', 'nadhir-source-dispatch',
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'event_type', 'source-job',
        'client_payload', jsonb_build_object('contract', _job.contract_key, 'job_id', _job.id)
      ),
      timeout_milliseconds := 15000
    );
    update public.source_jobs set dispatched_at = _now where id = _job.id;
    _dispatched := _dispatched + 1;
  end loop;
  return _dispatched;
end;
$$;

create or replace function private.replay_open_source_gaps(_now timestamptz, _limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _gap record;
  _enqueued integer := 0;
begin
  for _gap in
    select gap.id
    from public.source_gaps gap
    join public.source_contracts contract on contract.key = gap.contract_key
    where gap.state = 'open' and contract.enabled
      and contract.replay_capability = 'interval'
      and not exists (
        select 1 from public.source_jobs job
        where job.gap_id = gap.id and job.state in ('queued', 'running', 'retry_wait')
      )
    order by gap.data_from, gap.id
    limit least(greatest(coalesce(_limit, 0), 0), 100)
    for update of gap skip locked
  loop
    begin
      if public.enqueue_source_replay(_gap.id, _now) is not null then
        _enqueued := _enqueued + 1;
      end if;
    exception when raise_exception then
      if sqlerrm not in ('source gap already has active work', 'source contract is paused') then
        raise;
      end if;
    end;
  end loop;
  return _enqueued;
end;
$$;
