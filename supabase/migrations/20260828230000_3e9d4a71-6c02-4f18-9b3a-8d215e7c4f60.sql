-- The scheduler URL was hardcoded to one Lovable preview host, so every restored
-- or forked project kept calling the original deployment. Read it from vault
-- instead and fail loudly when it is unset rather than posting into the void.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'nadhir_app_url') then
    perform vault.create_secret('', 'nadhir_app_url');
  end if;
end $$;

create or replace function private.nadhir_cron_call(_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  token text;
  base text;
begin
  select decrypted_secret into token from vault.decrypted_secrets where name = 'nadhir_cron_token';
  select decrypted_secret into base from vault.decrypted_secrets where name = 'nadhir_app_url';

  if base is null or base = '' then
    raise exception 'vault secret nadhir_app_url is not set; scheduled % would post nowhere', _path;
  end if;

  perform net.http_post(
    url := rtrim(base, '/') || _path,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || token),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end $$;

revoke all on function private.nadhir_cron_call(text) from public, anon, authenticated;

-- spec 6: FIRMS and FCI are 10-minute feeds; risk is daily at 06:00 UTC
select cron.unschedule(jobname) from cron.job
  where jobname in ('nadhir-ingest','nadhir-risk','nadhir-alerts');
select cron.schedule('nadhir-ingest', '*/10 * * * *', $$select private.nadhir_cron_call('/api/public/cron/ingest')$$);
select cron.schedule('nadhir-risk',   '0 6 * * *',    $$select private.nadhir_cron_call('/api/public/cron/risk')$$);
select cron.schedule('nadhir-alerts', '5,20,35,50 * * * *', $$select private.nadhir_cron_call('/api/public/cron/alerts')$$);
