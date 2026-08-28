create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'nadhir_cron_token') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'nadhir_cron_token');
  end if;
end $$;

create or replace function public.nadhir_cron_call(_path text)
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

revoke all on function public.nadhir_cron_call(text) from public;
revoke all on function public.nadhir_cron_call(text) from anon;
revoke all on function public.nadhir_cron_call(text) from authenticated;

select cron.unschedule(jobname) from cron.job where jobname in ('nadhir-ingest','nadhir-risk','nadhir-alerts');
select cron.schedule('nadhir-ingest', '*/15 * * * *', $$select public.nadhir_cron_call('/api/public/cron/ingest')$$);
select cron.schedule('nadhir-risk', '20 */3 * * *', $$select public.nadhir_cron_call('/api/public/cron/risk')$$);
select cron.schedule('nadhir-alerts', '5,35 * * * *', $$select public.nadhir_cron_call('/api/public/cron/alerts')$$);