alter table public.source_jobs
  add column dispatched_at timestamptz;

create index source_jobs_github_dispatch_idx
  on public.source_jobs (available_at)
  where execution_target = 'github' and state in ('queued', 'retry_wait');

-- GitHub's cron trigger is best-effort (1 of 12 firings arrived on 2026-09-01);
-- repository_dispatch from pg_cron starts the workflow within seconds.
create function private.dispatch_github_source_jobs(_now timestamptz)
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
    select id, contract_key
    from public.source_jobs
    where execution_target = 'github'
      and state in ('queued', 'retry_wait')
      and available_at <= _now
      and (dispatched_at is null or dispatched_at <= _now - interval '20 minutes')
    order by available_at
    for update skip locked
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
        'client_payload', jsonb_build_object(
          'contract', _job.contract_key,
          'job_id', _job.id
        )
      ),
      timeout_milliseconds := 15000
    );
    update public.source_jobs set dispatched_at = _now where id = _job.id;
    _dispatched := _dispatched + 1;
  end loop;

  return _dispatched;
end;
$$;

revoke all on function private.dispatch_github_source_jobs(timestamptz)
  from public, anon, authenticated;

select cron.schedule(
  'nadhir-github-dispatch',
  '* * * * *',
  $$select private.dispatch_github_source_jobs(now())$$
);
