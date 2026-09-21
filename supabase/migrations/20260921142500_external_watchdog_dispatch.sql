create function private.dispatch_external_watchdog()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  _token text;
  _repo text;
begin
  select decrypted_secret into _token
  from vault.decrypted_secrets where name = 'github_dispatch_token';
  select decrypted_secret into _repo
  from vault.decrypted_secrets where name = 'github_repo';
  if coalesce(_token, '') = '' or coalesce(_repo, '') = '' then
    raise exception 'external watchdog dispatch credentials missing';
  end if;
  return net.http_post(
    url := 'https://api.github.com/repos/' || _repo || '/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || _token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'nadhir-watchdog-dispatch',
      'Content-Type', 'application/json'
    ),
    body := '{"event_type":"external-watchdog"}'::jsonb,
    timeout_milliseconds := 15000
  );
end;
$$;
revoke all on function private.dispatch_external_watchdog()
from public, anon, authenticated, service_role;

-- GitHub scheduled runs arrive hours late; keep its cron as the database-outage fallback.
select cron.schedule('nadhir-external-watchdog', '7,22,37,52 * * * *',
  $$select private.dispatch_external_watchdog()$$);
