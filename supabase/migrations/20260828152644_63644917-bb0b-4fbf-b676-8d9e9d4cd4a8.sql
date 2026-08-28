create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.nadhir_cron_call(_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'nadhir_cron_token';
  perform net.http_post(
    url := 'https://project--c0eef65a-a6c2-41c6-b6b5-ecce44af480d-dev.lovable.app' || _path,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || s),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end $$;

revoke all on function private.nadhir_cron_call(text) from public, anon, authenticated;

drop function if exists public.nadhir_cron_call(text);

select cron.unschedule(jobname) from cron.job where jobname in ('nadhir-ingest','nadhir-risk','nadhir-alerts');
select cron.schedule('nadhir-ingest', '*/15 * * * *', $$select private.nadhir_cron_call('/api/public/cron/ingest')$$);
select cron.schedule('nadhir-risk', '20 */3 * * *', $$select private.nadhir_cron_call('/api/public/cron/risk')$$);
select cron.schedule('nadhir-alerts', '5,35 * * * *', $$select private.nadhir_cron_call('/api/public/cron/alerts')$$);