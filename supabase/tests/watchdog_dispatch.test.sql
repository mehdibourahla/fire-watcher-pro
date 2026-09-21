begin;
set local search_path = public, extensions;
select no_plan();

delete from vault.secrets where name in ('github_dispatch_token', 'github_repo');
select throws_ok($$select private.dispatch_external_watchdog()$$,
 'P0001', 'external watchdog dispatch credentials missing', 'missing credentials fail loudly in cron history');
select vault.create_secret('test-watchdog-token', 'github_dispatch_token');
select throws_ok($$select private.dispatch_external_watchdog()$$,
 'P0001', 'external watchdog dispatch credentials missing', 'missing repository never queues a request');
select vault.create_secret('mehdibourahla/fire-watcher-pro', 'github_repo');
create temp table watchdog_request as select private.dispatch_external_watchdog() as id;
select is((select count(*)::integer from net.http_request_queue q join watchdog_request r using(id)),
 1, 'one invocation queues one request');
select is((select url from net.http_request_queue q join watchdog_request r using(id)),
 'https://api.github.com/repos/mehdibourahla/fire-watcher-pro/dispatches', 'dispatch targets the configured repository');
select is((select convert_from(body, 'UTF8')::jsonb from net.http_request_queue q join watchdog_request r using(id)),
 '{"event_type":"external-watchdog"}'::jsonb, 'dispatch selects only the watchdog workflow');
select is((select headers->>'Authorization' from net.http_request_queue q join watchdog_request r using(id)),
 'Bearer test-watchdog-token', 'dispatch uses the existing vault credential');
select is((select timeout_milliseconds from net.http_request_queue q join watchdog_request r using(id)),
 15000, 'outbound request is bounded');
select ok(not has_function_privilege('anon', 'private.dispatch_external_watchdog()', 'EXECUTE'), 'anonymous cannot dispatch');
select ok(not has_function_privilege('authenticated', 'private.dispatch_external_watchdog()', 'EXECUTE'), 'signed-in users cannot dispatch');
select ok(not has_function_privilege('service_role', 'private.dispatch_external_watchdog()', 'EXECUTE'), 'service role cannot dispatch');
select is((select schedule from cron.job where jobname='nadhir-external-watchdog'),
 '7,22,37,52 * * * *', 'database supplies an independent fifteen-minute trigger');
select is((select command from cron.job where jobname='nadhir-external-watchdog'),
 'select private.dispatch_external_watchdog()', 'cron invokes the tested dispatcher');
select * from finish();
rollback;
